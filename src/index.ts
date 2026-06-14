import { Events, REST } from "discord.js";
import { BirthdayAddHandler } from "./adapters/discord/birthday-add.handler.ts";
import { BirthdayNextHandler } from "./adapters/discord/birthday-next.handler.ts";
import { BirthdayRemoveHandler } from "./adapters/discord/birthday-remove.handler.ts";
import { createDiscordClient } from "./adapters/discord/client.ts";
import { registerInteractionRouter } from "./adapters/discord/interaction-router.ts";
import {
	IntervalScheduler,
	TICK_INTERVAL_MS,
} from "./adapters/scheduler/interval-scheduler.ts";
import { GetBirthdayUseCase } from "./application/use-cases/get-birthday.ts";
import { GetNextBirthdayUseCase } from "./application/use-cases/get-next-birthday.ts";
import { RemoveBirthdayUseCase } from "./application/use-cases/remove-birthday.ts";
import { RunDueBirthdaysUseCase } from "./application/use-cases/run-due-birthdays.ts";
import { SetBirthdayUseCase } from "./application/use-cases/set-birthday.ts";
import { loadConfig } from "./infrastructure/config/env.ts";
import { createDb } from "./infrastructure/db/client.ts";
import { DrizzleBirthdayRepository } from "./infrastructure/db/drizzle-birthday-repository.ts";
import { RestAnnouncementPublisher } from "./infrastructure/discord/rest-announcement-publisher.ts";
import { RestAuditLogPublisher } from "./infrastructure/discord/rest-audit-log-publisher.ts";
import { RestMembershipChecker } from "./infrastructure/discord/rest-membership-checker.ts";
import { RestUserNameResolver } from "./infrastructure/discord/rest-user-name-resolver.ts";
import { validateChannels } from "./infrastructure/discord/startup-validation.ts";
import { createLogger } from "./infrastructure/logging/logger.ts";
import { MathRandomSource } from "./infrastructure/math-random-source.ts";
import { SystemClock } from "./infrastructure/system-clock.ts";

const config = loadConfig();
const logger = createLogger(config.nodeEnv);

logger.info("Starting birthday bot...");

const db = createDb(config.dbFilePath);
const repo = new DrizzleBirthdayRepository(db);
const rest = new REST({ version: "10" }).setToken(config.discordToken);
const nameResolver = new RestUserNameResolver(rest);
const auditLog = new RestAuditLogPublisher(
	rest,
	config.logChannelId,
	logger,
	nameResolver,
);
const announcements = new RestAnnouncementPublisher(
	rest,
	config.birthdayPostChannelId,
);
const clock = new SystemClock();
const random = new MathRandomSource();

// Validate channels are reachable before logging in; also yields guildId for membership checks
const { postChannelGuildId } = await validateChannels(
	rest,
	config.birthdayPostChannelId,
	config.logChannelId,
);

if (postChannelGuildId === null) {
	logger.warn(
		"Birthday post channel has no guild_id (DM channel?); membership checks disabled",
	);
}

const membership =
	postChannelGuildId !== null
		? new RestMembershipChecker(rest, postChannelGuildId)
		: undefined;

const setBirthday = new SetBirthdayUseCase(repo, auditLog, clock);
const getBirthday = new GetBirthdayUseCase(repo);
const removeBirthday = new RemoveBirthdayUseCase(repo, auditLog);
const getNextBirthday = new GetNextBirthdayUseCase(repo, clock);
const runDueBirthdays = new RunDueBirthdaysUseCase(
	repo,
	announcements,
	clock,
	random,
	logger,
	TICK_INTERVAL_MS,
	membership,
);

const client = createDiscordClient();
const addHandler = new BirthdayAddHandler(getBirthday, setBirthday, logger);
const removeHandler = new BirthdayRemoveHandler(
	getBirthday,
	removeBirthday,
	logger,
);
const nextHandler = new BirthdayNextHandler(getNextBirthday, logger);
const scheduler = new IntervalScheduler(runDueBirthdays, logger);

registerInteractionRouter(
	client,
	addHandler,
	removeHandler,
	nextHandler,
	logger,
);

async function shutdown(signal: string): Promise<void> {
	logger.info({ signal }, "Shutting down...");
	scheduler.stop();
	await auditLog.publishSystem(`Bot shutting down (${signal})`);
	await client.destroy();
	process.exit(0);
}

client.once(Events.ClientReady, (readyClient) => {
	logger.info({ tag: readyClient.user.tag }, "Discord client ready");
	void auditLog.publishSystem(`Bot online as ${readyClient.user.tag}`);
	scheduler.start();
});

client.on(Events.Error, (err) => {
	logger.error({ err }, "Discord client error");
	void auditLog.publishSystem(`Gateway error: ${(err as Error).message}`);
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(config.discordToken);
