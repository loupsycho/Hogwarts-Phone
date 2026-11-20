import type { VercelRequest, VercelResponse } from "@vercel/node";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../../../src/server/auth.js";

// Explicit callback endpoint: Discord returns here after the user authorizes Hogwarts Phone.
// Keep this route separate so the OAuth callback is not dependent on the wildcard rewrite.
const betterAuthHandler = toNodeHandler(auth.handler);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const requestUrl = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
  requestUrl.pathname = "/api/auth/callback/discord";
  req.url = requestUrl.pathname + requestUrl.search;
  return betterAuthHandler(req, res);
}
