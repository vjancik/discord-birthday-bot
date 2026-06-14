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
import type { MembershipChecker } from "../ports/membership-checker.ts";
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

class SpyAnnouncements implements AnnouncementPublisher {
	readonly calls: string[] = [];
	async publishBirthday(content: string, _signal: AbortSignal): Promise<void> {
		this.calls.push(content);
	}
}

function fixedClock(ms: number): Clock {
	return { nowUtcMillis: () => ms };
}

// Prague noon on the given date
function pragueNoon(year: number, month: number, day: number): number {
	return DateTime.fromObject(
		{ year, month, day, hour: 12 },
		{ zone: PRAGUE },
	).toMillis();
}

function makeRecord(
	overrides: Partial<BirthdayRecord> & {
		userId: string;
		day: number;
		month: number;
		timezone: string;
		nextTriggerAtUtc: number;
	},
): BirthdayRecord {
	return {
		year: null,
		lastPostedAtUtc: null,
		lastBirthDateChangeAtUtc: null,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	};
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

		repo.seed(
			makeRecord({
				userId: "u1",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);

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

		repo.seed(
			makeRecord({
				userId: "u2",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);

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

	test("once-per-year guard: skips post when already posted this year", async () => {
		const now = pragueNoon(2025, 7, 15) + 60_000;
		const triggerMs = now - 120_000;
		// Posted earlier today (same year in Prague)
		const lastPostedThisYear = pragueNoon(2025, 7, 15) - 3_600_000;

		repo.seed(
			makeRecord({
				userId: "u3",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
				lastPostedAtUtc: lastPostedThisYear,
			}),
		);

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

	test("once-per-year guard: posts when last posted was in a prior year", async () => {
		const now = pragueNoon(2025, 7, 15) + 60_000;
		const triggerMs = now - 120_000;
		const lastPostedPriorYear = pragueNoon(2024, 7, 15);

		repo.seed(
			makeRecord({
				userId: "u3b",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
				lastPostedAtUtc: lastPostedPriorYear,
			}),
		);

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
	});

	test("does not reschedule when post fails (at-least-once: next tick can retry)", async () => {
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = triggerMs + 60_000;

		repo.seed(
			makeRecord({
				userId: "u4",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);

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

	test("abort signal: stops processing further records after tick timeout", async () => {
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = triggerMs + 60_000;

		repo.seed(
			makeRecord({
				userId: "u5a",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);
		repo.seed(
			makeRecord({
				userId: "u5b",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);

		// Publisher that adds a small delay so the 1ms abort timer fires before the second iteration
		const slowPublisher: AnnouncementPublisher = {
			async publishBirthday(
				content: string,
				_signal: AbortSignal,
			): Promise<void> {
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
				announcements.calls.push(content);
			},
		};

		// 1ms timeout — fires after the first await yields to the event loop
		const useCase = new RunDueBirthdaysUseCase(
			repo,
			slowPublisher,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			1,
		);
		await useCase.execute();

		// Only one post processed — abort fires before the second iteration's check
		expect(announcements.calls).toHaveLength(1);
	});

	test("membership check: skips post and reschedules with old lastPosted when user left guild", async () => {
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = triggerMs + 60_000;
		const oldLastPosted = pragueNoon(2024, 7, 15);

		repo.seed(
			makeRecord({
				userId: "u6",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
				lastPostedAtUtc: oldLastPosted,
			}),
		);

		const nonMember: MembershipChecker = {
			isMember: async () => false,
		};

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			announcements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
			nonMember,
		);
		await useCase.execute();

		expect(announcements.calls).toHaveLength(0);
		const record = repo.findByUserId("u6");
		// Trigger advanced but lastPostedAtUtc preserved
		expect(record?.nextTriggerAtUtc).toBeGreaterThan(now);
		expect(record?.lastPostedAtUtc).toBe(oldLastPosted);
	});

	test("membership check: fail-closed on API error — no post, no reschedule", async () => {
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = triggerMs + 60_000;

		repo.seed(
			makeRecord({
				userId: "u7",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);

		const failingChecker: MembershipChecker = {
			isMember: async () => {
				throw new Error("API timeout");
			},
		};

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			announcements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
			failingChecker,
		);
		await useCase.execute();

		expect(announcements.calls).toHaveLength(0);
		// Trigger unchanged — next tick retries
		const record = repo.findByUserId("u7");
		expect(record?.nextTriggerAtUtc).toBe(triggerMs);
	});

	test("membership check: posts when user is still in guild", async () => {
		const triggerMs = pragueNoon(2025, 7, 15);
		const now = triggerMs + 60_000;

		repo.seed(
			makeRecord({
				userId: "u8",
				day: 15,
				month: 7,
				timezone: PRAGUE,
				nextTriggerAtUtc: triggerMs,
			}),
		);

		const memberChecker: MembershipChecker = {
			isMember: async () => true,
		};

		const useCase = new RunDueBirthdaysUseCase(
			repo,
			announcements,
			fixedClock(now),
			FIXED_RANDOM,
			LOGGER,
			30_000,
			memberChecker,
		);
		await useCase.execute();

		expect(announcements.calls).toHaveLength(1);
	});
});
