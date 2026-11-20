import type { VercelRequest, VercelResponse } from "@vercel/node";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../src/server/auth.js";

const betterAuthHandler = toNodeHandler(auth.handler);

export default function handler(req: VercelRequest, res: VercelResponse) {
  const requestUrl = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
  const authPath = requestUrl.searchParams.get("__auth_path");

  if (!authPath || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(authPath)) {
    return res.status(404).json({ error: "Authentication route not found" });
  }

  requestUrl.pathname = `/api/auth/${authPath}`;
  requestUrl.searchParams.delete("__auth_path");
  req.url = requestUrl.pathname + requestUrl.search;

  return betterAuthHandler(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
