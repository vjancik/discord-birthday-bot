import { DateTime } from "luxon";
import type { Logger } from "pino";
import { BirthDate } from "../../domain/birth-date.ts";
import {
	isSameBirthdayLocalDay,
	nextOccurrenceUtc,
} from "../../domain/next-occurrence.ts";
import { Timezone } from "../../domain/timezone.ts";
import { formatAnnouncement } from "../../domain/well-wishes.ts";
import type { AnnouncementPublisher } from "../ports/announcement-publisher.ts";
import type { BirthdayRepository } from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";
import type { RandomSource } from "../ports/random-source.ts";

export class RunDueBirthdaysUseCase {
	constructor(
		private readonly repo: BirthdayRepository,
		private readonly announcements: AnnouncementPublisher,
		private readonly clock: Clock,
		private readonly random: RandomSource,
		private readonly logger: Logger,
		private readonly timeoutMs: number,
	) {}

	async execute(): Promise<void> {
		const now = this.clock.nowUtcMillis();
		const due = this.repo.findDue(now);
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), this.timeoutMs);

		try {
			for (const record of due) {
				try {
					await this.processRecord(record, now, abort.signal);
				} catch (err) {
					this.logger.error(
						{ err, userId: record.userId },
						"Error processing due birthday",
					);
				}
			}
		} finally {
			clearTimeout(timer);
		}
	}

	private async processRecord(
		record: {
			userId: string;
			day: number;
			month: number;
			year: number | null;
			timezone: string;
			lastPostedAtUtc: number | null;
		},
		now: number,
		signal: AbortSignal,
	): Promise<void> {
		const birthDate = BirthDate.parse(
			`${String(record.day).padStart(2, "0")}.${String(record.month).padStart(2, "0")}.`,
			record.year !== null ? String(record.year) : null,
		);
		const timezone = Timezone.resolve(record.timezone);

		const nextTrigger = nextOccurrenceUtc(birthDate, timezone, now);

		if (!this.shouldPost(birthDate, timezone, record.lastPostedAtUtc, now)) {
			// Not the user's birthday or already posted — advance trigger so the row stops firing
			this.repo.reschedule(record.userId, nextTrigger, record.lastPostedAtUtc);
			return;
		}

		const message = formatAnnouncement(record.userId, this.random);
		await this.announcements.publishBirthday(message, signal);
		// Reschedule only after confirmed publish — allows retry on next tick if REST fails
		this.repo.reschedule(record.userId, nextTrigger, now);
		this.logger.info({ userId: record.userId }, "Posted birthday announcement");
	}

	private shouldPost(
		birthDate: BirthDate,
		timezone: Timezone,
		lastPostedAtUtc: number | null,
		now: number,
	): boolean {
		// Catch-up policy: only post if it's still the user's birthday in their local zone
		if (!isSameBirthdayLocalDay(birthDate, timezone, now)) {
			return false;
		}

		// Double-post guard: skip if already posted today in user's local zone
		if (lastPostedAtUtc !== null) {
			const zone = timezone.ianaId;
			const lastPostedLocal = DateTime.fromMillis(lastPostedAtUtc, { zone });
			const nowLocal = DateTime.fromMillis(now, { zone });
			if (
				lastPostedLocal.year === nowLocal.year &&
				lastPostedLocal.month === nowLocal.month &&
				lastPostedLocal.day === nowLocal.day
			) {
				return false;
			}
		}

		return true;
	}
}
