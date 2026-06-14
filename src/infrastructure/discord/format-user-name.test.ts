import { describe, expect, test } from "bun:test";
import { formatUserName } from "./format-user-name.ts";

describe("formatUserName", () => {
	test("returns globalName (@username) when globalName is present", () => {
		expect(formatUserName("Vix", "coolvix")).toBe("Vix (@coolvix)");
	});

	test("returns @username only when globalName is null", () => {
		expect(formatUserName(null, "coolvix")).toBe("@coolvix");
	});

	test("returns @username only when globalName is empty string", () => {
		expect(formatUserName("", "coolvix")).toBe("@coolvix");
	});
});
