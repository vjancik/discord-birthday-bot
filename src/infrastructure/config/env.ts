import { MissingEnvVarError } from "../../domain/errors.ts";

export interface AppConfig {
	discordToken: string;
	clientId: string;
	guildId: string | null;
	birthdayPostChannelId: string;
	logChannelId: string;
	dbFilePath: string;
	nodeEnv: string;
}

function requireEnvVars(names: string[]): Record<string, string> {
	const missing: string[] = [];
	const result: Record<string, string> = {};

	for (const name of names) {
		const value = process.env[name];
		if (value === undefined || value.trim() === "") {
			missing.push(name);
		} else {
			result[name] = value;
		}
	}

	if (missing.length > 0) {
		throw new MissingEnvVarError(missing);
	}

	return result;
}

export function loadConfig(): AppConfig {
	const required = requireEnvVars([
		"DISCORD_TOKEN",
		"DISCORD_CLIENT_ID",
		"BIRTHDAY_POST_CHANNEL",
		"BD_BOT_LOG_CHANNEL",
	]);

	return {
		discordToken: required.DISCORD_TOKEN as string,
		clientId: required.DISCORD_CLIENT_ID as string,
		guildId: process.env.GUILD_ID?.trim() || null,
		birthdayPostChannelId: required.BIRTHDAY_POST_CHANNEL as string,
		logChannelId: required.BD_BOT_LOG_CHANNEL as string,
		dbFilePath: process.env.DB_FILE_PATH?.trim() ?? "./data/birthdays.sqlite",
		nodeEnv: process.env.NODE_ENV ?? "development",
	};
}
