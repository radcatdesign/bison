// Wipes the test database, migrates and seeds it before the database tests run.
import { resetDatabase } from "../../scripts/db-reset";

export default async function setup() {
  const owner = process.env.DATABASE_MIGRATE_URL;
  const app = process.env.DATABASE_URL;
  if (!owner || !app) throw new Error("Set DATABASE_URL and DATABASE_MIGRATE_URL in .env.test.");
  if (!new URL(owner).pathname.endsWith("_test")) throw new Error("Database tests only run against a database whose name ends in _test.");
  await resetDatabase(owner, app, () => {});
}
