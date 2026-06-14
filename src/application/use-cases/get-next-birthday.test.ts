import { describe, expect, test } from "bun:test";
import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";
import { GetNextBirthdayUseCase } from "./get-next-birthday.ts";

const NOW = 1_700_000_000_000;

class StubRepo implements BirthdayRepository {
	private next: BirthdayRecord | null;

	constructor(next: BirthdayRecord | null) {
		this.next = next;
	}

	findByUserId(): BirthdayRecord | null {
		return null;
	}
	upsert(): void {}
	delete(): void {}
	findDue(): BirthdayRecord[] {
		return [];
	}
	findNextUpcoming(_now: number): BirthdayRecord | null {
		return this.next;
	}
	reschedule(): void {}
}

function fixedClock(ms: number): Clock {
	return { nowUtcMillis: () => ms };
}

function makeRecord(userId: string, nextTriggerAtUtc: number): BirthdayRecord {
	return {
		userId,
		day: 25,
		month: 12,
		year: null,
		timezone: "Europe/Prague",
		nextTriggerAtUtc,
		lastPostedAtUtc: null,
		lastBirthDateChangeAtUtc: null,
		removedAt: null,
		createdAt: 0,
		updatedAt: 0,
	};
}

describe("GetNextBirthdayUseCase", () => {
	test("returns the upcoming record from the repo", () => {
		const record = makeRecord("u1", NOW + 1000);
		const useCase = new GetNextBirthdayUseCase(
			new StubRepo(record),
			fixedClock(NOW),
		);

		expect(useCase.execute()).toBe(record);
	});

	test("returns null when no upcoming birthdays", () => {
		const useCase = new GetNextBirthdayUseCase(
			new StubRepo(null),
			fixedClock(NOW),
		);

		expect(useCase.execute()).toBeNull();
	});
});
