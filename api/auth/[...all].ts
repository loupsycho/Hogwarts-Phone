import { toNodeHandler } from "better-auth/node";
import { auth } from "../../src/server/auth.js";
import logout from "../../serverless/auth-logout.js";

// Better Auth requires the raw request stream. Logout is dispatched here too.
export const config = { api: { bodyParser: false } };
const authHandler = toNodeHandler(auth.handler);

export default async function handler(req: any, res: any) {
  const route = Array.isArray(req.query?.all) ? req.query.all.join("/") : String(req.query?.all ?? "");
  if (route === "logout") return logout(req, res);
  return authHandler(req, res);
}
