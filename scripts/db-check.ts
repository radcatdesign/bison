// Checks a database is safe to run against: the app role can't bypass RLS and
// every tenant table has the policy. Run it against production after setup:
//   pnpm db:check
import pg from "pg";
import { describeUrl, loadEnv, requireEnv } from "./lib/env";

const SYSTEM_TABLES = new Set(["schema_migrations", "webhook_events"]);

async function main() {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const problems: string[] = [];
  try {
    const role = (
      await client.query(`
        select r.rolname, r.rolsuper, r.rolbypassrls,
          (select count(*)::int from pg_auth_members m where m.member = r.oid) as member_of,
          (select count(*)::int from pg_class c where c.relowner = r.oid) as owns
        from pg_roles r where r.rolname = current_user`)
    ).rows[0];
    if (role.rolname !== "bisonops_app") problems.push(`Connected as ${role.rolname}, not bisonops_app.`);
    if (role.rolsuper) problems.push("The app role is a superuser.");
    if (role.rolbypassrls) problems.push("The app role has BYPASSRLS.");
    if (role.member_of) problems.push("The app role belongs to another role. Recreate it with pnpm db:setup, not in the Neon console.");
    if (role.owns) problems.push("The app role owns tables. Run migrations as the owner role.");

    const tables = await client.query(`
      select c.relname as t, c.relrowsecurity as rls,
        exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'tenant_isolation') as policy
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`);
    for (const r of tables.rows) {
      if (SYSTEM_TABLES.has(r.t)) continue;
      if (!r.rls) problems.push(`${r.t}: RLS is off.`);
      if (!r.policy) problems.push(`${r.t}: no tenant_isolation policy.`);
    }
  } finally {
    await client.end();
  }

  if (problems.length) {
    console.error(`Problems on ${describeUrl(url)}:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${describeUrl(url)} looks right: the app role can't bypass RLS, and every tenant table has its policy.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
