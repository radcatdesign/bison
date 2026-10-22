import { resetDatabase } from "../../scripts/db-reset";

export default async function setup() {
  await resetDb();
}

export async function resetDb() {
  const owner = process.env.DATABASE_MIGRATE_URL!;
  if (!new URL(owner).pathname.endsWith("_test")) throw new Error("End-to-end tests only run against a database whose name ends in _test.");
  await resetDatabase(owner, process.env.DATABASE_URL!, () => {});
}
