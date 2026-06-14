export interface MembershipChecker {
	isMember(userId: string): Promise<boolean>;
}
