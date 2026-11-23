import { toNodeHandler } from "better-auth/node";
import { auth } from "../src/server/auth.js";
import logout from "../serverless/auth-logout.js";

// Better Auth needs the raw request body, so authentication has its own entry point.
export const config = { api: { bodyParser: false } };
const authHandler = toNodeHandler(auth.handler);

export default async function handler(req: any, res: any) {
  const route = String(req.query?.route ?? "");
  if (!route) return res.status(404).json({ error: "Route d'authentification introuvable." });

  const parsed = new URL(req.url || "/", "http://localhost");
  parsed.searchParams.delete("route");
  req.url = "/api/auth/" + route + parsed.search;

  if (route === "logout") return logout(req, res);
  return authHandler(req, res);
}
