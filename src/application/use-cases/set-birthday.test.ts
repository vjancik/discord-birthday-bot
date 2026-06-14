import { beforeEach, describe, expect, test } from "bun:test";
import { BirthDate } from "../../domain/birth-date.ts";
import { BirthDateChangeCooldownError } from "../../domain/errors.ts";
import { Timezone } from "../../domain/timezone.ts";
import type {
	AuditEvent,
	AuditLogPublisher,
} from "../ports/audit-log-publisher.ts";
import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";
import { SetBirthdayUseCase } from "./set-birthday.ts";

class InMemoryRepo implements BirthdayRepository {
	private records = new Map<string, BirthdayRecord>();

	findByUserId(userId: string): BirthdayRecord | null {
		return this.records.get(userId) ?? null;
	}

	upsert(params: {
		userId: string;
		birthDate: BirthDate;
		timezone: Timezone;
		nextTriggerAtUtc: number;
		now: number;
		lastBirthDateChangeAtUtc: number | null;
	}): void {
		const existing = this.records.get(params.userId);
		this.records.set(params.userId, {
			userId: params.userId,
			day: params.birthDate.day,
			month: params.birthDate.month,
			year: params.birthDate.year,
			timezone: params.timezone.ianaId,
			nextTriggerAtUtc: params.nextTriggerAtUtc,
			lastPostedAtUtc: existing?.lastPostedAtUtc ?? null,
			lastBirthDateChangeAtUtc: params.lastBirthDateChangeAtUtc,
			createdAt: existing?.createdAt ?? params.now,
			updatedAt: params.now,
		});
	}

	delete(userId: string): void {
		this.records.delete(userId);
	}

	findDue(nowUtcMillis: number): BirthdayRecord[] {
		return [...this.records.values()].filter(
			(r) => r.nextTriggerAtUtc <= nowUtcMillis,
		);
	}

	findNextUpcoming(nowUtcMillis: number): BirthdayRecord | null {
		const upcoming = [...this.records.values()]
			.filter((r) => r.nextTriggerAtUtc > nowUtcMillis)
			.sort((a, b) => a.nextTriggerAtUtc - b.nextTriggerAtUtc);
		return upcoming[0] ?? null;
	}

	reschedule(
		userId: string,
		nextTriggerAtUtc: number,
		lastPostedAtUtc: number | null,
	): void {
		const r = this.records.get(userId);
		if (r === undefined) return;
		this.records.set(userId, { ...r, nextTriggerAtUtc, lastPostedAtUtc });
	}
}

class SpyAuditLog implements AuditLogPublisher {
	readonly events: AuditEvent[] = [];
	async publish(event: AuditEvent): Promise<void> {
		this.events.push(event);
	}
	async publishSystem(_message: string): Promise<void> {}
}

function fixedClock(ms: number): Clock {
	return { nowUtcMillis: () => ms };
}

