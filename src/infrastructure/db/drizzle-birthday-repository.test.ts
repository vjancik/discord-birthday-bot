import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { BirthDate } from "../../domain/birth-date.ts";
import { Timezone } from "../../domain/timezone.ts";
import type { DbClient } from "./client.ts";
import { DrizzleBirthdayRepository } from "./drizzle-birthday-repository.ts";
import * as schema from "./schema.ts";

function createTestDb(): DbClient {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: "./drizzle" });
	return db;
}

function baseUpsert(
	repo: DrizzleBirthdayRepository,
	userId: string,
	now: number,
	overrides: Partial<{
		nextTriggerAtUtc: number;
		lastBirthDateChangeAtUtc: number | null;
		removedAt: number | null;
	}> = {},
): void {
	const bd = BirthDate.parse("24.12.", null);
	const tz = Timezone.resolve("Europe/Prague");
	repo.upsert({
		userId,
		birthDate: bd,
		timezone: tz,
		nextTriggerAtUtc: overrides.nextTriggerAtUtc ?? now + 1000,
		now,
		lastBirthDateChangeAtUtc: overrides.lastBirthDateChangeAtUtc ?? null,
		removedAt: overrides.removedAt ?? null,
	});
}

describe("DrizzleBirthdayRepository", () => {
	let repo: DrizzleBirthdayRepository;
	const NOW = 1_700_000_000_000;
	const USER_ID = "123456789012345678";

	beforeEach(() => {
		repo = new DrizzleBirthdayRepository(createTestDb());
	});

	afterEach(() => {
		// Each test gets a fresh in-memory DB so no cleanup needed
	});

	test("findByUserId returns null when no record exists", () => {
		expect(repo.findByUserId(USER_ID)).toBeNull();
	});

	test("upsert inserts a new record", () => {
		const bd = BirthDate.parse("24.12.", "1990");
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1000,
			now: NOW,
			lastBirthDateChangeAtUtc: NOW,
			removedAt: null,
		});

		const record = repo.findByUserId(USER_ID);
		expect(record).not.toBeNull();
		expect(record?.day).toBe(24);
		expect(record?.month).toBe(12);
		expect(record?.year).toBe(1990);
		expect(record?.timezone).toBe("Europe/Prague");
		expect(record?.createdAt).toBe(NOW);
		expect(record?.updatedAt).toBe(NOW);
		expect(record?.lastBirthDateChangeAtUtc).toBe(NOW);
		expect(record?.removedAt).toBeNull();
	});

	test("upsert updates an existing record without changing createdAt", () => {
		const bd = BirthDate.parse("01.01.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: NOW,
			removedAt: null,
		});

		const later = NOW + 10_000;
		const bd2 = BirthDate.parse("24.12.", null);
		repo.upsert({
			userId: USER_ID,
			birthDate: bd2,
			timezone: tz,
			nextTriggerAtUtc: later + 1000,
			now: later,
			lastBirthDateChangeAtUtc: later,
			removedAt: null,
		});

		const record = repo.findByUserId(USER_ID);
		expect(record?.day).toBe(24);
		expect(record?.createdAt).toBe(NOW); // unchanged
		expect(record?.updatedAt).toBe(later);
		expect(record?.lastBirthDateChangeAtUtc).toBe(later);
	});

	test("upsert with removedAt: null clears a tombstone (reactivation)", () => {
		baseUpsert(repo, USER_ID, NOW);
		repo.delete(USER_ID, NOW);
		expect(repo.findByUserId(USER_ID)?.removedAt).toBe(NOW);

		// Re-upsert with removedAt: null to reactivate
		baseUpsert(repo, USER_ID, NOW + 1000, { removedAt: null });
		const record = repo.findByUserId(USER_ID);
		expect(record?.removedAt).toBeNull();
	});

	test("reschedule does not change lastBirthDateChangeAtUtc", () => {
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: NOW,
			removedAt: null,
		});

		repo.reschedule(USER_ID, NOW + 86_400_000, NOW);

		const record = repo.findByUserId(USER_ID);
		expect(record?.lastBirthDateChangeAtUtc).toBe(NOW); // unchanged by reschedule
	});

	test("reschedule does not change removedAt", () => {
		baseUpsert(repo, USER_ID, NOW);
		repo.reschedule(USER_ID, NOW + 86_400_000, NOW);
		expect(repo.findByUserId(USER_ID)?.removedAt).toBeNull();
	});

	test("delete soft-deletes: row still exists with removedAt set", () => {
		baseUpsert(repo, USER_ID, NOW);
		repo.delete(USER_ID, NOW + 5000);

		const record = repo.findByUserId(USER_ID);
		expect(record).not.toBeNull();
		expect(record?.removedAt).toBe(NOW + 5000);
	});

	test("delete preserves lastBirthDateChangeAtUtc", () => {
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1000,
			now: NOW,
			lastBirthDateChangeAtUtc: NOW,
			removedAt: null,
		});
		repo.delete(USER_ID, NOW + 5000);

		const record = repo.findByUserId(USER_ID);
		expect(record?.lastBirthDateChangeAtUtc).toBe(NOW);
	});

	test("findDue excludes tombstoned records", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);

		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.upsert({
			userId: "u2",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.delete("u2", NOW);

		const due = repo.findDue(NOW);
		expect(due.map((r) => r.userId)).toEqual(["u1"]);
	});

	test("findDue returns active records with nextTriggerAtUtc <= now", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);

		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.upsert({
			userId: "u2",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.upsert({
			userId: "u3",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		const due = repo.findDue(NOW);
		const dueIds = due.map((r) => r.userId).sort();
		expect(dueIds).toEqual(["u1", "u2"]);
	});

	test("findNextUpcoming excludes tombstoned records", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);

		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1000,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.delete("u1", NOW);

		repo.upsert({
			userId: "u2",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 2000,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		expect(repo.findNextUpcoming(NOW)?.userId).toBe("u2");
	});

	test("findNextUpcoming returns the soonest future active record (strictly > now)", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);

		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.upsert({
			userId: "u2",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1000,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});
		repo.upsert({
			userId: "u3",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 5000,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		const next = repo.findNextUpcoming(NOW);
		expect(next?.userId).toBe("u2");
	});

	test("findNextUpcoming returns null when no future records exist", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);
		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		expect(repo.findNextUpcoming(NOW)).toBeNull();
	});

	test("findNextUpcoming returns null when empty", () => {
		expect(repo.findNextUpcoming(NOW)).toBeNull();
	});

	test("findNextUpcoming excludes at-now trigger (strict >)", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);
		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		expect(repo.findNextUpcoming(NOW)).toBeNull();
	});

	test("reschedule updates nextTriggerAtUtc and lastPostedAtUtc", () => {
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		const newTrigger = NOW + 86_400_000;
		repo.reschedule(USER_ID, newTrigger, NOW);

		const record = repo.findByUserId(USER_ID);
		expect(record?.nextTriggerAtUtc).toBe(newTrigger);
		expect(record?.lastPostedAtUtc).toBe(NOW);
	});

	test("year is stored as null when not provided", () => {
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		const record = repo.findByUserId(USER_ID);
		expect(record?.year).toBeNull();
	});

	test("lastBirthDateChangeAtUtc stored as null when not provided", () => {
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
			removedAt: null,
		});

		const record = repo.findByUserId(USER_ID);
		expect(record?.lastBirthDateChangeAtUtc).toBeNull();
	});
});
