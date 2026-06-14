import { describe, expect, test } from "bun:test";
import pino from "pino";
import type { AuditEvent } from "../../application/ports/audit-log-publisher.ts";
import type { UserNameResolver } from "../../application/ports/user-name-resolver.ts";
import { RestAuditLogPublisher } from "./rest-audit-log-publisher.ts";

const LOGGER = pino({ level: "silent" });

// Minimal REST stub: captures the last posted message body
class SpyRest {
	lastBody: Record<string, unknown> | null = null;
	async post(_route: string, options: { body: Record<string, unknown> }) {
		this.lastBody = options.body;
	}
}

function makePublisher(
	spy: SpyRest,
	resolver?: UserNameResolver,
): RestAuditLogPublisher {
	// Cast: the publisher only calls rest.post(), so a minimal stub suffices
	return new RestAuditLogPublisher(
		spy as unknown as import("discord.js").REST,
		"channel-id",
		LOGGER,
		resolver,
	);
}

const BASE_EVENT: AuditEvent = {
	action: "add",
	source: "discord",
	userId: "123",
};

describe("RestAuditLogPublisher", () => {
	test("uses passed userName and includes snowflake", async () => {
		const spy = new SpyRest();
		const pub = makePublisher(spy);
		await pub.publish({ ...BASE_EVENT, userName: "Vix (@coolvix)" });

		expect(spy.lastBody?.content).toBe("[ADD] (discord) Vix (@coolvix) [123]");
	});

	test("falls back to resolver when userName absent", async () => {
		const spy = new SpyRest();
		const resolver: UserNameResolver = {
			resolve: async () => "Vix (@coolvix)",
		};
		const pub = makePublisher(spy, resolver);
		await pub.publish(BASE_EVENT);

		expect(spy.lastBody?.content).toBe("[ADD] (discord) Vix (@coolvix) [123]");
	});

	test("uses bare userId when resolver returns null", async () => {
		const spy = new SpyRest();
		const resolver: UserNameResolver = { resolve: async () => null };
		const pub = makePublisher(spy, resolver);
		await pub.publish(BASE_EVENT);

		expect(spy.lastBody?.content).toBe("[ADD] (discord) user 123");
	});

	test("uses bare userId when resolver throws", async () => {
		const spy = new SpyRest();
		const resolver: UserNameResolver = {
			resolve: async () => {
				throw new Error("network");
			},
		};
		const pub = makePublisher(spy, resolver);
		await pub.publish(BASE_EVENT);

		expect(spy.lastBody?.content).toBe("[ADD] (discord) user 123");
	});

	test("passed userName takes precedence over resolver", async () => {
		const spy = new SpyRest();
		const resolver: UserNameResolver = {
			resolve: async () => "ShouldNotAppear",
		};
		const pub = makePublisher(spy, resolver);
		await pub.publish({ ...BASE_EVENT, userName: "Vix (@coolvix)" });

		expect(spy.lastBody?.content).toBe("[ADD] (discord) Vix (@coolvix) [123]");
	});

	test("includes birthDate and timezone in message", async () => {
		const spy = new SpyRest();
		const pub = makePublisher(spy);
		await pub.publish({
			...BASE_EVENT,
			userName: "Vix (@coolvix)",
			birthDate: "24.12.1990",
			timezone: "Europe/Prague",
		});

		expect(spy.lastBody?.content).toBe(
			"[ADD] (discord) Vix (@coolvix) [123], birthday: 24.12.1990, timezone: Europe/Prague",
		);
	});
});
