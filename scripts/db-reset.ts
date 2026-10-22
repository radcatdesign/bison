// Drops everything in the public schema, then migrates and seeds.
// Refuses to run unless the database name ends in _test or _dev, or ALLOW_DB_RESET=1.
// pnpm db:reset
import pg from "pg";
import { describeUrl, loadEnv, requireEnv } from "./lib/env";
import { migrate } from "./migrate";
import { seed } from "./seed";

export async function resetDatabase(ownerUrl: string, appUrl: string, log = console.log) {
  const name = new URL(ownerUrl).pathname.slice(1);
  if (!/_(test|dev|e2e)$/.test(name) && name !== "bisonops" && process.env.ALLOW_DB_RESET !== "1") {
    throw new Error(`Refusing to reset "${name}". Use a database ending in _test or _dev, or set ALLOW_DB_RESET=1.`);
  }
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusing to reset a production database.");

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }
  await migrate(ownerUrl, log);
  await seed(appUrl, log, ownerUrl);
}

if (process.argv[1]?.endsWith("db-reset.ts")) {
  loadEnv();
  const ownerUrl = requireEnv("DATABASE_MIGRATE_URL");
  console.log(`Resetting ${describeUrl(ownerUrl)}`);
  resetDatabase(ownerUrl, requireEnv("DATABASE_URL")).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
