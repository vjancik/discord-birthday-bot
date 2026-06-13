import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema.ts";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(dbFilePath: string): DbClient {
	const dir = path.dirname(dbFilePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const sqlite = new Database(dbFilePath);
	const db = drizzle(sqlite, { schema });

	migrate(db, { migrationsFolder: "./drizzle" });

	return db;
}
