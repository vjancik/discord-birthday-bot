import type { RandomSource } from "../application/ports/random-source.ts";

export class MathRandomSource implements RandomSource {
	next(): number {
		return Math.random();
	}
}
