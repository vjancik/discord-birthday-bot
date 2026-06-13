import pino from "pino";
import pretty from "pino-pretty";

export function createLogger(nodeEnv: string): pino.Logger {
	if (nodeEnv !== "production") {
		const stream = pretty({ colorize: true, translateTime: "SYS:standard" });
		return pino({ level: "debug" }, stream);
	}
	return pino({ level: "info" });
}
