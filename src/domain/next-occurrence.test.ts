import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import { BirthDate } from "./birth-date.ts";
import {
	isSameBirthdayLocalDay,
	nextOccurrenceUtc,
} from "./next-occurrence.ts";
import { Timezone } from "./timezone.ts";

function utcMs(isoString: string): number {
	return DateTime.fromISO(isoString, { zone: "UTC" }).toMillis();
}

const prague = Timezone.resolve("Europe/Prague");

describe("nextOccurrenceUtc", () => {
	test("returns noon local time in winter (UTC+1)", () => {
		const bd = BirthDate.parse("15.01.", null);
		// After Jan 14, 2025 in Prague time → expect Jan 15, 2025 at noon Prague = 11:00 UTC
		const after = utcMs("2025-01-14T12:00:00Z");
		const result = nextOccurrenceUtc(bd, prague, after);
		const resultLocal = DateTime.fromMillis(result, { zone: prague.ianaId });
		expect(resultLocal.year).toBe(2025);
		expect(resultLocal.month).toBe(1);
		expect(resultLocal.day).toBe(15);
		expect(resultLocal.hour).toBe(12);
		expect(result).toBe(utcMs("2025-01-15T11:00:00Z"));
	});

	test("returns noon local time in summer (UTC+2)", () => {
		const bd = BirthDate.parse("15.07.", null);
		// After Jul 14, 2025 → expect Jul 15, 2025 at noon Prague = 10:00 UTC
		const after = utcMs("2025-07-14T12:00:00Z");
		const result = nextOccurrenceUtc(bd, prague, after);
		expect(result).toBe(utcMs("2025-07-15T10:00:00Z"));
	});

	test("wraps to next year if birthday already passed this year", () => {
		const bd = BirthDate.parse("15.01.", null);
		// After Jan 15 noon Prague 2025 (i.e. trigger has already fired)
		const after = utcMs("2025-01-15T12:00:00Z"); // that's 13:00 Prague = after noon
		const result = nextOccurrenceUtc(bd, prague, after);
		const resultLocal = DateTime.fromMillis(result, { zone: prague.ianaId });
		expect(resultLocal.year).toBe(2026);
		expect(resultLocal.month).toBe(1);
		expect(resultLocal.day).toBe(15);
	});

	test("Feb 29 birthday on a leap year returns Feb 29", () => {
		const bd = BirthDate.parse("29.02.", null);
		const after = utcMs("2024-02-28T12:00:00Z");
		const result = nextOccurrenceUtc(bd, prague, after);
		const resultLocal = DateTime.fromMillis(result, { zone: prague.ianaId });
		expect(resultLocal.year).toBe(2024);
		expect(resultLocal.month).toBe(2);
		expect(resultLocal.day).toBe(29);
	});

	test("Feb 29 birthday on a non-leap year returns Feb 28", () => {
		const bd = BirthDate.parse("29.02.", null);
		// 2025 is not a leap year; next after Feb 27 2025 should be Feb 28 2025
		const after = utcMs("2025-02-27T12:00:00Z");
		const result = nextOccurrenceUtc(bd, prague, after);
		const resultLocal = DateTime.fromMillis(result, { zone: prague.ianaId });
		expect(resultLocal.year).toBe(2025);
		expect(resultLocal.month).toBe(2);
		expect(resultLocal.day).toBe(28);
	});

	test("returns time strictly after afterUtcMillis (equal trigger → next year)", () => {
		const bd = BirthDate.parse("15.01.", null);
		// afterUtcMillis = exactly at the trigger moment
		const triggerMs = utcMs("2025-01-15T11:00:00Z");
		const result = nextOccurrenceUtc(bd, prague, triggerMs);
		const resultLocal = DateTime.fromMillis(result, { zone: prague.ianaId });
		expect(resultLocal.year).toBe(2026);
	});
});

describe("isSameBirthdayLocalDay", () => {
	test("returns true when local date matches birthday", () => {
		const bd = BirthDate.parse("15.07.", null);
		const utc = utcMs("2025-07-15T10:00:00Z"); // noon Prague in summer
		expect(isSameBirthdayLocalDay(bd, prague, utc)).toBe(true);
	});

	test("returns false when local date does not match", () => {
		const bd = BirthDate.parse("15.07.", null);
		const utc = utcMs("2025-07-16T10:00:00Z");
		expect(isSameBirthdayLocalDay(bd, prague, utc)).toBe(false);
	});

	test("Feb 29 birthday matches Feb 28 on non-leap year", () => {
		const bd = BirthDate.parse("29.02.", null);
		// 2025 is not a leap year; Feb 28 noon Prague = 11:00 UTC
		const utc = utcMs("2025-02-28T11:00:00Z");
		expect(isSameBirthdayLocalDay(bd, prague, utc)).toBe(true);
	});

	test("Feb 29 birthday does NOT match Feb 28 on leap year", () => {
		const bd = BirthDate.parse("29.02.", null);
		// 2024 is a leap year; Feb 28 should not match a Feb 29 birthday
		const utc = utcMs("2024-02-28T11:00:00Z");
		expect(isSameBirthdayLocalDay(bd, prague, utc)).toBe(false);
	});

	test("Feb 29 birthday matches Feb 29 on leap year", () => {
		const bd = BirthDate.parse("29.02.", null);
		const utc = utcMs("2024-02-29T11:00:00Z");
		expect(isSameBirthdayLocalDay(bd, prague, utc)).toBe(true);
	});
});
