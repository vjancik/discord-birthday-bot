export function formatUserName(
	globalName: string | null,
	username: string,
): string {
	return globalName ? `${globalName} (@${username})` : `@${username}`;
}
