import type { Clock } from "../application/ports/clock.ts";

export class SystemClock implements Clock {
	nowUtcMillis(): number {
		return Date.now();
	}
}
