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
		});

		const record = repo.findByUserId(USER_ID);
		expect(record?.day).toBe(24);
		expect(record?.createdAt).toBe(NOW); // unchanged
		expect(record?.updatedAt).toBe(later);
		expect(record?.lastBirthDateChangeAtUtc).toBe(later);
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
		});

		repo.reschedule(USER_ID, NOW + 86_400_000, NOW);

		const record = repo.findByUserId(USER_ID);
		expect(record?.lastBirthDateChangeAtUtc).toBe(NOW); // unchanged by reschedule
	});

	test("delete removes the record", () => {
		const bd = BirthDate.parse("24.12.", null);
		const tz = Timezone.resolve("Europe/Prague");
		repo.upsert({
			userId: USER_ID,
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
		});
		repo.delete(USER_ID);
		expect(repo.findByUserId(USER_ID)).toBeNull();
	});

	test("findDue returns records with nextTriggerAtUtc <= now", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);

		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
		});
		repo.upsert({
			userId: "u2",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
		});
		repo.upsert({
			userId: "u3",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
		});

		const due = repo.findDue(NOW);
		const dueIds = due.map((r) => r.userId).sort();
		expect(dueIds).toEqual(["u1", "u2"]);
	});

	test("findNextUpcoming returns the soonest future record (strictly > now)", () => {
		const tz = Timezone.resolve("Europe/Prague");
		const bd = BirthDate.parse("24.12.", null);

		repo.upsert({
			userId: "u1",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW - 1,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
		});
		repo.upsert({
			userId: "u2",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 1000,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
		});
		repo.upsert({
			userId: "u3",
			birthDate: bd,
			timezone: tz,
			nextTriggerAtUtc: NOW + 5000,
			now: NOW,
			lastBirthDateChangeAtUtc: null,
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
		});

		const record = repo.findByUserId(USER_ID);
		expect(record?.lastBirthDateChangeAtUtc).toBeNull();
	});
});
