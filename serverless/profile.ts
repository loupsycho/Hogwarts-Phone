import type { VercelRequest, VercelResponse } from "@vercel/node";
import { databasePool } from "../src/server/auth.js";
import { getActivitySession } from "../src/server/activity-session.js";

function send(res: VercelResponse, status: number, data: unknown) {
  return res.status(status).json(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const discord = getActivitySession(req.headers.cookie, req.headers.authorization);
    if (!discord) return send(res, 401, { error: "Connexion Discord requise." });
    const [account, admin] = await Promise.all([
      databasePool.query("SELECT id,account_status FROM app_users WHERE discord_user_id=$1", [discord.id]),
      databasePool.query("SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes", [discord.id]),
    ]);
    const user = account.rows[0];
    const isAdmin = Boolean(admin.rows[0]?.yes);
    if (!isAdmin && user?.account_status !== "approved") return send(res, 403, { error: "Compte non autorisé." });

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const characterId = String(req.method === "GET" ? req.query.characterId ?? "" : body.characterId ?? "");
    if (!characterId) return send(res, 400, { error: "Personnage requis." });
    const found = await databasePool.query(
      "SELECT id,owner_user_id,sexual_orientation FROM characters WHERE id=$1",
      [characterId],
    );
    if (!found.rowCount) return send(res, 404, { error: "Personnage introuvable." });
    if (!isAdmin && found.rows[0].owner_user_id !== user?.id) return send(res, 403, { error: "Personnage inaccessible." });

    if (req.method === "GET") return send(res, 200, { sexualOrientation: found.rows[0].sexual_orientation });
    if (req.method !== "POST") return send(res, 405, { error: "Méthode non autorisée." });
    if (found.rows[0].sexual_orientation) return send(res, 409, { error: "Cette réponse a déjà été validée et ne peut plus être modifiée." });

    const choice = String(body.choice ?? "");
    const other = String(body.other ?? "").trim();
    if (!["Hétérosexuel(le)", "Bisexuel(le)", "Homosexuel(le)", "Autre"].includes(choice)) {
      return send(res, 400, { error: "Choisis une réponse valide." });
    }
    if (choice === "Autre" && !other) return send(res, 400, { error: "Précise ton orientation." });
    const value = choice === "Autre" ? "Autre : " + other.slice(0, 100) : choice;
    const updated = await databasePool.query(
      "UPDATE characters SET sexual_orientation=$1,updated_at=now() WHERE id=$2 AND sexual_orientation IS NULL RETURNING sexual_orientation",
      [value, characterId],
    );
    if (!updated.rowCount) return send(res, 409, { error: "Cette réponse a déjà été validée." });
    return send(res, 200, { sexualOrientation: value, locked: true });
  } catch (error) {
    console.error("Hogwarts Phone profile API:", error);
    return send(res, 500, { error: "Impossible d'enregistrer le profil." });
  }
}
