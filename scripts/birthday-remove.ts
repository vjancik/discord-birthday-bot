import { REST } from "discord.js";
import { RemoveBirthdayUseCase } from "../src/application/use-cases/remove-birthday.ts";
import { AppError } from "../src/domain/errors.ts";
import { loadConfig } from "../src/infrastructure/config/env.ts";
import { createDb } from "../src/infrastructure/db/client.ts";
import { DrizzleBirthdayRepository } from "../src/infrastructure/db/drizzle-birthday-repository.ts";
import { RestAuditLogPublisher } from "../src/infrastructure/discord/rest-audit-log-publisher.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";

function printUsage(): void {
	console.error("Usage: bun scripts/birthday-remove.ts <userId>");
	console.error("Example: bun scripts/birthday-remove.ts 123456789012345678");
}

const args = process.argv.slice(2);
if (args.length < 1) {
	printUsage();
	process.exit(1);
}

const userId = args[0];

if (userId === undefined || !/^\d{17,20}$/.test(userId)) {
	console.error("Invalid userId. Must be a Discord snowflake (17-20 digits).");
	process.exit(1);
}

const config = loadConfig();
const logger = createLogger(config.nodeEnv);

try {
	const db = createDb(config.dbFilePath);
	const repo = new DrizzleBirthdayRepository(db);
	const rest = new REST({ version: "10" }).setToken(config.discordToken);
	const auditLog = new RestAuditLogPublisher(rest, config.logChannelId, logger);
	const useCase = new RemoveBirthdayUseCase(repo, auditLog);

	await useCase.execute(userId, "cli");
	console.log(`Removed birthday for user ${userId}.`);
} catch (err) {
	if (err instanceof AppError) {
		console.error(err.message);
		process.exit(1);
	}
	throw err;
}
