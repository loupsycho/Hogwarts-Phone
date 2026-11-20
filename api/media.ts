import type { VercelRequest, VercelResponse } from "@vercel/node";
import { databasePool } from "../src/server/auth.js";
import { getActivitySession } from "../src/server/activity-session.js";

export const config = { api: { bodyParser: { sizeLimit: "16mb" } } };

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const maxBytes = 10 * 1024 * 1024;

function reply(res: VercelResponse, status: number, value: unknown) {
  return res.status(status).json(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const discord = getActivitySession(req.headers.cookie, req.headers.authorization);
    if (!discord) return reply(res, 401, { error: "Connexion Discord requise." });

    const account = await databasePool.query(
      "SELECT id, account_status FROM app_users WHERE discord_user_id=$1",
      [discord.id],
    );
    const user = account.rows[0];
    const admin = await databasePool.query(
      "SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes",
      [discord.id],
    );
    if (!Boolean(admin.rows[0]?.yes) && user?.account_status !== "approved") {
      return reply(res, 403, { error: "Compte non autorisé." });
    }

    if (req.method === "GET") {
      if (req.query.list === "1") {
        const characterId = String(req.query.characterId ?? "");
        const owned = await databasePool.query("SELECT id FROM characters WHERE id=$1 AND owner_user_id=$2", [characterId, user?.id]);
        if (!owned.rowCount && !Boolean(admin.rows[0]?.yes)) return reply(res, 403, { error: "Personnage inaccessible." });
        const items = await databasePool.query("SELECT id,media_kind,mime_type,file_name,byte_size,created_at FROM media_assets WHERE character_id=$1 ORDER BY created_at DESC LIMIT 200", [characterId]);
        return reply(res, 200, { media: items.rows.map((item: any) => ({ ...item, url: "/api/media?id=" + encodeURIComponent(item.id) })) });
      }
      const id = String(req.query.id ?? "");
      if (!id) return reply(res, 400, { error: "Média introuvable." });
      const media = await databasePool.query(
        "SELECT mime_type, file_name, content FROM media_assets WHERE id=$1",
        [id],
      );
      if (!media.rowCount) return reply(res, 404, { error: "Média introuvable." });
      res.setHeader("Content-Type", media.rows[0].mime_type);
      res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(media.rows[0].file_name));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.status(200).send(media.rows[0].content);
    }

    if (req.method !== "POST") return reply(res, 405, { error: "Méthode non autorisée." });
    if (!user?.id) return reply(res, 403, { error: "Compte joueur introuvable." });

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const characterId = String(body.characterId ?? "");
    const kind = String(body.kind ?? "");
    const mimeType = String(body.mimeType ?? "");
    const fileName = String(body.fileName ?? "media");
    const base64 = String(body.data ?? "");
    if (!characterId || !["avatar", "instagram", "message", "gallery"].includes(kind)) {
      return reply(res, 400, { error: "Informations du média incomplètes." });
    }
    if (!allowedTypes.has(mimeType)) return reply(res, 400, { error: "Format non pris en charge. Utilise une image ou une vidéo MP4/WebM." });
    const owned = await databasePool.query(
      "SELECT id FROM characters WHERE id=$1 AND owner_user_id=$2",
      [characterId, user.id],
    );
    if (!owned.rowCount && !Boolean(admin.rows[0]?.yes)) return reply(res, 403, { error: "Personnage inaccessible." });
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || !base64) return reply(res, 400, { error: "Fichier invalide." });
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > maxBytes) return reply(res, 413, { error: "Le fichier doit faire 10 Mo maximum." });

    const inserted = await databasePool.query(
      "INSERT INTO media_assets(owner_user_id,character_id,media_kind,mime_type,file_name,byte_size,content) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [user.id, characterId, kind, mimeType, fileName.slice(0, 180), bytes.length, bytes],
    );
    const id = inserted.rows[0].id;
    const url = "/api/media?id=" + encodeURIComponent(id);

    if (kind === "avatar") {
      await databasePool.query(
        "UPDATE characters SET profile_media_id=$1, avatar_url=$2, updated_at=now() WHERE id=$3",
        [id, url, characterId],
      );
    }
    return reply(res, 201, { id, url, mimeType, fileName, byteSize: bytes.length });
  } catch (error) {
    console.error("Hogwarts Phone media API:", error);
    return reply(res, 500, { error: "Impossible d'enregistrer ce média." });
  }
}
