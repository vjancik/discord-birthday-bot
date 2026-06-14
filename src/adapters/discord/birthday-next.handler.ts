import { type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import type { Logger } from "pino";
import type { GetNextBirthdayUseCase } from "../../application/use-cases/get-next-birthday.ts";

export class BirthdayNextHandler {
	constructor(
		private readonly getNextBirthday: GetNextBirthdayUseCase,
		private readonly logger: Logger,
	) {}

	async handle(interaction: ChatInputCommandInteraction): Promise<void> {
		const record = this.getNextBirthday.execute();

		if (record === null) {
			await interaction.reply({
				content: "No birthdays are set yet.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const unixSeconds = Math.floor(record.nextTriggerAtUtc / 1000);
		const content = `The next birthday is <@${record.userId}> on <t:${unixSeconds}:F>. 🎂`;

		this.logger.info(
			{ userId: record.userId, nextTriggerAtUtc: record.nextTriggerAtUtc },
			"Replied to birthday_next",
		);

		await interaction.reply({
			content,
			flags: MessageFlags.Ephemeral,
			// Suppress the ping while still rendering the mention as a name
			allowedMentions: { parse: [] },
		});
	}
}
