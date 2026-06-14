import {
	ActionRowBuilder,
	ComponentType,
	ModalBuilder,
	type ModalSubmitInteraction,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { BirthDate } from "../../domain/birth-date.ts";
import { Timezone } from "../../domain/timezone.ts";
import {
	MODAL_FIELD_DAY_MONTH,
	MODAL_FIELD_TIMEZONE,
	MODAL_FIELD_YEAR,
} from "./custom-ids.ts";

export interface ModalPrefill {
	dayMonth: string;
	year: string;
	timezone: string;
}

export function buildBirthdayModal(
	modalId: string,
	prefill?: ModalPrefill,
): ModalBuilder {
	const dayMonthInput = new TextInputBuilder({
		customId: MODAL_FIELD_DAY_MONTH,
		label: "Day and month of birth",
		style: TextInputStyle.Short,
		placeholder: "DD.MM. — e.g. 24.12.",
		required: true,
		maxLength: 6,
	});

	if (prefill?.dayMonth !== undefined) {
		dayMonthInput.setValue(prefill.dayMonth);
	}

	const yearInput = new TextInputBuilder({
		customId: MODAL_FIELD_YEAR,
		label: "Year of birth (optional)",
		style: TextInputStyle.Short,
		placeholder: "e.g. 1990 — optional",
		required: false,
		maxLength: 4,
	});

	if (prefill?.year !== undefined && prefill.year !== "") {
		yearInput.setValue(prefill.year);
	}

	const timezoneInput = new TextInputBuilder({
		customId: MODAL_FIELD_TIMEZONE,
		label: "Your timezone (posts at noon)",
		style: TextInputStyle.Short,
		placeholder:
			"Major / Capital City or IANA zone — e.g. Prague or Europe/Prague",
		required: true,
		maxLength: 64,
	});

	if (prefill?.timezone !== undefined) {
		timezoneInput.setValue(prefill.timezone);
	}

	const disclaimer = {
		type: ComponentType.TextDisplay,
		content:
			"⚠️ You can only update your birth date **once every two weeks** and the birthday notification will only trigger **once per calendar year**!",
	};

	return new ModalBuilder({
		customId: modalId,
		title: "Set your birthday",
		components: [
			disclaimer,
			new ActionRowBuilder<TextInputBuilder>().addComponents(dayMonthInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(yearInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput),
		],
	});
}

export interface ParsedBirthday {
	birthDate: BirthDate;
	timezone: Timezone;
}

export function parseModalSubmit(
	interaction: ModalSubmitInteraction,
): ParsedBirthday {
	const dayMonthRaw = interaction.fields.getTextInputValue(
		MODAL_FIELD_DAY_MONTH,
	);
	const yearRaw = interaction.fields.getTextInputValue(MODAL_FIELD_YEAR);
	const timezoneRaw =
		interaction.fields.getTextInputValue(MODAL_FIELD_TIMEZONE);

	const birthDate = BirthDate.parse(dayMonthRaw, yearRaw);
	const timezone = Timezone.resolve(timezoneRaw);

	return { birthDate, timezone };
}
