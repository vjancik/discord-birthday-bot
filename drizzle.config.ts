import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/infrastructure/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url: process.env.DB_FILE_PATH ?? "./data/birthdays.sqlite",
	},
});
