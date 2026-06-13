import { InvalidBirthDateError } from "./errors.ts";

const DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isValidCalendarDay(day: number, month: number): boolean {
	const maxDays = DAYS_IN_MONTH[month];
	if (maxDays === undefined) return false;
	return day >= 1 && day <= maxDays;
}

export class BirthDate {
	readonly day: number;
	readonly month: number;
	readonly year: number | null;

	private constructor(day: number, month: number, year: number | null) {
		this.day = day;
		this.month = month;
		this.year = year;
	}

	static parse(
		dayMonthRaw: string,
		yearRaw: string | null | undefined,
	): BirthDate {
		const trimmed = dayMonthRaw.trim();
		const match = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(trimmed);
		if (!match) {
			throw new InvalidBirthDateError(
				`Invalid date format "${dayMonthRaw}". Use DD.MM. format, e.g. 24.12.`,
			);
		}

		const day = Number(match[1]);
		const month = Number(match[2]);

		if (month < 1 || month > 12) {
			throw new InvalidBirthDateError(
				`Invalid month ${month}. Month must be between 1 and 12.`,
			);
		}

		if (!isValidCalendarDay(day, month)) {
			throw new InvalidBirthDateError(
				`Invalid day ${day} for month ${month}. Day must be between 1 and ${DAYS_IN_MONTH[month] ?? 31}.`,
			);
		}

		let year: number | null = null;
		if (yearRaw !== null && yearRaw !== undefined) {
			const trimmedYear = yearRaw.trim();
			if (trimmedYear !== "") {
				const parsedYear = Number(trimmedYear);
				if (!/^\d{4}$/.test(trimmedYear) || Number.isNaN(parsedYear)) {
					throw new InvalidBirthDateError(
						`Invalid year "${yearRaw}". Enter a 4-digit year, e.g. 1990.`,
					);
				}
				const currentYear = new Date().getFullYear();
				if (parsedYear < 1900 || parsedYear > currentYear) {
					throw new InvalidBirthDateError(
						`Year ${parsedYear} is out of range. Enter a year between 1900 and ${currentYear}.`,
					);
				}
				year = parsedYear;
			}
		}

		return new BirthDate(day, month, year);
	}

	format(): string {
		const d = String(this.day).padStart(2, "0");
		const m = String(this.month).padStart(2, "0");
		return `${d}.${m}.`;
	}

	formatWithYear(): string {
		if (this.year === null) return this.format();
		return `${this.format()}${this.year}`;
	}

	isFeb29(): boolean {
		return this.day === 29 && this.month === 2;
	}
}
