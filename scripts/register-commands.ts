import { REST, Routes } from "discord.js";
import { commandDefinitions } from "../src/adapters/discord/command-definitions.ts";
import { loadConfig } from "../src/infrastructure/config/env.ts";
import { createLogger } from "../src/infrastructure/logging/logger.ts";

const config = loadConfig();
const logger = createLogger(config.nodeEnv);

const rest = new REST({ version: "10" }).setToken(config.discordToken);

try {
	logger.info("Registering application commands...");

	if (config.guildId !== null) {
		await rest.put(
			Routes.applicationGuildCommands(config.clientId, config.guildId),
			{
				body: commandDefinitions,
			},
		);
		logger.info({ guildId: config.guildId }, "Guild commands registered.");
	} else {
		await rest.put(Routes.applicationCommands(config.clientId), {
			body: commandDefinitions,
		});
		logger.info(
			"Global commands registered (may take up to 1 hour to propagate).",
		);
	}
} catch (err) {
	logger.error({ err }, "Failed to register commands");
	process.exit(1);
}
