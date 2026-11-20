import { betterAuth } from "better-auth";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Hogwarts Phone authentication.");
}

export const databasePool = new Pool({
  connectionString: databaseUrl,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const appUrl = process.env.APP_URL ?? "http://localhost:5173";
const vercelOrigin = process.env.VERCEL_URL
  ? "https://" + process.env.VERCEL_URL
  : undefined;

export const auth = betterAuth({
  appName: "Hogwarts Phone",
  baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: databasePool,
  trustedOrigins: [appUrl, vercelOrigin].filter((origin): origin is string => Boolean(origin)),
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      scope: ["identify"],
    },
  },
  emailAndPassword: {
    enabled: false,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
