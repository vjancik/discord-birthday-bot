import { DiscordAPIError, type REST, Routes } from "discord.js";
import type { APIUser } from "discord-api-types/v10";
import type { UserNameResolver } from "../../application/ports/user-name-resolver.ts";
import { formatUserName } from "./format-user-name.ts";

export class RestUserNameResolver implements UserNameResolver {
	constructor(private readonly rest: REST) {}

	async resolve(userId: string): Promise<string | null> {
		try {
			const user = (await this.rest.get(Routes.user(userId))) as APIUser;
			return formatUserName(user.global_name ?? null, user.username);
		} catch (err) {
			if (err instanceof DiscordAPIError) return null;
			throw err;
		}
	}
}
