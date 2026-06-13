import type { RandomSource } from "../application/ports/random-source.ts";

export const WELL_WISHES = [
	"Wishing you a fantastic year ahead!",
	"Hope your day is as wonderful as you are!",
	"May this year bring you joy and everything you wish for!",
	"Sending you all the best on your special day!",
	"Here's to another amazing trip around the sun!",
	"May your birthday be the start of a wonderful new chapter!",
	"Wishing you happiness, health, and great adventures this year!",
	"Hope you're surrounded by love and laughter today!",
	"May all your birthday wishes come true!",
	"Cheers to you — have an absolutely brilliant day!",
] as const;

export function formatAnnouncement(
	userId: string,
	random: RandomSource,
): string {
	const index = Math.floor(random.next() * WELL_WISHES.length);
	const wish = WELL_WISHES[index] ?? WELL_WISHES[0];
	return `Happy birthday <@${userId}>! 🎉 ${wish}`;
}
