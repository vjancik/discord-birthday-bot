import { beforeEach, describe, expect, test } from "bun:test";
import type { BirthDate } from "../../domain/birth-date.ts";
import { BirthdayNotFoundError } from "../../domain/errors.ts";
import type { Timezone } from "../../domain/timezone.ts";
import type {
	AuditEvent,
	AuditLogPublisher,
} from "../ports/audit-log-publisher.ts";
import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";
import { RemoveBirthdayUseCase } from "./remove-birthday.ts";

const NOW = 1_700_000_000_000;

class InMemoryRepo implements BirthdayRepository {
	private records = new Map<string, BirthdayRecord>();

	seed(record: BirthdayRecord): void {
		this.records.set(record.userId, record);
	}

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
		removedAt: number | null;
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
			removedAt: params.removedAt,
			createdAt: existing?.createdAt ?? params.now,
			updatedAt: params.now,
		});
	}

	delete(userId: string, now: number): void {
		const r = this.records.get(userId);
		if (r === undefined) return;
		this.records.set(userId, { ...r, removedAt: now, updatedAt: now });
	}

	findDue(nowUtcMillis: number): BirthdayRecord[] {
		return [...this.records.values()].filter(
			(r) => r.nextTriggerAtUtc <= nowUtcMillis && r.removedAt === null,
		);
	}

	findNextUpcoming(nowUtcMillis: number): BirthdayRecord | null {
		const upcoming = [...this.records.values()]
			.filter((r) => r.nextTriggerAtUtc > nowUtcMillis && r.removedAt === null)
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

function makeActiveRecord(userId: string): BirthdayRecord {
	return {
		userId,
		day: 24,
		month: 12,
		year: null,
		timezone: "Europe/Prague",
		nextTriggerAtUtc: NOW + 1000,
		lastPostedAtUtc: null,
		lastBirthDateChangeAtUtc: NOW - 1000,
		removedAt: null,
		createdAt: NOW - 5000,
		updatedAt: NOW - 1000,
	};
}

describe("RemoveBirthdayUseCase", () => {
	let repo: InMemoryRepo;
	let auditLog: SpyAuditLog;

	beforeEach(() => {
		repo = new InMemoryRepo();
		auditLog = new SpyAuditLog();
	});

	test("soft-deletes the record (removedAt set, row still exists)", async () => {
		repo.seed(makeActiveRecord("u1"));
		const useCase = new RemoveBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		await useCase.execute("u1", "discord");

		const record = repo.findByUserId("u1");
		expect(record).not.toBeNull();
		expect(record?.removedAt).toBe(NOW);
	});

	test("preserves lastBirthDateChangeAtUtc after soft-delete", async () => {
		repo.seed(makeActiveRecord("u1"));
		const useCase = new RemoveBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		await useCase.execute("u1", "discord");

		const record = repo.findByUserId("u1");
		expect(record?.lastBirthDateChangeAtUtc).toBe(NOW - 1000);
	});

	test("emits remove audit event", async () => {
		repo.seed(makeActiveRecord("u1"));
		const useCase = new RemoveBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		await useCase.execute("u1", "cli", "Vix (@coolvix)");

		expect(auditLog.events).toHaveLength(1);
		expect(auditLog.events[0]?.action).toBe("remove");
		expect(auditLog.events[0]?.userId).toBe("u1");
		expect(auditLog.events[0]?.userName).toBe("Vix (@coolvix)");
	});

	test("throws BirthdayNotFoundError when no record exists", async () => {
		const useCase = new RemoveBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		await expect(useCase.execute("u1", "discord")).rejects.toBeInstanceOf(
			BirthdayNotFoundError,
		);
		expect(auditLog.events).toHaveLength(0);
	});

	test("throws BirthdayNotFoundError when record is already tombstoned", async () => {
		repo.seed({ ...makeActiveRecord("u1"), removedAt: NOW - 1000 });
		const useCase = new RemoveBirthdayUseCase(repo, auditLog, fixedClock(NOW));
		await expect(useCase.execute("u1", "discord")).rejects.toBeInstanceOf(
			BirthdayNotFoundError,
		);
		expect(auditLog.events).toHaveLength(0);
	});
});
