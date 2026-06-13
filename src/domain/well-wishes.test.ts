import { describe, expect, test } from "bun:test";
import type { RandomSource } from "../application/ports/random-source.ts";
import { formatAnnouncement, WELL_WISHES } from "./well-wishes.ts";

function fixedRandom(value: number): RandomSource {
	return { next: () => value };
}

describe("WELL_WISHES", () => {
	test("has exactly 10 messages", () => {
		expect(WELL_WISHES.length).toBe(10);
	});

	test("all messages are non-empty strings", () => {
		for (const wish of WELL_WISHES) {
			expect(typeof wish).toBe("string");
			expect(wish.length).toBeGreaterThan(0);
		}
	});
});

describe("formatAnnouncement", () => {
	test("includes mention and confetti", () => {
		const msg = formatAnnouncement("123456789", fixedRandom(0));
		expect(msg).toContain("<@123456789>");
		expect(msg).toContain("🎉");
		expect(msg).toContain("Happy birthday");
	});

	test("picks first message when random is 0", () => {
		const msg = formatAnnouncement("123", fixedRandom(0));
		const first = WELL_WISHES[0] as string;
		expect(msg).toContain(first);
	});

	test("picks last message when random is 0.999", () => {
		const msg = formatAnnouncement("123", fixedRandom(0.999));
		const last = WELL_WISHES[WELL_WISHES.length - 1] as string;
		expect(msg).toContain(last);
	});

	test("output format is correct", () => {
		const msg = formatAnnouncement("987654321", fixedRandom(0));
		expect(msg).toMatch(/^Happy birthday <@987654321>! 🎉 .+$/);
	});
});
