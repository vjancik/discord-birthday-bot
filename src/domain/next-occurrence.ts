import { DateTime } from "luxon";
import type { BirthDate } from "./birth-date.ts";
import type { Timezone } from "./timezone.ts";

export function nextOccurrenceUtc(
	birthDate: BirthDate,
	timezone: Timezone,
	afterUtcMillis: number,
): number {
	const zone = timezone.ianaId;
	const localNow = DateTime.fromMillis(afterUtcMillis, { zone });

	for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
		const candidateYear = localNow.year + yearOffset;
		let day = birthDate.day;
		let month = birthDate.month;

		// Feb 29 on non-leap years → celebrate Feb 28
		if (birthDate.isFeb29()) {
			const testDate = DateTime.fromObject(
				{ year: candidateYear, month: 2, day: 29 },
				{ zone },
			);
			if (!testDate.isValid) {
				day = 28;
				month = 2;
			}
		}

		const candidate = DateTime.fromObject(
			{
				year: candidateYear,
				month,
				day,
				hour: 12,
				minute: 0,
				second: 0,
				millisecond: 0,
			},
			{ zone },
		);

		if (!candidate.isValid) continue;

		const candidateMs = candidate.toMillis();
		if (candidateMs > afterUtcMillis) {
			return candidateMs;
		}
	}

	// Fallback: two years out (handles edge case where afterUtcMillis is exactly at trigger)
	const fallbackYear = localNow.year + 2;
	let day = birthDate.day;
	let month = birthDate.month;

	if (birthDate.isFeb29()) {
		const testDate = DateTime.fromObject(
			{ year: fallbackYear, month: 2, day: 29 },
			{ zone },
		);
		if (!testDate.isValid) {
			day = 28;
			month = 2;
		}
	}

	const fallback = DateTime.fromObject(
		{
			year: fallbackYear,
			month,
			day,
			hour: 12,
			minute: 0,
			second: 0,
			millisecond: 0,
		},
		{ zone },
	);

	return fallback.toMillis();
}

export function isSameBirthdayLocalDay(
	birthDate: BirthDate,
	timezone: Timezone,
	utcMillis: number,
): boolean {
	const zone = timezone.ianaId;
	const localNow = DateTime.fromMillis(utcMillis, { zone });
	const localMonth = localNow.month;
	const localDay = localNow.day;

	if (birthDate.month === localMonth && birthDate.day === localDay) return true;

	// Feb 29 birthday → also match Feb 28 on non-leap year
	if (birthDate.isFeb29() && localMonth === 2 && localDay === 28) {
		const isLeap = localNow.isInLeapYear;
		return !isLeap;
	}

	return false;
}
