import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Hogwarts Phone.");
}

export const databasePool = new Pool({
  connectionString: databaseUrl,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
