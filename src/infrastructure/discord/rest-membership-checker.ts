import { DiscordAPIError, type REST, Routes } from "discord.js";
import type { MembershipChecker } from "../../application/ports/membership-checker.ts";

export class RestMembershipChecker implements MembershipChecker {
	constructor(
		private readonly rest: REST,
		private readonly guildId: string,
	) {}

	async isMember(userId: string): Promise<boolean> {
		try {
			await this.rest.get(Routes.guildMember(this.guildId, userId));
			return true;
		} catch (err) {
			if (err instanceof DiscordAPIError && err.code === 10007) {
				// Unknown Member — user is not in the guild
				return false;
			}
			throw err;
		}
	}
}
