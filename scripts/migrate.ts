// Applies db/migrations/*.sql in order, each in its own transaction, as the schema owner.
// pnpm db:migrate
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { describeUrl, loadEnv, requireEnv } from "./lib/env";

export async function migrate(ownerUrl: string, log = console.log) {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await client.query("select version from schema_migrations")).rows.map((r) => r.version));
    let applied = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      const sqlText = await readFile(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sqlText);
        await client.query("insert into schema_migrations (version) values ($1)", [version]);
        await client.query("commit");
        log(`Applied ${version}`);
        applied++;
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${version} failed: ${(err as Error).message}`);
      }
    }
    if (!applied) log("Database is up to date.");
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  loadEnv();
  const url = requireEnv("DATABASE_MIGRATE_URL");
  console.log(`Migrating ${describeUrl(url)}`);
  migrate(url).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
