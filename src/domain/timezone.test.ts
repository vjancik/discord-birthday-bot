import { describe, expect, test } from "bun:test";
import { InvalidTimezoneError } from "./errors.ts";
import { Timezone } from "./timezone.ts";

describe("Timezone.resolve", () => {
	test("resolves exact IANA zone (case-insensitive)", () => {
		expect(Timezone.resolve("Europe/Prague").ianaId).toBe("Europe/Prague");
		expect(Timezone.resolve("europe/prague").ianaId).toBe("Europe/Prague");
		expect(Timezone.resolve("America/New_York").ianaId).toBe(
			"America/New_York",
		);
	});

	test("resolves city name", () => {
		expect(Timezone.resolve("Prague").ianaId).toBe("Europe/Prague");
		expect(Timezone.resolve("prague").ianaId).toBe("Europe/Prague");
	});

	test("resolves city name with underscore as space", () => {
		expect(Timezone.resolve("New York").ianaId).toBe("America/New_York");
		expect(Timezone.resolve("new york").ianaId).toBe("America/New_York");
	});

	test("resolves manual aliases", () => {
		expect(Timezone.resolve("uk").ianaId).toBe("Europe/London");
		expect(Timezone.resolve("UK").ianaId).toBe("Europe/London");
		expect(Timezone.resolve("czechia").ianaId).toBe("Europe/Prague");
		expect(Timezone.resolve("Czech Republic").ianaId).toBe("Europe/Prague");
	});

	test("resolves with surrounding whitespace", () => {
		expect(Timezone.resolve("  Prague  ").ianaId).toBe("Europe/Prague");
	});

	test("throws InvalidTimezoneError for unrecognized input", () => {
		expect(() => Timezone.resolve("NotATimezone")).toThrow(
			InvalidTimezoneError,
		);
		expect(() => Timezone.resolve("")).toThrow(InvalidTimezoneError);
		expect(() => Timezone.resolve("   ")).toThrow(InvalidTimezoneError);
	});

	test("error message includes the input and a hint", () => {
		const err = (() => {
			try {
				Timezone.resolve("Narnia");
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(InvalidTimezoneError);
		expect((err as InvalidTimezoneError).message).toContain("Narnia");
		expect((err as InvalidTimezoneError).message).toContain("IANA");
	});

	test("toString returns ianaId", () => {
		expect(Timezone.resolve("Prague").toString()).toBe("Europe/Prague");
	});
});
