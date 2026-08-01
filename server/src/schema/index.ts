/**
 * Drizzle schema (DESIGN.md §12). Timestamps are epoch milliseconds.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** One save row per user; save history is out of scope for v1. */
export const saves = sqliteTable("saves", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stateJson: text("state_json").notNull(),
  /** Optimistic-concurrency counter; bumped on every successful PUT. */
  saveVersion: integer("save_version").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

/** Referral gifts (CONCEPT §7). The endpoint that writes these lands in M5. */
export const referrals = sqliteTable(
  "referrals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromUser: integer("from_user")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUser: integer("to_user")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("referrals_from_user_idx").on(table.fromUser)],
);
