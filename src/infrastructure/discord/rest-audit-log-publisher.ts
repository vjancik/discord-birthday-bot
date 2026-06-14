import { type REST, Routes } from "discord.js";
import type { Logger } from "pino";
import type {
	AuditEvent,
	AuditLogPublisher,
} from "../../application/ports/audit-log-publisher.ts";
import type { UserNameResolver } from "../../application/ports/user-name-resolver.ts";

export class RestAuditLogPublisher implements AuditLogPublisher {
	constructor(
		private readonly rest: REST,
		private readonly logChannelId: string,
		private readonly logger: Logger,
		private readonly nameResolver?: UserNameResolver,
	) {}

	async publish(event: AuditEvent): Promise<void> {
		const action = event.action.toUpperCase();

		let name = event.userName;
		if (name === undefined && this.nameResolver !== undefined) {
			try {
				name = (await this.nameResolver.resolve(event.userId)) ?? undefined;
			} catch {
				// resolver threw unexpectedly — fall back to bare id
			}
		}

		const who =
			name !== undefined ? `${name} [${event.userId}]` : `user ${event.userId}`;

		const parts = [`[${action}] (${event.source}) ${who}`];
		if (event.birthDate !== undefined)
			parts.push(`birthday: ${event.birthDate}`);
		if (event.timezone !== undefined) parts.push(`timezone: ${event.timezone}`);
		await this.post(parts.join(", "));
	}

	async publishSystem(message: string): Promise<void> {
		await this.post(`[SYSTEM] ${message}`);
	}

	private async post(content: string): Promise<void> {
		try {
			await this.rest.post(Routes.channelMessages(this.logChannelId), {
				body: { content },
			});
		} catch (err) {
			this.logger.error(
				{ err, content },
				"Failed to post audit log to Discord channel",
			);
		}
	}
}
