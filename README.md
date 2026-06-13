# Discord Birthday Bot

A self-hosted Discord bot that lets server members register their birthday and timezone. At noon on their birthday — in their own local timezone, DST-correct across years — the bot posts a personalised birthday message in a configured channel. All data changes are audited to a separate log channel.

## Features

- `/birthday_add` — modal form to register or update your birthday (day/month, optional year, timezone)
  - Pre-populates the form with existing values when updating
  - Accepts city names (`Prague`), country names (`Germany`), or full IANA zone IDs (`Europe/Berlin`)
- `/birthday_remove` — removes your birthday record, with a confirmation prompt
- Birthday announcements posted at **noon in the user's local timezone**, DST-correct for every future year
- Feb 29 birthdays are gracefully handled — announced on Feb 28 in non-leap years
- Audit log channel receives a message on every add, update, remove, and bot lifecycle event
- CLI scripts for manual database administration without needing Discord
- Persistent storage via SQLite; migrations run automatically at startup

## Requirements

- [Bun](https://bun.sh) v1.3+ — or Docker (no host Bun required)
- A Discord application with a bot token

---

## Discord application setup

### 1. Create the application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name, then open the **Bot** tab.
3. Click **Reset Token** and copy the token — this is your `DISCORD_TOKEN`.
4. Under **Privileged Gateway Intents**, no extra intents are required. The bot only needs the default `Guilds` intent.
5. On the **OAuth2** tab, copy the **Application ID** — this is your `DISCORD_CLIENT_ID`.

### 2. Invite the bot to your server

Use the **OAuth2 → URL Generator** in the Developer Portal. Select the following scopes and permissions:

- **Scopes:** `bot`, `applications.commands`
- **Bot permissions:** `Send Messages`

Copy and open the generated URL to invite the bot to your server.

### 3. Get channel IDs

Enable **Developer Mode** in Discord settings (**Advanced** → **Developer Mode**), then right-click any channel and select **Copy Channel ID**.

You need two channels:
- One for birthday announcements (`BIRTHDAY_POST_CHANNEL`)
- One for the audit log (`BD_BOT_LOG_CHANNEL`) — can be a private staff channel

---

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```env
# Discord bot credentials
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here

# Optional: set for guild-scoped command registration (instant propagation, good for dev)
# Omit for global registration (can take up to 1 hour to propagate)
GUILD_ID=

# Channel IDs
BIRTHDAY_POST_CHANNEL=channel-id-for-birthday-messages
BD_BOT_LOG_CHANNEL=channel-id-for-audit-log

# Optional: database path (defaults to ./data/birthdays.sqlite)
DB_FILE_PATH=./data/birthdays.sqlite

# Set to 'production' for JSON log output, leave as 'development' for pretty logs
NODE_ENV=development
```

---

## Deployment with Docker (recommended)

Docker is the recommended way to host the bot. No host-side Bun installation is needed.

### 1. Build and start

```bash
docker compose up --build -d
```

Or using the package.json script:

```bash
bun run prod:up
```

### 2. Register slash commands

Run once after the first deploy, or whenever commands change:

```bash
docker compose exec app bun run register-commands
```

### 3. Check logs

```bash
docker compose logs -f app
```

### 4. Stop

```bash
docker compose down
# or
bun run prod:down
```

### Persistent data

The SQLite database is stored in `./data/` on the host via a bind mount:

```
./data/  →  /usr/src/app/data/  (inside container)
```

The container runs as the `bun` user (uid 999), so files in `./data/` will be owned by that uid on the host. To inspect the database from the host without `sudo`:

```bash
sudo sqlite3 ./data/birthdays.sqlite ".tables"
```

---

## Manual administration (CLI scripts)

The `scripts/` directory contains CLI tools for directly managing birthday records. They use the same validation and domain logic as the Discord commands.

Run against a live container:

```bash
# Add or update a birthday
docker compose exec app bun run birthday:add <userId> <DD.MM.> <timezone> [year]
docker compose exec app bun run birthday:add 123456789012345678 24.12. Prague 1990

# Remove a birthday
docker compose exec app bun run birthday:remove <userId>
docker compose exec app bun run birthday:remove 123456789012345678
```

If the container is not running, use `docker compose run --rm` instead:

```bash
docker compose run --rm app bun run birthday:add 123456789012345678 24.12. Prague 1990
```

To get a user's Discord ID, enable **Developer Mode** in Discord settings and right-click their username → **Copy User ID**.

---

## Local development (without Docker)

```bash
bun install
cp .env.example .env   # fill in your values
bun run register-commands
bun run dev            # starts with --watch for auto-reload
```

Run tests:

```bash
bun test
```

Type checking and linting:

```bash
bun run typecheck
bun run codecheck:fix
```

---

## Timezone input

The timezone field accepts:

| Input | Resolves to |
|---|---|
| `Europe/Prague` | `Europe/Prague` (exact IANA ID) |
| `prague` | `Europe/Prague` (city name) |
| `New York` | `America/New_York` |
| `Germany` | `Europe/Berlin` |
| `UK` | `Europe/London` |
| `UAE` | `Asia/Dubai` |

If the input cannot be resolved, the bot replies with an error and a hint. The resolved IANA zone ID is stored — never a UTC offset — so DST transitions in future years are handled correctly automatically.

---

## License

MIT
