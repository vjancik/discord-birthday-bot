import type { Logger } from "pino";
import type { RunDueBirthdaysUseCase } from "../../application/use-cases/run-due-birthdays.ts";

export const TICK_INTERVAL_MS = 30_000;

export class IntervalScheduler {
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;

	constructor(
		private readonly runDue: RunDueBirthdaysUseCase,
		private readonly logger: Logger,
	) {}

	start(): void {
		if (this.timer !== null) return;

		// Run one tick immediately (startup catch-up)
		void this.tick();

		this.timer = setInterval(() => {
			void this.tick();
		}, TICK_INTERVAL_MS);
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async tick(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			await this.runDue.execute();
		} catch (err) {
			this.logger.error({ err }, "Scheduler tick failed");
		} finally {
			this.running = false;
		}
	}
}
