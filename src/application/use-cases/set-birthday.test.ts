import { beforeEach, describe, expect, test } from "bun:test";
import { BirthDate } from "../../domain/birth-date.ts";
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
		await useCase.execute("123", bd, tz, "discord");

		const bd2 = BirthDate.parse("24.12.", null);
		const result = await useCase.execute("123", bd2, tz, "discord");

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
		await useCase.execute("123", bd, tz, "discord");
		auditLog.events.length = 0;

		await useCase.execute(
			"123",
			BirthDate.parse("24.12.", null),
			tz,
			"discord",
		);
		expect(auditLog.events[0]?.action).toBe("update");
	});
});
