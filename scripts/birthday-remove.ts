import { REST } from "discord.js";
import { RemoveBirthdayUseCase } from "../src/application/use-cases/remove-birthday.ts";
import { AppError } from "../src/domain/errors.ts";
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
		"Usage: bun scripts/birthday-remove.ts [--no-discord] <userId>",
	);
	console.error("Example: bun scripts/birthday-remove.ts 123456789012345678");
	console.error(
		"         bun scripts/birthday-remove.ts --no-discord 123456789012345678",
	);
}

const rawArgs = process.argv.slice(2);
const noDiscord = rawArgs.includes("--no-discord");
const args = rawArgs.filter((a) => !a.startsWith("--"));

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
	const useCase = new RemoveBirthdayUseCase(repo, auditLog, new SystemClock());

	await useCase.execute(userId, "cli");
	console.log(`Removed birthday for user ${userId}.`);
} catch (err) {
	if (err instanceof AppError) {
		console.error(err.message);
		process.exit(1);
	}
	throw err;
}
