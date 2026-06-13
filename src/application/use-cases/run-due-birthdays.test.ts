import { beforeEach, describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import pino from "pino";
import type { BirthDate } from "../../domain/birth-date.ts";
import type { Timezone } from "../../domain/timezone.ts";
import type { AnnouncementPublisher } from "../ports/announcement-publisher.ts";
import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";
import type { RandomSource } from "../ports/random-source.ts";
import { RunDueBirthdaysUseCase } from "./run-due-birthdays.ts";

const PRAGUE = "Europe/Prague";
const LOGGER = pino({ level: "silent" });
const FIXED_RANDOM: RandomSource = { next: () => 0 };

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

class SpyAnnouncements implements AnnouncementPublisher {
	readonly calls: string[] = [];
	async publishBirthday(content: string, _signal: AbortSignal): Promise<void> {
		this.calls.push(content);
	}
}

function fixedClock(ms: number): Clock {
	return { nowUtcMillis: () => ms };
}

// Prague noon on July 15, 2025 = 2025-07-15T10:00:00Z
function pragueNoon(year: number, month: number, day: number): number {
	return DateTime.fromObject(
		{ year, month, day, hour: 12 },
		{ zone: PRAGUE },
	).toMillis();
}

describe("RunDueBirthdaysUseCase", () => {
	let repo: InMemoryRepo;
	let announcements: SpyAnnouncements;

	beforeEach(() => {
		repo = new InMemoryRepo();
		announcements = new SpyAnnouncements();
	});

	test("posts birthday and reschedules when trigger is due and it's the same local day", async () => {
		// Birthday: July 15. Trigger fires exactly at noon Prague time July 15, 2025.
		const triggerMs = pragueNoon(2025, 7, 15);
		// "now" is a few minutes after trigger
		const now = triggerMs + 60_000;

		repo.seed({
			userId: "u1",
			day: 15,
			month: 7,
			year: null,
			timezone: PRAGUE,
			nextTriggerAtUtc: triggerMs,
			lastPostedAtUtc: null,
			createdAt: 0,
			updatedAt: 0,
		});

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			announcements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
		);
		await useCase.execute();

		expect(announcements.calls).toHaveLength(1);
		expect(announcements.calls[0]).toContain("<@u1>");

		const record = repo.findByUserId("u1");
		expect(record?.lastPostedAtUtc).toBe(now);
		expect(record?.nextTriggerAtUtc).toBeGreaterThan(now);
	});

	test("skips post but still reschedules when trigger was missed (bot was down past midnight)", async () => {
		// Birthday July 15 trigger, but "now" is July 16 in Prague
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = DateTime.fromObject(
			{ year: 2025, month: 7, day: 16, hour: 9 },
			{ zone: PRAGUE },
		).toMillis();

		repo.seed({
			userId: "u2",
			day: 15,
			month: 7,
			year: null,
			timezone: PRAGUE,
			nextTriggerAtUtc: triggerMs,
			lastPostedAtUtc: null,
			createdAt: 0,
			updatedAt: 0,
		});

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			announcements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
		);
		await useCase.execute();

		expect(announcements.calls).toHaveLength(0);

		const record = repo.findByUserId("u2");
		expect(record?.nextTriggerAtUtc).toBeGreaterThan(now);
	});

	test("double-post guard: skips post when already posted today", async () => {
		const now = pragueNoon(2025, 7, 15) + 60_000;
		const triggerMs = now - 120_000;
		const lastPostedToday = pragueNoon(2025, 7, 15) - 3_600_000; // earlier today

		repo.seed({
			userId: "u3",
			day: 15,
			month: 7,
			year: null,
			timezone: PRAGUE,
			nextTriggerAtUtc: triggerMs,
			lastPostedAtUtc: lastPostedToday,
			createdAt: 0,
			updatedAt: 0,
		});

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			announcements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
		);
		await useCase.execute();

		expect(announcements.calls).toHaveLength(0);
	});

	test("does not reschedule when post fails (at-least-once: next tick can retry)", async () => {
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = triggerMs + 60_000;

		repo.seed({
			userId: "u4",
			day: 15,
			month: 7,
			year: null,
			timezone: PRAGUE,
			nextTriggerAtUtc: triggerMs,
			lastPostedAtUtc: null,
			createdAt: 0,
			updatedAt: 0,
		});

		const failingAnnouncements: AnnouncementPublisher = {
			async publishBirthday(
				_content: string,
				_signal: AbortSignal,
			): Promise<void> {
				throw new Error("network error");
			},
		};

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			failingAnnouncements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
		);
		await useCase.execute();

		// Trigger should remain unchanged so the next tick can retry
		const record = repo.findByUserId("u4");
		expect(record?.nextTriggerAtUtc).toBe(triggerMs);
	});
});
