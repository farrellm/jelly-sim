/**
 * Server bootstrap: run migrations, serve the API, and in production also serve the built PWA
 * from the same origin (DESIGN.md §16).
 */

import fs from "node:fs";
import path from "node:path";

import express from "express";

import { createApp } from "./app.js";
import { createDatabase, runMigrations } from "./db.js";
import { env } from "./env.js";

const { db } = createDatabase();
runMigrations(db);

const app = createApp(db);

if (env.isProduction) {
  if (!fs.existsSync(env.clientDistDir)) {
    console.warn(`[jelly-sim] client build not found at ${env.clientDistDir}; run npm run build`);
  }
  app.use(express.static(env.clientDistDir));
  // SPA fallback for everything that isn't /api (already handled above).
  app.use((_req, res) => {
    res.sendFile(path.join(env.clientDistDir, "index.html"));
  });
}

app.listen(env.PORT, () => {
  console.log(`[jelly-sim] API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
