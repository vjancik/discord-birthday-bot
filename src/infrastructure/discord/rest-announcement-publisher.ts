import { type REST, Routes } from "discord.js";
import type { AnnouncementPublisher } from "../../application/ports/announcement-publisher.ts";

export class RestAnnouncementPublisher implements AnnouncementPublisher {
	constructor(
		private readonly rest: REST,
		private readonly channelId: string,
	) {}

	async publishBirthday(content: string, signal: AbortSignal): Promise<void> {
		await this.rest.post(Routes.channelMessages(this.channelId), {
			body: { content },
			signal,
		});
	}
}
