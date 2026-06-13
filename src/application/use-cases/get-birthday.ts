import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../ports/birthday-repository.ts";

export class GetBirthdayUseCase {
	constructor(private readonly repo: BirthdayRepository) {}

	execute(userId: string): BirthdayRecord | null {
		return this.repo.findByUserId(userId);
	}
}
