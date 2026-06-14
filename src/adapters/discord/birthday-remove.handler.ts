import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	MessageFlags,
} from "discord.js";
import type { Logger } from "pino";
import type { GetBirthdayUseCase } from "../../application/use-cases/get-birthday.ts";
import type { RemoveBirthdayUseCase } from "../../application/use-cases/remove-birthday.ts";
import { BirthdayNotFoundError } from "../../domain/errors.ts";
import { formatUserName } from "../../infrastructure/discord/format-user-name.ts";
import { birthdayRemoveNoId, birthdayRemoveYesId } from "./custom-ids.ts";

export class BirthdayRemoveHandler {
	constructor(
		private readonly getBirthday: GetBirthdayUseCase,
		private readonly removeBirthday: RemoveBirthdayUseCase,
		private readonly logger: Logger,
	) {}

	async handle(interaction: ChatInputCommandInteraction): Promise<void> {
		const userId = interaction.user.id;
		const existing = this.getBirthday.execute(userId);

		if (existing === null) {
			await interaction.reply({
				content: "Your birthday isn't set yet.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const nonce = interaction.id;
		const yesId = birthdayRemoveYesId(nonce);
		const noId = birthdayRemoveNoId(nonce);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(yesId)
				.setLabel("Yes, remove it")
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId(noId)
				.setLabel("No, keep it")
				.setStyle(ButtonStyle.Secondary),
		);

		await interaction.reply({
			content: "Are you sure you want to remove your birthday from the bot?",
			components: [row],
			flags: MessageFlags.Ephemeral,
		});

		const replyMsg = await interaction.fetchReply();
		const buttonInteraction = await replyMsg
			.awaitMessageComponent({
				componentType: ComponentType.Button,
				filter: (i) =>
					i.user.id === userId && (i.customId === yesId || i.customId === noId),
				time: 60_000,
			})
			.catch(() => null);

		if (buttonInteraction === null || buttonInteraction.customId === noId) {
			if (buttonInteraction !== null) {
				await buttonInteraction.update({
					content: "No changes made.",
					components: [],
				});
			} else {
				await interaction.editReply({
					content: "Timed out. No changes made.",
					components: [],
				});
			}
			return;
		}

		try {
			const userName = formatUserName(
				interaction.user.globalName,
				interaction.user.username,
			);
			await this.removeBirthday.execute(userId, "discord", userName);
			await buttonInteraction.update({
				content: "Your birthday has been removed.",
				components: [],
			});
		} catch (err) {
			if (err instanceof BirthdayNotFoundError) {
				await buttonInteraction.update({
					content: "Your birthday isn't set yet.",
					components: [],
				});
			} else {
				this.logger.error(
					{ err, userId },
					"Unexpected error in birthday_remove",
				);
				await buttonInteraction.update({
					content: "Something went wrong. Please try again later.",
					components: [],
				});
			}
		}
	}
}
