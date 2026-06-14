import type { BirthDate } from "../../domain/birth-date.ts";
import type { Timezone } from "../../domain/timezone.ts";

export interface BirthdayRecord {
	userId: string;
	day: number;
	month: number;
	year: number | null;
	timezone: string;
	nextTriggerAtUtc: number;
	lastPostedAtUtc: number | null;
	lastBirthDateChangeAtUtc: number | null;
	createdAt: number;
	updatedAt: number;
}

export interface BirthdayRepository {
	findByUserId(userId: string): BirthdayRecord | null;
	upsert(record: {
		userId: string;
		birthDate: BirthDate;
		timezone: Timezone;
		nextTriggerAtUtc: number;
		now: number;
		lastBirthDateChangeAtUtc: number | null;
	}): void;
	delete(userId: string): void;
	findDue(nowUtcMillis: number): BirthdayRecord[];
	findNextUpcoming(nowUtcMillis: number): BirthdayRecord | null;
	reschedule(
		userId: string,
		nextTriggerAtUtc: number,
		lastPostedAtUtc: number | null,
	): void;
}
