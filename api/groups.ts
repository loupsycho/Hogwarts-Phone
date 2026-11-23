import type { VercelRequest, VercelResponse } from "@vercel/node";
import { databasePool } from "../src/server/auth.js";
import { getActivitySession } from "../src/server/activity-session.js";

async function getContext(req: VercelRequest) {
  const discord = getActivitySession(req.headers.cookie, req.headers.authorization);
  if (!discord) return null;
  const [admin, player] = await Promise.all([
    databasePool.query("SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes", [discord.id]),
    databasePool.query("SELECT id, account_status FROM app_users WHERE discord_user_id=$1", [discord.id]),
  ]);
  return { isAdmin: Boolean(admin.rows[0]?.yes), player: player.rows[0] ?? null };
}
function send(res: VercelResponse, status: number, data: unknown) { return res.status(status).json(data); }
const bad = (res: VercelResponse, message: string) => send(res, 400, { error: message });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ctx = await getContext(req);
    if (!ctx) return send(res, 401, { error: "Connexion Discord requise." });
    if (!ctx.isAdmin && ctx.player?.account_status !== "approved") return send(res, 403, { error: "Compte non autorisé." });
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
    const action = String(req.query.action ?? body.action ?? "");
    const characterId = String(req.query.characterId ?? body.characterId ?? "");
    if (!characterId) return bad(res, "Personnage requis.");
    const own = await databasePool.query(
      "SELECT id,owner_user_id,first_name,last_name,character_type,house,avatar_url FROM characters WHERE id=$1",
      [characterId],
    );
    if (!own.rowCount || (!ctx.isAdmin && own.rows[0].owner_user_id !== ctx.player?.id)) {
      return send(res, 403, { error: "Personnage inaccessible." });
    }
    const actor = own.rows[0];
    const membership = async (groupId: string) => databasePool.query(
      "SELECT c.id,c.group_kind,c.house,c.created_by_character_id,cm.joined_at FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.id=$1 AND c.conversation_type='group' AND cm.character_id=$2",
      [groupId, characterId],
    );

    if (req.method === "GET") {
      if (action === "list") {
        const result = await databasePool.query(
          "SELECT c.id,c.title,c.group_kind,c.house,c.updated_at,CASE WHEN c.avatar_media_id IS NOT NULL THEN '/api/media?id='||c.avatar_media_id::text ELSE NULL END AS avatar_url,(SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)::int AS member_count,(SELECT string_agg(ch.first_name || ' ' || ch.last_name, ', ' ORDER BY ch.first_name,ch.last_name) FROM conversation_members cm JOIN characters ch ON ch.id=cm.character_id WHERE cm.conversation_id=c.id AND ch.id<>$1) AS participants,(SELECT json_agg(json_build_object('id',ch.id,'first_name',ch.first_name,'last_name',ch.last_name,'avatar_url',ch.avatar_url) ORDER BY cm.joined_at,ch.first_name) FROM conversation_members cm JOIN characters ch ON ch.id=cm.character_id WHERE cm.conversation_id=c.id) AS members,(SELECT COALESCE(NULLIF(m.body,''),CASE WHEN m.media_id IS NOT NULL THEN 'Photo' ELSE NULL END) FROM messages m WHERE m.conversation_id=c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message,(SELECT m.sent_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message_at,(SELECT count(*) FROM notifications n WHERE n.character_id=$1 AND n.target_type='group_conversation' AND n.target_id=c.id AND n.read_at IS NULL)::int AS unread_count,(c.created_by_character_id=$1) AS is_admin FROM conversations c JOIN conversation_members mine ON mine.conversation_id=c.id WHERE mine.character_id=$1 AND c.conversation_type='group' ORDER BY CASE WHEN c.group_kind='house' THEN 0 ELSE 1 END,c.updated_at DESC",
          [characterId],
        );
        return send(res, 200, { groups: result.rows });
      }
      if (action === "messages") {
        const groupId = String(req.query.groupId ?? "");
        if (!groupId) return bad(res, "Groupe requis.");
        const allowed = await membership(groupId);
        if (!allowed.rowCount) return send(res, 403, { error: "Groupe inaccessible." });
        const result = await databasePool.query(
          "SELECT m.id,m.body,m.sent_at,m.sender_character_id,c.first_name,c.last_name,c.avatar_url,ma.mime_type,CASE WHEN m.media_id IS NOT NULL THEN '/api/media?id='||m.media_id::text ELSE NULL END AS media_url FROM messages m JOIN characters c ON c.id=m.sender_character_id LEFT JOIN media_assets ma ON ma.id=m.media_id WHERE m.conversation_id=$1 ORDER BY m.sent_at ASC LIMIT 500",
          [groupId],
        );
        return send(res, 200, { messages: result.rows });
      }
      return bad(res, "Action Groupes inconnue.");
    }

    if (req.method === "POST") {
      if (action === "create") {
        const title = String(body.title ?? "").trim();
        const selected = Array.isArray(body.participantIds) ? body.participantIds.map(String) : [];
        const ids = [...new Set([characterId, ...selected])];
        if (!title) return bad(res, "Donne un nom à ton groupe.");
        if (ids.length < 3) return bad(res, "Un groupe doit réunir au minimum trois personnages, toi compris.");
        const approved = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=ANY($1::uuid[]) AND u.account_status='approved'", [ids]);
        if (approved.rowCount !== ids.length) return bad(res, "Un des personnages sélectionnés n'est pas disponible.");
        let avatarMediaId: string | null = null;
        if (body.avatarMediaId) {
          const media = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='gallery'", [body.avatarMediaId, characterId]);
          if (!media.rowCount) return bad(res, "Photo de groupe inaccessible.");
          avatarMediaId = String(body.avatarMediaId);
        }
        const created = await databasePool.query("INSERT INTO conversations(conversation_type,title,created_by_character_id,avatar_media_id,group_kind) VALUES('group',$1,$2,$3,'custom') RETURNING id", [title, characterId, avatarMediaId]);
        const groupId = created.rows[0].id;
        await databasePool.query("INSERT INTO conversation_members(conversation_id,character_id) SELECT $1,unnest($2::uuid[])", [groupId, ids]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT unnest($1::uuid[]),'group_invite','Nouveau groupe',$2,'group_conversation',$3", [ids.filter(id => id !== characterId), "Vous avez été ajouté au groupe « " + title + " ».", groupId]);
        return send(res, 201, { id: groupId });
      }

      if (action === "message") {
        const groupId = String(body.groupId ?? "");
        const text = String(body.body ?? "").trim();
        if (!groupId || (!text && !body.mediaId)) return bad(res, "Ajoute un message ou une photo.");
        const allowed = await membership(groupId);
        if (!allowed.rowCount) return send(res, 403, { error: "Groupe inaccessible." });
        if (body.mediaId) {
          const media = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='message'", [body.mediaId, characterId]);
          if (!media.rowCount) return bad(res, "Photo inaccessible.");
        }
        const inserted = await databasePool.query("INSERT INTO messages(conversation_id,sender_character_id,body,media_id) VALUES($1,$2,$3,$4) RETURNING id", [groupId, characterId, text, body.mediaId || null]);
        await databasePool.query("UPDATE conversations SET updated_at=now() WHERE id=$1", [groupId]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT cm.character_id,'group_message','Nouveau message de groupe',$2,'group_conversation',$1 FROM conversation_members cm WHERE cm.conversation_id=$1 AND cm.character_id<>$3", [groupId, text ? actor.first_name + " a envoyé un message dans le groupe." : actor.first_name + " a partagé une photo dans le groupe.", characterId]);
        return send(res, 201, { id: inserted.rows[0].id });
      }

      if (action === "read") {
        const groupId = String(body.groupId ?? "");
        const allowed = await membership(groupId);
        if (!allowed.rowCount) return send(res, 403, { error: "Groupe inaccessible." });
        await databasePool.query("UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE character_id=$1 AND target_type='group_conversation' AND target_id=$2", [characterId, groupId]);
        return send(res, 200, { ok: true });
      }

      if (action === "add-members") {
        const groupId = String(body.groupId ?? "");
        const group = await membership(groupId);
        if (!group.rowCount) return send(res, 403, { error: "Groupe inaccessible." });
        if (group.rows[0].group_kind !== "custom" || group.rows[0].created_by_character_id !== characterId) return send(res, 403, { error: "Seul l'administrateur peut ajouter des membres à ce groupe." });
        const ids = [...new Set((Array.isArray(body.participantIds) ? body.participantIds : []).map(String))].filter(id => id !== characterId);
        if (!ids.length) return bad(res, "Choisis au moins un personnage.");
        const approved = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=ANY($1::uuid[]) AND u.account_status='approved' AND NOT EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=$2 AND cm.character_id=c.id)", [ids, groupId]);
        if (approved.rowCount !== ids.length) return bad(res, "Un personnage est invalide ou déjà membre du groupe.");
        await databasePool.query("INSERT INTO conversation_members(conversation_id,character_id) SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING", [groupId, ids]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT unnest($1::uuid[]),'group_invite','Nouveau groupe','Vous avez été ajouté à un groupe.','group_conversation',$2", [ids, groupId]);
        return send(res, 200, { ok: true });
      }

      if (action === "remove-member") {
        const groupId = String(body.groupId ?? "");
        const targetId = String(body.targetCharacterId ?? "");
        const group = await membership(groupId);
        if (!group.rowCount) return send(res, 403, { error: "Groupe inaccessible." });
        if (group.rows[0].group_kind !== "custom" || group.rows[0].created_by_character_id !== characterId) return send(res, 403, { error: "Seul l'administrateur peut retirer des membres." });
        if (!targetId || targetId === characterId) return bad(res, "Choisis un autre membre à retirer.");
        const removed = await databasePool.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND character_id=$2 RETURNING character_id", [groupId, targetId]);
        if (!removed.rowCount) return send(res, 404, { error: "Membre introuvable." });
        await databasePool.query("DELETE FROM notifications WHERE character_id=$1 AND target_type='group_conversation' AND target_id=$2", [targetId, groupId]);
        return send(res, 200, { ok: true });
      }

      if (action === "leave") {
        const groupId = String(body.groupId ?? "");
        const group = await membership(groupId);
        if (!group.rowCount) return send(res, 403, { error: "Groupe inaccessible." });
        if (group.rows[0].group_kind === "house") return send(res, 403, { error: "Tu ne peux pas quitter le groupe permanent de ta maison." });
        const client = await databasePool.connect();
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND character_id=$2", [groupId, characterId]);
          const remaining = await client.query("SELECT character_id FROM conversation_members WHERE conversation_id=$1 ORDER BY joined_at ASC LIMIT 1", [groupId]);
          if (!remaining.rowCount) {
            await client.query("DELETE FROM conversations WHERE id=$1", [groupId]);
          } else if (group.rows[0].created_by_character_id === characterId) {
            await client.query("UPDATE conversations SET created_by_character_id=$2,updated_at=now() WHERE id=$1", [groupId, remaining.rows[0].character_id]);
          }
          await client.query("DELETE FROM notifications WHERE character_id=$1 AND target_type='group_conversation' AND target_id=$2", [characterId, groupId]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
        return send(res, 200, { ok: true });
      }
      return bad(res, "Action Groupes inconnue.");
    }
    return send(res, 405, { error: "Méthode non autorisée." });
  } catch (error) {
    console.error("Hogwarts Phone Groups API:", error);
    return send(res, 500, { error: "Une erreur est survenue. Réessaie." });
  }
}
