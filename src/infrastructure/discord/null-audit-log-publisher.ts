import type {
	AuditEvent,
	AuditLogPublisher,
} from "../../application/ports/audit-log-publisher.ts";

export class NullAuditLogPublisher implements AuditLogPublisher {
	async publish(_event: AuditEvent): Promise<void> {}
	async publishSystem(_message: string): Promise<void> {}
}
