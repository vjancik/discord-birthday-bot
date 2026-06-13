import { REST } from "discord.js";
import { SetBirthdayUseCase } from "../src/application/use-cases/set-birthday.ts";
import { BirthDate } from "../src/domain/birth-date.ts";
import { AppError } from "../src/domain/errors.ts";
import { Timezone } from "../src/domain/timezone.ts";
import { loadConfig } from "../src/infrastructure/config/env.ts";
import { createDb } from "../src/infrastructure/db/client.ts";
import { DrizzleBirthdayRepository } from "../src/infrastructure/db/drizzle-birthday-repository.ts";
import { RestAuditLogPublisher } from "../src/infrastructure/discord/rest-audit-log-publisher.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";
import { SystemClock } from "../src/infrastructure/system-clock.ts";

function printUsage(): void {
	console.error(
		"Usage: bun scripts/birthday-add.ts <userId> <DD.MM.> <timezone> [year]",
	);
	console.error(
		"Example: bun scripts/birthday-add.ts 123456789012345678 24.12. Prague 1990",
	);
}

const args = process.argv.slice(2);
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
	const rest = new REST({ version: "10" }).setToken(config.discordToken);
	const auditLog = new RestAuditLogPublisher(rest, config.logChannelId, logger);
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
