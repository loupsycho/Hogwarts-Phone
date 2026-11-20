import { toNodeHandler } from "better-auth/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { auth } from "../src/server/auth.js";

const authHandler = toNodeHandler(auth);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel's file-based functions do not support catch-all API filenames.
  // vercel.json forwards /api/auth/* to this function and stores the remaining
  // path in __auth_path so Better Auth still receives its complete endpoint.
  const requestUrl = new URL(req.url ?? "/api/auth", "http://localhost");
  const authPath = requestUrl.searchParams.get("__auth_path");

  if (authPath) {
    requestUrl.searchParams.delete("__auth_path");
    req.url = "/api/auth/" + authPath.replace(/^\/+/, "") + requestUrl.search;
  }

  return authHandler(req, res);
}