describe("SetBirthdayUseCase", () => {
	let repo: InMemoryRepo;
	let auditLog: SpyAuditLog;
	const NOW = 1_700_000_000_000; // fixed timestamp

	beforeEach(() => {
		repo = new InMemoryRepo();
		auditLog = new SpyAuditLog();
	});

	test("creates a new record and returns created=true", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("24.12.", "1990");
		const tz = Timezone.resolve("Europe/Prague");

		const result = await useCase.execute("123", bd, tz, "discord");

		expect(result.created).toBe(true);
		const record = repo.findByUserId("123");
		expect(record?.day).toBe(24);
		expect(record?.month).toBe(12);
		expect(record?.year).toBe(1990);
		expect(record?.timezone).toBe("Europe/Prague");
	});

	test("updates an existing record and returns created=false", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("01.01.", null);
		const tz = Timezone.resolve("Europe/Prague");
		// Use cli source to bypass cooldown in this structural test
		await useCase.execute("123", bd, tz, "cli");

		const bd2 = BirthDate.parse("24.12.", null);
		const result = await useCase.execute("123", bd2, tz, "cli");

		expect(result.created).toBe(false);
		const record = repo.findByUserId("123");
		expect(record?.day).toBe(24);
	});

	test("computes nextTriggerAtUtc in the future", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		await useCase.execute("123", bd, tz, "discord");

		const record = repo.findByUserId("123");
		expect(record?.nextTriggerAtUtc).toBeGreaterThan(NOW);
	});

	test("publishes 'add' audit event on creation", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("24.12.", "1990");
		const tz = Timezone.resolve("Europe/Prague");
		await useCase.execute("123", bd, tz, "cli");

		expect(auditLog.events).toHaveLength(1);
		expect(auditLog.events[0]?.action).toBe("add");
		expect(auditLog.events[0]?.source).toBe("cli");
		expect(auditLog.events[0]?.userId).toBe("123");
		expect(auditLog.events[0]?.timezone).toBe("Europe/Prague");
	});

	test("publishes 'update' audit event on modification", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("01.01.", null);
		const tz = Timezone.resolve("Europe/Prague");
		// Use cli source to bypass cooldown in this audit-event structural test
		await useCase.execute("123", bd, tz, "cli");
		auditLog.events.length = 0;

		await useCase.execute("123", BirthDate.parse("24.12.", null), tz, "cli");
		expect(auditLog.events[0]?.action).toBe("update");
	});

	test("initial set records lastBirthDateChangeAtUtc = now", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		await useCase.execute("123", bd, tz, "discord");

		const record = repo.findByUserId("123");
		expect(record?.lastBirthDateChangeAtUtc).toBe(NOW);
	});

	test("cooldown: throws BirthDateChangeCooldownError when discord user changes birth date within 14 days", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd1 = BirthDate.parse("01.01.", null);
		const bd2 = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");

		// First set
		await useCase.execute("123", bd1, tz, "discord");

		// Immediately try to change birth date — still within 14-day cooldown
		await expect(
			useCase.execute("123", bd2, tz, "discord"),
		).rejects.toBeInstanceOf(BirthDateChangeCooldownError);

		// Record should be unchanged
		const record = repo.findByUserId("123");
		expect(record?.day).toBe(1);
	});

	test("cooldown: publishes update_rejected audit event on cooldown rejection", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd1 = BirthDate.parse("01.01.", null);
		const bd2 = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");

		await useCase.execute("123", bd1, tz, "discord");
		auditLog.events.length = 0;

		await useCase.execute("123", bd2, tz, "discord").catch(() => undefined);

		expect(auditLog.events).toHaveLength(1);
		expect(auditLog.events[0]?.action).toBe("update_rejected");
	});

	test("cooldown: cli source bypasses cooldown check", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd1 = BirthDate.parse("01.01.", null);
		const bd2 = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");

		await useCase.execute("123", bd1, tz, "cli");
		// Immediately change via CLI — should succeed regardless of cooldown
		const result = await useCase.execute("123", bd2, tz, "cli");
		expect(result.created).toBe(false);
		const record = repo.findByUserId("123");
		expect(record?.day).toBe(24);
	});

	test("cooldown: tz-only edit within 14 days succeeds and preserves lastBirthDateChangeAtUtc", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("24.12.", null);
		const tz1 = Timezone.resolve("Europe/Prague");
		const tz2 = Timezone.resolve("America/New_York");

		await useCase.execute("123", bd, tz1, "discord");
		const afterFirst = repo.findByUserId("123")?.lastBirthDateChangeAtUtc;

		// Tz-only change — no birth date change, no cooldown
		await useCase.execute("123", bd, tz2, "discord");

		const record = repo.findByUserId("123");
		expect(record?.timezone).toBe("America/New_York");
		expect(record?.lastBirthDateChangeAtUtc).toBe(afterFirst); // unchanged
	});

	test("forwards userName to audit event on creation", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		await useCase.execute("123", bd, tz, "discord", "Vix (@coolvix)");

		expect(auditLog.events[0]?.userName).toBe("Vix (@coolvix)");
	});

	test("forwards userName to update_rejected audit event", async () => {
		const useCase = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		const bd1 = BirthDate.parse("01.01.", null);
		const bd2 = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");

		await useCase.execute("123", bd1, tz, "discord", "Vix (@coolvix)");
		auditLog.events.length = 0;

		await useCase
			.execute("123", bd2, tz, "discord", "Vix (@coolvix)")
			.catch(() => undefined);

		expect(auditLog.events[0]?.action).toBe("update_rejected");
		expect(auditLog.events[0]?.userName).toBe("Vix (@coolvix)");
	});

	test("cooldown: birth date change allowed after 14 days", async () => {
		const FOURTEEN_DAYS_LATER = NOW + 14 * 24 * 60 * 60 * 1000 + 1;
		const bd1 = BirthDate.parse("01.01.", null);
		const bd2 = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");

		const useCase1 = new SetBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		await useCase1.execute("123", bd1, tz, "discord");

		const useCase2 = new SetBirthdayUseCase(
			repo,
			auditLog,
			fixedClock(FOURTEEN_DAYS_LATER),
		);
		const result = await useCase2.execute("123", bd2, tz, "discord");

		expect(result.created).toBe(false);
		const record = repo.findByUserId("123");
		expect(record?.day).toBe(24);
		expect(record?.lastBirthDateChangeAtUtc).toBe(FOURTEEN_DAYS_LATER);
	});
});
