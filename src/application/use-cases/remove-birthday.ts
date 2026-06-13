import { BirthdayNotFoundError } from "../../domain/errors.ts";
import type {
	AuditLogPublisher,
	AuditSource,
} from "../ports/audit-log-publisher.ts";
import type { BirthdayRepository } from "../ports/birthday-repository.ts";

export class RemoveBirthdayUseCase {
	constructor(
		private readonly repo: BirthdayRepository,
		private readonly auditLog: AuditLogPublisher,
	) {}

	async execute(userId: string, source: AuditSource): Promise<void> {
		const existing = this.repo.findByUserId(userId);
		if (existing === null) {
			throw new BirthdayNotFoundError(userId);
		}

		this.repo.delete(userId);

		await this.auditLog.publish({
			action: "remove",
			source,
			userId,
		});
	}
}
