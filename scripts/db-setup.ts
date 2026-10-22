// Creates or updates the runtime role the app connects as.
// Run once per database, as the schema owner: pnpm db:setup
//
// The role name and password come from DATABASE_URL. The role is created with
// no superuser, no BYPASSRLS and no role membership, so RLS always applies.
// On Neon, create this role with SQL (this script), not in the Neon console:
// console-created roles join neon_superuser.
import pg from "pg";
import { describeUrl, loadEnv, requireEnv } from "./lib/env";

loadEnv();

async function main() {
  const ownerUrl = requireEnv("DATABASE_MIGRATE_URL");
  const appUrl = new URL(requireEnv("DATABASE_URL"));
  const role = decodeURIComponent(appUrl.username);
  const password = decodeURIComponent(appUrl.password);
  const database = appUrl.pathname.slice(1);

  if (role !== "bisonops_app") {
    console.error(`DATABASE_URL must connect as bisonops_app (it uses "${role}"). Migrations grant to that name.`);
    process.exit(1);
  }
  // Neon rejects weak passwords on roles made with SQL. Long and random is safest.
  if (password.length < 16) {
    console.error("Give bisonops_app a password of 16 characters or more in DATABASE_URL.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const exists = await client.query("select 1 from pg_roles where rolname = $1", [role]);
    const verb = exists.rowCount ? "alter" : "create";
    // Identifiers and literals are escaped by Postgres' own quoting functions.
    const { rows } = await client.query("select quote_ident($1) as r, quote_literal($2) as p, quote_ident($3) as d", [
      role,
      password,
      database,
    ]);
    const { r, p, d } = rows[0];
    if (verb === "create") {
      await client.query(`create role ${r} login password ${p} nosuperuser nobypassrls nocreatedb nocreaterole noreplication`);
    } else {
      // Only the password changes. Safety attributes are checked by pnpm db:check and the RLS tests.
      await client.query(`alter role ${r} login password ${p}`);
    }
    await client.query(`grant connect on database ${d} to ${r}`);
    console.log(`${verb === "create" ? "Created" : "Updated"} ${role} on ${describeUrl(ownerUrl)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
