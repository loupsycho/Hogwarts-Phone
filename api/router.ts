import type { VercelRequest, VercelResponse } from "@vercel/node";
import accountBootstrap from "../serverless/account-bootstrap.js";
import agenda from "../serverless/agenda.js";
import data from "../serverless/data.js";
import groups from "../serverless/groups.js";
import instagram from "../serverless/instagram.js";
import links from "../serverless/links.js";
import gazette from "../serverless/gazette.js";
import media from "../serverless/media.js";
import profile from "../serverless/profile.js";
import token from "../serverless/token.js";

// The original application handlers stay separate; Vercel routes them here.
export const config = { api: { bodyParser: { sizeLimit: "16mb" } } };

const routes: Record<string, (req: VercelRequest, res: VercelResponse) => unknown> = {
  "account/bootstrap": accountBootstrap,
  agenda,
  data,
  groups,
  gazette,
  instagram,
  links,
  media,
  profile,
  token,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = String(req.query.route ?? "");
  const target = routes[route];
  if (!target) return res.status(404).json({ error: "Route API introuvable." });
  return target(req, res);
}
