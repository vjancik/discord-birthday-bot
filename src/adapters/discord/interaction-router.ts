import { type Client, Events, MessageFlags } from "discord.js";
import type { Logger } from "pino";
import type { BirthdayAddHandler } from "./birthday-add.handler.ts";
import type { BirthdayNextHandler } from "./birthday-next.handler.ts";
import type { BirthdayRemoveHandler } from "./birthday-remove.handler.ts";

export function registerInteractionRouter(
	client: Client,
	addHandler: BirthdayAddHandler,
	removeHandler: BirthdayRemoveHandler,
	nextHandler: BirthdayNextHandler,
	logger: Logger,
): void {
	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) return;

		try {
			if (interaction.commandName === "birthday_add") {
				await addHandler.handle(interaction);
			} else if (interaction.commandName === "birthday_remove") {
				await removeHandler.handle(interaction);
			} else if (interaction.commandName === "birthday_next") {
				await nextHandler.handle(interaction);
			}
		} catch (err) {
			logger.error(
				{ err, commandName: interaction.commandName },
				"Unhandled error in interaction",
			);
			if (!interaction.replied && !interaction.deferred) {
				await interaction
					.reply({
						content: "An unexpected error occurred. Please try again later.",
						flags: MessageFlags.Ephemeral,
					})
					.catch(() => undefined);
			}
		}
	});
}
