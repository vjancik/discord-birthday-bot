import { describe, expect, test } from "bun:test";
import { BirthDate } from "./birth-date.ts";
import { InvalidBirthDateError } from "./errors.ts";

describe("BirthDate.parse", () => {
	test("parses DD.MM. format", () => {
		const bd = BirthDate.parse("24.12.", null);
		expect(bd.day).toBe(24);
		expect(bd.month).toBe(12);
		expect(bd.year).toBeNull();
	});

	test("parses D.M. format", () => {
		const bd = BirthDate.parse("1.1.", null);
		expect(bd.day).toBe(1);
		expect(bd.month).toBe(1);
	});

	test("parses DD.MM without trailing dot", () => {
		const bd = BirthDate.parse("01.01", null);
		expect(bd.day).toBe(1);
		expect(bd.month).toBe(1);
	});

	test("parses optional year when provided", () => {
		const bd = BirthDate.parse("24.12.", "1990");
		expect(bd.year).toBe(1990);
	});

	test("treats empty year string as null", () => {
		const bd = BirthDate.parse("24.12.", "");
		expect(bd.year).toBeNull();
	});

	test("treats whitespace-only year as null", () => {
		const bd = BirthDate.parse("24.12.", "   ");
		expect(bd.year).toBeNull();
	});

	test("treats null year as null", () => {
		const bd = BirthDate.parse("24.12.", null);
		expect(bd.year).toBeNull();
	});

	test("accepts Feb 29 as valid date", () => {
		const bd = BirthDate.parse("29.02.", null);
		expect(bd.day).toBe(29);
		expect(bd.month).toBe(2);
	});

	test("rejects invalid format", () => {
		expect(() => BirthDate.parse("2412", null)).toThrow(InvalidBirthDateError);
		expect(() => BirthDate.parse("24-12", null)).toThrow(InvalidBirthDateError);
		expect(() => BirthDate.parse("", null)).toThrow(InvalidBirthDateError);
	});

	test("rejects day 0", () => {
		expect(() => BirthDate.parse("00.01.", null)).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects day 32", () => {
		expect(() => BirthDate.parse("32.01.", null)).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects Feb 31", () => {
		expect(() => BirthDate.parse("31.02.", null)).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects month 0", () => {
		expect(() => BirthDate.parse("01.00.", null)).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects month 13", () => {
		expect(() => BirthDate.parse("01.13.", null)).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects year below 1900", () => {
		expect(() => BirthDate.parse("01.01.", "1899")).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects future year", () => {
		const futureYear = String(new Date().getFullYear() + 1);
		expect(() => BirthDate.parse("01.01.", futureYear)).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects non-numeric year", () => {
		expect(() => BirthDate.parse("01.01.", "abcd")).toThrow(
			InvalidBirthDateError,
		);
	});

	test("rejects 3-digit year", () => {
		expect(() => BirthDate.parse("01.01.", "199")).toThrow(
			InvalidBirthDateError,
		);
	});
});

describe("BirthDate.format", () => {
	test("formats with zero-padding", () => {
		expect(BirthDate.parse("1.1.", null).format()).toBe("01.01.");
		expect(BirthDate.parse("24.12.", null).format()).toBe("24.12.");
	});

	test("formatWithYear includes year when present", () => {
		const bd = BirthDate.parse("24.12.", "1990");
		expect(bd.formatWithYear()).toBe("24.12.1990");
	});

	test("formatWithYear omits year when null", () => {
		const bd = BirthDate.parse("24.12.", null);
		expect(bd.formatWithYear()).toBe("24.12.");
	});
});

describe("BirthDate.isFeb29", () => {
	test("returns true for Feb 29", () => {
		expect(BirthDate.parse("29.02.", null).isFeb29()).toBe(true);
	});

	test("returns false for other dates", () => {
		expect(BirthDate.parse("28.02.", null).isFeb29()).toBe(false);
		expect(BirthDate.parse("29.03.", null).isFeb29()).toBe(false);
	});
});

describe("error messages", () => {
	test("invalid format message is user-presentable", () => {
		const err = (() => {
			try {
				BirthDate.parse("baddate", null);
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(InvalidBirthDateError);
		expect((err as InvalidBirthDateError).message).toContain("DD.MM.");
	});
});
