import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const birthdays = sqliteTable(
	"birthdays",
	{
		userId: text("user_id").primaryKey(),
		day: integer("day").notNull(),
		month: integer("month").notNull(),
		year: integer("year"),
		timezone: text("timezone").notNull(),
		nextTriggerAtUtc: integer("next_trigger_at_utc").notNull(),
		lastPostedAtUtc: integer("last_posted_at_utc"),
		lastBirthDateChangeAtUtc: integer("last_birth_date_change_at_utc"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("idx_birthdays_next_trigger").on(table.nextTriggerAtUtc)],
);
