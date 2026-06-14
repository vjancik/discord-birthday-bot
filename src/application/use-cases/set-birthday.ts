import type { BirthDate } from "../../domain/birth-date.ts";
import { BirthDateChangeCooldownError } from "../../domain/errors.ts";
import { nextOccurrenceUtc } from "../../domain/next-occurrence.ts";
import type { Timezone } from "../../domain/timezone.ts";
import type {
	AuditLogPublisher,
	AuditSource,
} from "../ports/audit-log-publisher.ts";
import type { BirthdayRepository } from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export interface SetBirthdayResult {
	created: boolean;
}

export class SetBirthdayUseCase {
	constructor(
		private readonly repo: BirthdayRepository,
		private readonly auditLog: AuditLogPublisher,
		private readonly clock: Clock,
	) {}

	async execute(
		userId: string,
		birthDate: BirthDate,
		timezone: Timezone,
		source: AuditSource,
		userName?: string,
	): Promise<SetBirthdayResult> {
		const now = this.clock.nowUtcMillis();
		const existing = this.repo.findByUserId(userId);

		// Treat tombstoned records as having prior data (for cooldown + prefill) but not "active"
		const wasRemoved = existing !== null && existing.removedAt !== null;

		const birthDateChanged =
			existing !== null &&
			(existing.day !== birthDate.day || existing.month !== birthDate.month);

		if (
			source === "discord" &&
			birthDateChanged &&
			existing.lastBirthDateChangeAtUtc !== null &&
			now - existing.lastBirthDateChangeAtUtc < COOLDOWN_MS
		) {
			await this.auditLog.publish({
				action: "update_rejected",
				source,
				userId,
				userName,
				birthDate: birthDate.formatWithYear(),
				timezone: timezone.ianaId,
			});
			throw new BirthDateChangeCooldownError();
		}

		const nextTriggerAtUtc = nextOccurrenceUtc(birthDate, timezone, now);

		// Set on creation or real birth-date change; preserve on tz-only edits and pure reactivation (same data)
		const lastBirthDateChangeAtUtc =
			existing === null || birthDateChanged
				? now
				: existing.lastBirthDateChangeAtUtc;

		this.repo.upsert({
			userId,
			birthDate,
			timezone,
			nextTriggerAtUtc,
			now,
			lastBirthDateChangeAtUtc,
			removedAt: null,
		});

		// Reactivation (removing tombstone) counts as an "add" to the user
		const action = existing === null || wasRemoved ? "add" : "update";
		await this.auditLog.publish({
			action,
			source,
			userId,
			userName,
			birthDate: birthDate.formatWithYear(),
			timezone: timezone.ianaId,
		});

		return { created: existing === null || wasRemoved };
	}
}
