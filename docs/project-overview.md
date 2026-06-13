# Birthday Bot — Project Overview

A Discord bot that lets server members register their birthday and timezone. At noon in their chosen timezone on their birth date, the bot posts a personalised birthday message in a configured channel. All data changes are audited to a separate log channel.

---

## Table of contents

1. [Architecture](#architecture)
2. [Layer by layer](#layer-by-layer)
3. [Interaction flows](#interaction-flows)
4. [Scheduler](#scheduler)
5. [Time and DST handling](#time-and-dst-handling)
6. [Database schema](#database-schema)
7. [Configuration](#configuration)
8. [CLI scripts](#cli-scripts)
9. [Tests](#tests)
10. [Trade-offs and possible enhancements](#trade-offs-and-possible-enhancements)

---

## Architecture

The project follows hexagonal architecture (ports and adapters) with domain-driven design principles. The key idea is that the core business logic — validation, scheduling logic, announcement formatting — knows nothing about Discord, SQLite, or any I/O. Those details live in adapters that plug into the core through typed interfaces (ports).

```
src/index.ts                      ← composition root: wires everything together
├── src/domain/                   ← pure business logic, no I/O dependencies
├── src/application/
│   ├── ports/                    ← interfaces the domain requires of the outside world
│   └── use-cases/                ← orchestrate domain + ports; one action per file
├── src/infrastructure/           ← driven adapters: implement the ports
│   ├── config/
│   ├── db/
│   ├── discord/
│   └── logging/
├── src/adapters/                 ← driving adapters: receive external events (Discord interactions, setInterval)
│   ├── discord/
│   └── scheduler/
└── scripts/                      ← standalone CLI entrypoints
```

Dependency direction: `adapters → application → domain`. Nothing in `domain/` or `application/` imports from `infrastructure/` or `adapters/`. This means every use case and domain object is testable with plain in-memory fakes — no Discord connection or SQLite file required.

---

## Layer by layer

### Domain (`src/domain/`)

**`errors.ts`** — base `AppError` and all typed subclasses:

| Class | When thrown |
|---|---|
| `InvalidBirthDateError` | Unparseable or out-of-range date/month/day/year |
| `InvalidTimezoneError` | Input cannot be resolved to an IANA zone |
| `BirthdayNotFoundError` | Remove attempted for a user with no record |
| `MissingEnvVarError` | One or more required env vars absent at startup |
| `ConfigError` | General startup configuration problem |

All extend `AppError` which sets `this.name` from the constructor name, making `instanceof` checks reliable even through transpilation.

**`birth-date.ts`** — `BirthDate` value object. The only way to create one is `BirthDate.parse(dayMonthRaw, yearRaw)`.

- Accepts `DD.MM.`, `DD.MM`, `D.M.` — flexible enough for user input, strict enough to catch nonsense.
- Day validation uses a fixed `DAYS_IN_MONTH` array that allows Feb 29 (a leap-year birthday is a valid thing to store; the non-leap-year adjustment happens at trigger-computation time, not here).
- Year is a separate field, entirely optional (`null` when omitted or whitespace). Stored and displayed alongside the date in audit logs but the bot never needs it to post a birthday.
- `format()` → zero-padded `"DD.MM."`. Used for modal prefill and confirmation messages.
- `formatWithYear()` → `"DD.MM."` or `"DD.MM.YYYY"` depending on whether year is present. Used in audit log entries.

**`timezone.ts`** — `Timezone` value object. Resolution order in `Timezone.resolve(input)`:

1. **Exact match** (case-insensitive) against `Intl.supportedValuesOf('timeZone')`. Accepts `Europe/Prague`, `europe/prague`, `America/New_York`, etc.
2. **Manual alias map** — ~60 country/colloquial names that don't correspond to a single IANA city segment: `"uk"` → `Europe/London`, `"czechia"` → `Europe/Prague`, `"uae"` → `Asia/Dubai`, etc.
3. **City match** — lazy-built map from the last path segment of every supported zone with underscores replaced by spaces: `"prague"` → `Europe/Prague`, `"new york"` → `America/New_York`. First match wins (alphabetical ordering from `Intl.supportedValuesOf`).
4. Throws `InvalidTimezoneError` with a hint message if nothing matched.

The resolved value is always a canonical IANA zone string (e.g. `"Europe/Prague"`). This is what is stored in the database — never a UTC offset. This is intentional: an offset like `+01:00` would be wrong for half the year in zones that observe DST.

**`next-occurrence.ts`** — two pure functions:

- `nextOccurrenceUtc(birthDate, timezone, afterUtcMillis)` — returns the epoch-ms timestamp of the next noon local time in the given zone on the birthday date, strictly after `afterUtcMillis`. Tries the current year then next year; has a year+2 fallback for the edge case where `afterUtcMillis` is exactly equal to the trigger. Feb 29 in a non-leap year is silently adjusted to Feb 28.
- `isSameBirthdayLocalDay(birthDate, timezone, utcMillis)` — returns `true` if the given UTC moment falls on the birthday's local calendar day in the given timezone. Used by the scheduler's catch-up policy. Feb 29 birthdays match local Feb 28 in non-leap years.

**`well-wishes.ts`** — `WELL_WISHES` (10-entry `as const` tuple) and `formatAnnouncement(userId, random)`. The `RandomSource` port is injected so tests can use a deterministic stub instead of `Math.random()`.

---

### Application — ports (`src/application/ports/`)

Typed interfaces that describe what the application layer needs from infrastructure. Nothing here is concrete.

| Port | Description |
|---|---|
| `BirthdayRepository` | CRUD + `findDue(nowMs)` + `reschedule(userId, nextTrigger, lastPosted)` |
| `AuditLogPublisher` | `publish(event)` for user data changes; `publishSystem(message)` for bot lifecycle events (startup, shutdown, gateway errors) |
| `AnnouncementPublisher` | `publishBirthday(content, signal)` — posts to the birthday channel; `signal` is an `AbortSignal` that cancels the REST call if the scheduler tick times out |
| `Clock` | `nowUtcMillis()` — abstracted so tests can control "now" |
| `RandomSource` | `next()` returns `[0,1)` — abstracted so tests can pin message selection |

---

### Application — use cases (`src/application/use-cases/`)

Each file is one user-facing action. Use cases receive all their dependencies through constructor injection (DIP), making them independently testable.

**`SetBirthdayUseCase`** — create or update a birthday record.
1. Checks whether a record already exists to determine if this is a create or update.
2. Calls `nextOccurrenceUtc` to compute the first trigger time.
3. Upserts via the repository.
4. Publishes an `"add"` or `"update"` audit event.
5. Returns `{ created: boolean }` so callers can vary their confirmation message.

**`GetBirthdayUseCase`** — thin wrapper around `repo.findByUserId`. Exists as a named use case to keep the adapter layer free of direct repository imports.

**`RemoveBirthdayUseCase`** — deletes a record, throws `BirthdayNotFoundError` if none exists, publishes a `"remove"` audit event.

**`RunDueBirthdaysUseCase`** — the scheduler tick. See [Scheduler](#scheduler) for the full algorithm.

---

### Infrastructure (`src/infrastructure/`)

**`config/env.ts`** — `loadConfig()` collects *all* missing required env vars before throwing a single `MissingEnvVarError` listing them, so you don't fix one and discover the next on the next run.

**`logging/logger.ts`** — pino factory. Uses the programmatic `pino(opts, prettyStream)` form in non-production because the worker-thread transport form (`transport: { target: 'pino-pretty' }`) is unreliable under Bun. JSON output in `NODE_ENV=production`.

**`db/schema.ts`** — single `birthdays` table (see [Database schema](#database-schema)).

**`db/client.ts`** — creates the database, ensures the `data/` directory exists, then immediately runs migrations via `drizzle-orm/bun-sqlite/migrator`. This happens in every entrypoint (bot startup and CLI scripts), so the schema is always up to date regardless of which process touches the DB file first.

**`db/drizzle-birthday-repository.ts`** — `DrizzleBirthdayRepository` implements `BirthdayRepository`. `upsert` uses `onConflictDoUpdate` targeting the primary key. `createdAt` is preserved by reading the existing record before upserting. `reschedule` is a targeted `UPDATE` of only the two trigger columns so the scheduler never accidentally overwrites user-entered data.

**`discord/rest-audit-log-publisher.ts`** — posts audit messages to `BD_BOT_LOG_CHANNEL` via the Discord REST API (no gateway connection required). Used by both the gateway bot and the CLI scripts. Publish failures are caught and logged — the DB mutation already succeeded and should not be rolled back because an audit message failed to send.

**`discord/rest-announcement-publisher.ts`** — posts birthday messages to `BIRTHDAY_POST_CHANNEL` via REST.

---

### Discord adapters (`src/adapters/discord/`)

**`custom-ids.ts`** — all customIds in one place. Button and modal IDs carry a *nonce* (the originating `interaction.id`) so each ephemeral flow is isolated to a single user invocation and collector filters are exact.

**`birthday-modal.ts`** — `buildBirthdayModal(modalId, prefill?)` builds the 3-field modal. `parseModalSubmit(interaction)` extracts the raw strings and runs them through `BirthDate.parse` and `Timezone.resolve` — the same functions used by the CLI scripts.

**`birthday-add.handler.ts`** — implements the full `/birthday_add` flow (see [Interaction flows](#interaction-flows)).

**`birthday-remove.handler.ts`** — implements the `/birthday_remove` flow.

**`interaction-router.ts`** — single `Events.InteractionCreate` listener that dispatches to the correct handler by `commandName`. Catches and logs any unhandled errors so the process doesn't crash.

---

### Scheduler adapter (`src/adapters/scheduler/interval-scheduler.ts`)

Wraps `RunDueBirthdaysUseCase` in a 30-second `setInterval`. A boolean `running` flag prevents re-entrant ticks if the DB or REST call takes longer than the interval. `start()` also fires one immediate tick so missed birthdays are processed on restart without waiting up to 30 seconds.

---

## Interaction flows

### `/birthday_add` — new user

```
User invokes /birthday_add
  └─ No existing record found
       └─ showModal() ← must be the first response; satisfies the 3-second ack window
            └─ User fills in form and submits
                 └─ parseModalSubmit()
                      ├─ Success → SetBirthdayUseCase → ephemeral confirmation
                      └─ Validation error → ephemeral error message (same text as CLI)
```

### `/birthday_add` — existing user

```
User invokes /birthday_add
  └─ Existing record found
       └─ Ephemeral reply: "Already configured, update?" + Yes/No buttons
            ├─ No → update reply to "Okay, nothing changed."
            ├─ Timeout (60s) → editReply to "Timed out."
            └─ Yes → buttonInteraction.showModal() with prefill values
                  └─ editReply to clear the buttons
                       └─ User fills in form (values pre-populated)
                            └─ parseModalSubmit() → SetBirthdayUseCase → ephemeral confirmation
```

A key constraint: `showModal()` must be the *first* response to an interaction (within 3 seconds). In the new-user flow the modal acks the slash command directly. In the update flow the modal acks the *button* interaction — the slash command interaction was already acked by the ephemeral reply.

### `/birthday_remove`

```
User invokes /birthday_remove
  ├─ No record → ephemeral "Your birthday isn't set yet."
  └─ Record exists → ephemeral "Are you sure?" + Yes/No buttons
       ├─ No → update reply to "No changes made."
       ├─ Timeout (60s) → editReply to "Timed out."
       └─ Yes → RemoveBirthdayUseCase → update reply to "Your birthday has been removed."
```

All replies are ephemeral (`MessageFlags.Ephemeral`). Collectors use `awaitMessageComponent` on the fetched reply message (not on the interaction itself — `ChatInputCommandInteraction` does not have `awaitMessageComponent`). All collector promises are caught so a timeout rejection does not produce an unhandled rejection.

---

## Scheduler

`IntervalScheduler` drives `RunDueBirthdaysUseCase` every 30 seconds and immediately at startup.

Each tick:

1. `repo.findDue(now)` — `SELECT ... WHERE next_trigger_at_utc <= now` (indexed).
2. For each due row, reconstruct the `BirthDate` and `Timezone` value objects from stored columns.
3. **Catch-up policy** — `isSameBirthdayLocalDay(birthDate, timezone, now)`: if the local date in the user's zone is still the birthday, post; if the bot was down past local midnight, skip posting (but still reschedule).
4. **Double-post guard** — if `lastPostedAtUtc` is already on the same local calendar day as `now`, skip. Prevents double-posting if `reschedule` is called but the process crashes before updating `lastPostedAtUtc` (belt-and-suspenders alongside the at-most-once ordering).
5. **Post, then reschedule** — the announcement REST call is made first. Only after it succeeds is `repo.reschedule(userId, nextTrigger, now)` called to advance the trigger and record `lastPostedAtUtc`. If the REST call fails (network error, Discord outage), the row is left untouched so the next tick can retry — **at-least-once** delivery. The double-post guard (step 4) prevents a duplicate if the process retries within the same local calendar day.
6. An `AbortSignal` tied to `TICK_INTERVAL_MS` is passed to the publisher. If a REST call is still in-flight when the abort fires, it is cancelled — preventing a slow previous-tick response from triggering a `reschedule` after a newer tick has already started.

`nextOccurrenceUtc` always returns a value strictly greater than `now`, so rescheduling always moves the trigger forward.

---

## Time and DST handling

The core invariant is: **store IANA timezone IDs, compute UTC instants at the last possible moment using Luxon**.

Storing a raw offset like `+01:00` would be wrong for Europe/Prague from late March to late October (when it becomes `+02:00`). Storing the IANA id and computing `DateTime.fromObject({ hour: 12 }, { zone: 'Europe/Prague' })` lets Luxon resolve the correct UTC instant for any future date, accounting for whatever DST rules apply in that year.

Concretely: for a user in `Europe/Prague`:
- A birthday in January triggers at `11:00 UTC` (UTC+1 in winter).
- A birthday in July triggers at `10:00 UTC` (UTC+2 in summer).
- `nextOccurrenceUtc` always produces the right answer without any manual DST arithmetic.

**Feb 29 birthdays** are handled in two places:
- `nextOccurrenceUtc` — when building the candidate date for a non-leap year, `DateTime.fromObject({ day: 29, month: 2 })` returns an invalid DateTime; the code detects this and retries with `day: 28`.
- `isSameBirthdayLocalDay` — in the catch-up check, Feb 28 in a non-leap year is treated as a match for a Feb 29 birthday (but only in a non-leap year; in a leap year Feb 28 is correctly rejected so the bot waits for Feb 29 itself).

---

## Database schema

Single table `birthdays` in `./data/birthdays.sqlite` (path configurable via `DB_FILE_PATH`).

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | Discord snowflake stored as string — never cast to Number (exceeds JS safe integer range) |
| `day` | INTEGER NOT NULL | 1–31 |
| `month` | INTEGER NOT NULL | 1–12 |
| `year` | INTEGER NULL | Optional; bot functions correctly without it |
| `timezone` | TEXT NOT NULL | IANA zone id, e.g. `Europe/Prague` |
| `next_trigger_at_utc` | INTEGER NOT NULL | Epoch milliseconds; **indexed** |
| `last_posted_at_utc` | INTEGER NULL | Epoch ms of the last successful post; used for the double-post guard |
| `created_at` | INTEGER NOT NULL | Epoch ms |
| `updated_at` | INTEGER NOT NULL | Epoch ms |

The index on `next_trigger_at_utc` makes the scheduler query (`WHERE next_trigger_at_utc <= now`) fast regardless of table size.

Migrations live in `drizzle/` and are generated by `drizzle-kit`. They are applied programmatically at startup via `drizzle-orm/bun-sqlite/migrator` rather than as a separate `drizzle-kit push` step — this means the DB is always at the correct schema version when any entrypoint (bot or CLI script) opens it.

---

## Configuration

All config is loaded at startup from environment variables (`.env` is auto-loaded by Bun). Missing required vars fail immediately with a single error listing all absent names.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_TOKEN` | Yes | — | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | — | Application ID |
| `GUILD_ID` | No | — | If set, slash commands are registered guild-scoped (instant); if absent, global (up to 1 hour propagation) |
| `BIRTHDAY_POST_CHANNEL` | Yes | — | Channel ID where birthday messages are posted |
| `BD_BOT_LOG_CHANNEL` | Yes | — | Channel ID for audit log (add/update/remove events) |
| `DB_FILE_PATH` | No | `./data/birthdays.sqlite` | Path to SQLite database file |
| `NODE_ENV` | No | `development` | Set to `production` for JSON log output |

---

## CLI scripts

Two scripts that bypass Discord and operate directly on the database. Both go through the same domain validation and use cases as the Discord interaction handlers — error messages are identical.

**`scripts/birthday-add.ts`**

```
bun scripts/birthday-add.ts <userId> <DD.MM.> <timezone> [year]
# e.g.
bun scripts/birthday-add.ts 123456789012345678 24.12. Prague 1990
```

Creates or updates a birthday record and posts an audit event to `BD_BOT_LOG_CHANNEL` via REST.

**`scripts/birthday-remove.ts`**

```
bun scripts/birthday-remove.ts <userId>
# e.g.
bun scripts/birthday-remove.ts 123456789012345678
```

Removes a birthday record and posts an audit event. Prints a friendly error and exits with code 1 if the user has no record.

**`scripts/register-commands.ts`**

```
bun run register-commands
```

Registers the two slash commands via REST. Uses guild-scoped registration if `GUILD_ID` is set (changes are instant, useful for development), otherwise registers globally.

---

## Tests

70 tests across 8 files, all colocated next to the unit they test. Run with `bun test`.

| File | What it covers |
|---|---|
| `src/domain/birth-date.test.ts` | Parsing (all format variants, valid/invalid days/months, year range), `format()`, `isFeb29()`, error message text |
| `src/domain/timezone.test.ts` | Exact IANA match, city lookup, manual aliases, whitespace trimming, error message content |
| `src/domain/next-occurrence.test.ts` | Correct UTC for DST (winter vs. summer), next-year wrap, Feb 29 leap/non-leap, boundary (trigger == after → next year) |
| `src/domain/well-wishes.test.ts` | Exactly 10 messages, random index selection at bounds, output format |
| `src/application/use-cases/set-birthday.test.ts` | Create vs. update return value, trigger computed in future, audit events with correct action/source |
| `src/application/use-cases/run-due-birthdays.test.ts` | Happy path post+reschedule, missed-midnight skip-but-reschedule, double-post guard, at-least-once (trigger unchanged when POST fails so next tick can retry) |
| `src/infrastructure/config/env.test.ts` | All vars present, multiple missing → single error, optional var defaults |
| `src/infrastructure/db/drizzle-birthday-repository.test.ts` | upsert/find/delete/findDue/reschedule against an in-memory SQLite (`:memory:`), `createdAt` immutability, null year storage |

The Discord interaction handlers are not unit-tested because they are tightly coupled to the discord.js object model. The value-bearing logic (parsing, validation, use case execution) is covered by the layers below.

---

## Trade-offs and possible enhancements

### Scheduling precision

The scheduler polls every **30 seconds**, so a birthday message can arrive up to 30 seconds late relative to local noon. This is intentional — a bot process restart also executes an immediate tick, bounding late delivery at `restart_delay + 30s`.

Possible enhancement: reduce the interval to 10 seconds for near-exact noon delivery, or switch to a dynamic `setTimeout` computed from `nextOccurrenceUtc - Date.now()` when the next trigger is within a threshold (e.g. 5 minutes). The current polling approach is simpler, more restart-resilient, and the 30-second drift is imperceptible for a birthday greeting.

### Single-process, single-file SQLite

The bot runs as a single process and writes to a single SQLite file. SQLite is more than sufficient for the data volume (one row per registered user, one read per 30-second tick), but it means:

- You cannot run multiple bot instances against the same database file (WAL mode would reduce contention but not eliminate split-brain for trigger scheduling).
- No horizontal scaling.

Possible enhancement: swap `DrizzleBirthdayRepository` for a Postgres implementation (change the Drizzle driver and schema; all use cases remain untouched) if you need multi-instance deployment. The port interface is already the correct abstraction boundary.

### Timezone input UX

The timezone field is a free-text input with a 64-character limit. Discord modals do not support dropdowns, so there's no exhaustive picker. The `Timezone.resolve` logic handles city names, country names, and full IANA ids with a best-effort lookup, but a user typing something genuinely ambiguous (e.g. a city that exists in multiple timezones) will get a deterministic but potentially wrong result.

Possible enhancement: add a `/birthday_timezone_lookup <query>` slash command with autocomplete that surfaces the top matching IANA zones as Discord choices, letting users confirm the exact zone before saving.

### Audit log format

Audit messages are plain-text strings (`[ADD] (discord) user 123…: 24.12.1990, Europe/Prague`) posted to a text channel. They are human-readable but not structured.

Possible enhancement: use Discord embeds with colour coding (green for add, yellow for update, red for remove), a timestamp footer, and a clickable user mention. Or write to an append-only log file for machine parsing.

### Modal validation

Discord modals have no built-in validation beyond `setRequired` and `setMaxLength`. The bot validates on submit and replies with an ephemeral error if the input is invalid. In practice, the modal placeholders and labels make invalid input unlikely but not impossible (e.g. a user typing `31.02.`).

Possible enhancement: for the date field, consider accepting separate day and month fields with numeric constraints, though this uses 2 of the 5 available modal rows and still cannot enforce cross-field constraints like "day must be valid for this month."

### No guild membership check

The bot stores a Discord snowflake user ID without verifying the user is still a member of the guild. If a user leaves the server and their birthday fires, the announcement will include a non-resolving mention (`<@123…>`) rather than a display name.

Possible enhancement: at announcement time, attempt to fetch guild member details via REST and skip or flag the post if the member is no longer present.

### REST audit log from CLI scripts

CLI scripts post to the audit log channel via REST directly. This requires a valid bot token in the environment even when just doing a one-off data fix. If the REST call fails (network down, wrong token), the DB write still succeeds and the failure is printed to stdout.

Possible enhancement: add a `--no-discord` flag to the CLI scripts that skips the REST audit post and only writes to stdout/pino, useful for offline maintenance.

### Feb 29 ambiguity

A user born on Feb 29 will be greeted on Feb 28 in non-leap years. This is the most natural interpretation but it is not announced to the user. The confirmation message after `/birthday_add` shows the date as stored (`29.02.`), which may cause confusion when the greeting arrives on the 28th.

Possible enhancement: add a note to the confirmation message for Feb 29 birthdays: "In non-leap years I'll post on Feb 28."

### No rate-limit awareness

The announcement and audit log publishers use fire-and-forget REST calls with no rate-limit backoff. At the scale of a single community server this is fine, but if many birthdays fall on the same day the bot could hit Discord's per-channel rate limits.

Possible enhancement: wrap the REST publishers with a simple queue that enforces a minimum delay between posts to the same channel.
