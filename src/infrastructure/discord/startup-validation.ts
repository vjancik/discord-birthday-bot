import { DiscordAPIError, type REST, Routes } from "discord.js";
import { ConfigError } from "../../domain/errors.ts";

interface ChannelResponse {
	guild_id?: string;
}

export async function validateChannels(
	rest: REST,
	postChannelId: string,
	logChannelId: string,
): Promise<{ postChannelGuildId: string | null }> {
	const [postChannel, _logChannel] = await Promise.all([
		fetchChannel(rest, postChannelId, "BIRTHDAY_POST_CHANNEL"),
		fetchChannel(rest, logChannelId, "BD_BOT_LOG_CHANNEL"),
	]);

	return { postChannelGuildId: postChannel.guild_id ?? null };
}

async function fetchChannel(
	rest: REST,
	channelId: string,
	envVarName: string,
): Promise<ChannelResponse> {
	try {
		return (await rest.get(Routes.channel(channelId))) as ChannelResponse;
	} catch (err) {
		if (err instanceof DiscordAPIError) {
			throw new ConfigError(
				`Channel ${envVarName}=${channelId} is not reachable: ${err.message} (code ${err.code})`,
			);
		}
		throw err;
	}
}
