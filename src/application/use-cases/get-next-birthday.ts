import type {
	BirthdayRecord,
	BirthdayRepository,
} from "../ports/birthday-repository.ts";
import type { Clock } from "../ports/clock.ts";

export class GetNextBirthdayUseCase {
	constructor(
		private readonly repo: BirthdayRepository,
		private readonly clock: Clock,
	) {}

	execute(): BirthdayRecord | null {
		return this.repo.findNextUpcoming(this.clock.nowUtcMillis());
	}
}
