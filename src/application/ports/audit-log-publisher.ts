export type AuditAction = "add" | "update" | "remove" | "update_rejected";
export type AuditSource = "discord" | "cli";

export interface AuditEvent {
	action: AuditAction;
	source: AuditSource;
	userId: string;
	birthDate?: string;
	timezone?: string;
}

export interface AuditLogPublisher {
	publish(event: AuditEvent): Promise<void>;
	publishSystem(message: string): Promise<void>;
}
