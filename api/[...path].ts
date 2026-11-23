import type { VercelRequest, VercelResponse } from "@vercel/node";
import accountBootstrap from "../serverless/account-bootstrap.js";
import agenda from "../serverless/agenda.js";
import data from "../serverless/data.js";
import groups from "../serverless/groups.js";
import instagram from "../serverless/instagram.js";
import media from "../serverless/media.js";
import profile from "../serverless/profile.js";
import token from "../serverless/token.js";

// Keep each API module separate while using one Vercel function entry point.
export const config = { api: { bodyParser: { sizeLimit: "16mb" } } };

const routes: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  "account/bootstrap": accountBootstrap,
  agenda,
  data,
  groups,
  instagram,
  media,
  profile,
  token,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path ?? "");
  const target = routes[route];
  if (!target) return res.status(404).json({ error: "Route API introuvable." });
  return target(req, res);
}
