import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MissingEnvVarError } from "../../domain/errors.ts";
import { loadConfig } from "./env.ts";

const REQUIRED_VARS = {
	DISCORD_TOKEN: "tok",
	DISCORD_CLIENT_ID: "cid",
	BIRTHDAY_POST_CHANNEL: "bpc",
	BD_BOT_LOG_CHANNEL: "blc",
};

describe("loadConfig", () => {
	let saved: Record<string, string | undefined> = {};

	beforeEach(() => {
		saved = {};
		for (const key of Object.keys(REQUIRED_VARS)) {
			saved[key] = process.env[key];
		}
		saved.GUILD_ID = process.env.GUILD_ID;
		saved.DB_FILE_PATH = process.env.DB_FILE_PATH;
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	function setRequiredVars(): void {
		for (const [key, value] of Object.entries(REQUIRED_VARS)) {
			process.env[key] = value;
		}
	}

	test("loads config when all required vars are present", () => {
		setRequiredVars();
		delete process.env.GUILD_ID;
		delete process.env.DB_FILE_PATH;

		const config = loadConfig();
		expect(config.discordToken).toBe("tok");
		expect(config.clientId).toBe("cid");
		expect(config.birthdayPostChannelId).toBe("bpc");
		expect(config.logChannelId).toBe("blc");
		expect(config.guildId).toBeNull();
		expect(config.dbFilePath).toBe("./data/birthdays.sqlite");
	});

	test("includes GUILD_ID when set", () => {
		setRequiredVars();
		process.env.GUILD_ID = "gid123";

		const config = loadConfig();
		expect(config.guildId).toBe("gid123");
	});

	test("uses DB_FILE_PATH when set", () => {
		setRequiredVars();
		process.env.DB_FILE_PATH = "/custom/path.sqlite";

		const config = loadConfig();
		expect(config.dbFilePath).toBe("/custom/path.sqlite");
	});

	test("throws MissingEnvVarError listing all missing vars", () => {
		// Remove all required vars
		for (const key of Object.keys(REQUIRED_VARS)) {
			delete process.env[key];
		}

		expect(() => loadConfig()).toThrow(MissingEnvVarError);

		try {
			loadConfig();
		} catch (err) {
			expect(err).toBeInstanceOf(MissingEnvVarError);
			const msg = (err as MissingEnvVarError).message;
			expect(msg).toContain("DISCORD_TOKEN");
			expect(msg).toContain("BIRTHDAY_POST_CHANNEL");
		}
	});

	test("throws for single missing required var", () => {
		setRequiredVars();
		delete process.env.DISCORD_TOKEN;

		expect(() => loadConfig()).toThrow(MissingEnvVarError);
	});
});
