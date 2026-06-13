import { SlashCommandBuilder } from "discord.js";

export const birthdayAddCommand = new SlashCommandBuilder()
	.setName("birthday_add")
	.setDescription(
		"Set or update your birthday so the bot can celebrate with you!",
	);

export const birthdayRemoveCommand = new SlashCommandBuilder()
	.setName("birthday_remove")
	.setDescription("Remove your birthday from the bot.");

export const commandDefinitions = [
	birthdayAddCommand.toJSON(),
	birthdayRemoveCommand.toJSON(),
];
