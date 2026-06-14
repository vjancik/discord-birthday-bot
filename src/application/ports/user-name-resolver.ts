export interface UserNameResolver {
	resolve(userId: string): Promise<string | null>;
}
