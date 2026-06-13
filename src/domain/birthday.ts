import type { BirthDate } from "./birth-date.ts";
import type { Timezone } from "./timezone.ts";

export interface Birthday {
	userId: string;
	birthDate: BirthDate;
	timezone: Timezone;
}
