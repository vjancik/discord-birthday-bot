import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	ComponentType,
	MessageFlags,
} from "discord.js";
import type { Logger } from "pino";
import type { GetBirthdayUseCase } from "../../application/use-cases/get-birthday.ts";
import type { SetBirthdayUseCase } from "../../application/use-cases/set-birthday.ts";
import { AppError } from "../../domain/errors.ts";
import { formatUserName } from "../../infrastructure/discord/format-user-name.ts";
import { buildBirthdayModal, parseModalSubmit } from "./birthday-modal.ts";
import {
	birthdayAddModalId,
	birthdayAddUpdateNoId,
	birthdayAddUpdateYesId,
} from "./custom-ids.ts";

export class BirthdayAddHandler {
	constructor(
		private readonly getBirthday: GetBirthdayUseCase,
		private readonly setBirthday: SetBirthdayUseCase,
		private readonly logger: Logger,
	) {}

	async handle(interaction: ChatInputCommandInteraction): Promise<void> {
		const userId = interaction.user.id;
		const nonce = interaction.id;
		const existing = this.getBirthday.execute(userId);

		if (existing === null) {
			// No existing birthday — show modal immediately (must be first ack)
			const modalId = birthdayAddModalId(nonce);
			await interaction.showModal(buildBirthdayModal(modalId));
			await this.awaitAndProcessModal(interaction, modalId);
			return;
		}

		// Existing birthday — ask for confirmation first
		const yesId = birthdayAddUpdateYesId(nonce);
		const noId = birthdayAddUpdateNoId(nonce);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(yesId)
				.setLabel("Yes")
				.setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(noId)
				.setLabel("No")
				.setStyle(ButtonStyle.Secondary),
		);

		await interaction.reply({
			content:
				"Your birthday is already configured. Would you like to update your information?",
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
					content: "Okay, nothing changed.",
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

		// User clicked Yes — show modal with prefill
		const modalId = birthdayAddModalId(nonce);
		const prefill = {
			dayMonth: `${String(existing.day).padStart(2, "0")}.${String(existing.month).padStart(2, "0")}.`,
			year: existing.year !== null ? String(existing.year) : "",
			timezone: existing.timezone,
		};

		await buttonInteraction.showModal(buildBirthdayModal(modalId, prefill));
		// Clear buttons on the original reply
		await interaction.editReply({ components: [] });

		await this.awaitAndProcessModal(buttonInteraction, modalId);
	}

	private async awaitAndProcessModal(
		triggerInteraction: ChatInputCommandInteraction | ButtonInteraction,
		modalId: string,
	): Promise<void> {
		const userId = triggerInteraction.user.id;

		const submitInteraction = await triggerInteraction
			.awaitModalSubmit({
				filter: (i) => i.user.id === userId && i.customId === modalId,
				time: 300_000,
			})
			.catch(() => null);

		if (submitInteraction === null) return;

		try {
			const { birthDate, timezone } = parseModalSubmit(submitInteraction);
			const userName = formatUserName(
				triggerInteraction.user.globalName,
				triggerInteraction.user.username,
			);
			const result = await this.setBirthday.execute(
				userId,
				birthDate,
				timezone,
				"discord",
				userName,
			);

			const action = result.created ? "set" : "updated";
			await submitInteraction.reply({
				content: `Birthday ${action}! I'll post at noon (${timezone.ianaId}) on ${birthDate.format()} 🎂`,
				flags: MessageFlags.Ephemeral,
			});
		} catch (err) {
			if (err instanceof AppError) {
				await submitInteraction.reply({
					content: err.message,
					flags: MessageFlags.Ephemeral,
				});
			} else {
				this.logger.error(
					{ err, userId },
					"Unexpected error in birthday_add modal submit",
				);
				await submitInteraction.reply({
					content: "Something went wrong. Please try again later.",
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	}
}
