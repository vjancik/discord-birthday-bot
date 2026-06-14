import { REST } from "discord.js";
import { SetBirthdayUseCase } from "../src/application/use-cases/set-birthday.ts";
import { BirthDate } from "../src/domain/birth-date.ts";
import { AppError } from "../src/domain/errors.ts";
import { Timezone } from "../src/domain/timezone.ts";
import { loadConfig } from "../src/infrastructure/config/env.ts";
import { createDb } from "../src/infrastructure/db/client.ts";
import { DrizzleBirthdayRepository } from "../src/infrastructure/db/drizzle-birthday-repository.ts";
import { NullAuditLogPublisher } from "../src/infrastructure/discord/null-audit-log-publisher.ts";
import { RestAuditLogPublisher } from "../src/infrastructure/discord/rest-audit-log-publisher.ts";
import { RestUserNameResolver } from "../src/infrastructure/discord/rest-user-name-resolver.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { SystemClock } from "../src/infrastructure/system-clock.ts";

function printUsage(): void {
	console.error(
		"Usage: bun scripts/birthday-add.ts [--no-discord] <userId> <DD.MM.> <timezone> [year]",
	);
	console.error(
		"Example: bun scripts/birthday-add.ts 123456789012345678 24.12. Prague 1990",
	);
	console.error(
		"         bun scripts/birthday-add.ts --no-discord 123456789012345678 24.12. Prague",
	);
}

const rawArgs = process.argv.slice(2);
const noDiscord = rawArgs.includes("--no-discord");
const args = rawArgs.filter((a) => !a.startsWith("--"));

if (args.length < 3) {
	printUsage();
	process.exit(1);
}

const [userId, dayMonthRaw, timezoneRaw, yearRaw] = args;

if (userId === undefined || !/^\d{17,20}$/.test(userId)) {
	console.error("Invalid userId. Must be a Discord snowflake (17-20 digits).");
	process.exit(1);
}

const config = loadConfig();
const logger = createLogger(config.nodeEnv);

try {
	const birthDate = BirthDate.parse(dayMonthRaw ?? "", yearRaw ?? null);
	const timezone = Timezone.resolve(timezoneRaw ?? "");

	const db = createDb(config.dbFilePath);
	const repo = new DrizzleBirthdayRepository(db);
	const auditLog = noDiscord
		? new NullAuditLogPublisher()
		: (() => {
				const discordRest = new REST({ version: "10" }).setToken(
					config.discordToken,
				);
				return new RestAuditLogPublisher(
					discordRest,
					config.logChannelId,
					logger,
					new RestUserNameResolver(discordRest),
				);
			})();
	const clock = new SystemClock();
	const useCase = new SetBirthdayUseCase(repo, auditLog, clock);

	const result = await useCase.execute(userId, birthDate, timezone, "cli");
	const action = result.created ? "Set" : "Updated";
	console.log(
		`${action} birthday for user ${userId}: ${birthDate.formatWithYear()}, ${timezone.ianaId}`,
	);
} catch (err) {
	if (err instanceof AppError) {
		console.error(err.message);
		process.exit(1);
	}
	throw err;
}
