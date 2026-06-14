import { BirthdayNotFoundError } from "../../domain/errors.ts";
import type {
	AuditLogPublisher,
	AuditSource,
} from "../ports/audit-log-publisher.ts";
import type { BirthdayRepository } from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";

export class RemoveBirthdayUseCase {
	constructor(
		private readonly repo: BirthdayRepository,
		private readonly auditLog: AuditLogPublisher,
		private readonly clock: Clock,
	) {}

	async execute(
		userId: string,
		source: AuditSource,
		userName?: string,
	): Promise<void> {
		const existing = this.repo.findByUserId(userId);
		if (existing === null || existing.removedAt !== null) {
			throw new BirthdayNotFoundError(userId);
		}

		const now = this.clock.nowUtcMillis();
		this.repo.delete(userId, now);

		await this.auditLog.publish({
			action: "remove",
			source,
			userId,
			userName,
		});
	}
}
