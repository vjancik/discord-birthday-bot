import { eq, gt, lte } from "drizzle-orm";
import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../../application/ports/birthday-repository.ts";
import type { BirthDate } from "../../domain/birth-date.ts";
import type { Timezone } from "../../domain/timezone.ts";
import type { DbClient } from "./client.ts";
import { birthdays } from "./schema.ts";

export class DrizzleBirthdayRepository implements BirthdayRepository {
	constructor(private readonly db: DbClient) {}

	findByUserId(userId: string): BirthdayRecord | null {
		const row = this.db
			.select()
			.from(birthdays)
			.where(eq(birthdays.userId, userId))
			.get();

		return row !== undefined ? this.toRecord(row) : null;
	}

	upsert(params: {
		userId: string;
		birthDate: BirthDate;
		timezone: Timezone;
		nextTriggerAtUtc: number;
		now: number;
		lastBirthDateChangeAtUtc: number | null;
	}): void {
		const existing = this.findByUserId(params.userId);
		const createdAt = existing?.createdAt ?? params.now;

		this.db
			.insert(birthdays)
			.values({
				userId: params.userId,
				day: params.birthDate.day,
				month: params.birthDate.month,
				year: params.birthDate.year,
				timezone: params.timezone.ianaId,
				nextTriggerAtUtc: params.nextTriggerAtUtc,
				lastPostedAtUtc: existing?.lastPostedAtUtc ?? null,
				lastBirthDateChangeAtUtc: params.lastBirthDateChangeAtUtc,
				createdAt,
				updatedAt: params.now,
			})
			.onConflictDoUpdate({
				target: birthdays.userId,
				set: {
					day: params.birthDate.day,
					month: params.birthDate.month,
					year: params.birthDate.year,
					timezone: params.timezone.ianaId,
					nextTriggerAtUtc: params.nextTriggerAtUtc,
					lastBirthDateChangeAtUtc: params.lastBirthDateChangeAtUtc,
					updatedAt: params.now,
				},
			})
			.run();
	}

	delete(userId: string): void {
		this.db.delete(birthdays).where(eq(birthdays.userId, userId)).run();
	}

	findDue(nowUtcMillis: number): BirthdayRecord[] {
		const rows = this.db
			.select()
			.from(birthdays)
			.where(lte(birthdays.nextTriggerAtUtc, nowUtcMillis))
			.all();

		return rows.map((row) => this.toRecord(row));
	}

	findNextUpcoming(nowUtcMillis: number): BirthdayRecord | null {
		const row = this.db
			.select()
			.from(birthdays)
			.where(gt(birthdays.nextTriggerAtUtc, nowUtcMillis))
			.orderBy(birthdays.nextTriggerAtUtc)
			.limit(1)
			.get();

		return row !== undefined ? this.toRecord(row) : null;
	}

	reschedule(
		userId: string,
		nextTriggerAtUtc: number,
		lastPostedAtUtc: number | null,
	): void {
		this.db
			.update(birthdays)
			.set({
				nextTriggerAtUtc,
				lastPostedAtUtc,
				updatedAt: Date.now(),
			})
			.where(eq(birthdays.userId, userId))
			.run();
	}

	private toRecord(row: typeof birthdays.$inferSelect): BirthdayRecord {
		return {
			userId: row.userId,
			day: row.day,
			month: row.month,
			year: row.year,
			timezone: row.timezone,
			nextTriggerAtUtc: row.nextTriggerAtUtc,
			lastPostedAtUtc: row.lastPostedAtUtc,
			lastBirthDateChangeAtUtc: row.lastBirthDateChangeAtUtc,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}
