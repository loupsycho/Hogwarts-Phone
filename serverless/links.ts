import type { VercelRequest, VercelResponse } from "@vercel/node";
import { databasePool } from "../src/server/auth.js";
import { getActivitySession } from "../src/server/activity-session.js";

const send = (res: VercelResponse, status: number, data: unknown) => res.status(status).json(data);
const bad = (res: VercelResponse, message: string) => send(res, 400, { error: message });
const categories = new Set(["romance", "friendship", "rivalry", "family", "past", "other"]);

async function getContext(req: VercelRequest) {
  const discord = getActivitySession(req.headers.cookie, req.headers.authorization);
  if (!discord) return null;
  const [admin, player] = await Promise.all([
    databasePool.query("SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes", [discord.id]),
    databasePool.query("SELECT id,account_status FROM app_users WHERE discord_user_id=$1", [discord.id]),
  ]);
  return { discord, isAdmin: Boolean(admin.rows[0]?.yes), player: player.rows[0] ?? null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ctx = await getContext(req);
    if (!ctx) return send(res, 401, { error: "Connexion Discord requise." });
    if (!ctx.isAdmin && ctx.player?.account_status !== "approved") return send(res, 403, { error: "Compte non autorisé." });
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
    const characterId = String(body.characterId ?? req.query.characterId ?? "");
    const action = String(req.query.action ?? body.action ?? "");
    if (!characterId) return bad(res, "Personnage requis.");
    const actorResult = await databasePool.query(
      "SELECT id,owner_user_id,first_name,last_name,character_type,house,avatar_url,sexual_orientation,role_title,biography FROM characters WHERE id=$1",
      [characterId],
    );
    if (!actorResult.rowCount || (!ctx.isAdmin && actorResult.rows[0].owner_user_id !== ctx.player?.id)) return send(res, 403, { error: "Personnage inaccessible." });
    const actor = actorResult.rows[0];
    const availableCharacter = async (id: string) => databasePool.query(
      "SELECT c.id,c.first_name,c.last_name,c.character_type,c.house,c.avatar_url,c.sexual_orientation,c.role_title,c.biography FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'",
      [id],
    );
    const isFamily = (category: string, type: string) => category === "family" && /(frère|soeur|sœur|père|mère|oncle|tante|cousin|cousine|familial|famille|grand[- ]?(père|mère)|neveu|nièce|beau-frère|belle-soeur)/i.test(type.trim());

    if (req.method === "GET" && action === "dashboard") {
      const [profile, profiles, requests, relationships, discussions] = await Promise.all([
        databasePool.query("SELECT character_id,description,desired_links,published_at,last_bumped_at,last_bumped_at + interval '1 month' AS next_bump_at,updated_at FROM link_profiles WHERE character_id=$1", [characterId]),
        databasePool.query(
          "SELECT p.character_id,p.description,p.desired_links,p.published_at,p.last_bumped_at,c.first_name,c.last_name,c.character_type,c.house,c.avatar_url,c.sexual_orientation,c.role_title FROM link_profiles p JOIN characters c ON c.id=p.character_id JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved' ORDER BY p.last_bumped_at DESC,p.published_at DESC",
        ),
        databasePool.query(
          "SELECT lr.*,f.first_name AS from_first_name,f.last_name AS from_last_name,f.avatar_url AS from_avatar_url,f.character_type AS from_character_type,t.first_name AS to_first_name,t.last_name AS to_last_name,t.avatar_url AS to_avatar_url,t.character_type AS to_character_type FROM link_requests lr JOIN characters f ON f.id=lr.from_character_id JOIN characters t ON t.id=lr.to_character_id WHERE lr.from_character_id=$1 OR lr.to_character_id=$1 ORDER BY lr.created_at DESC",
          [characterId],
        ),
        databasePool.query(
          "SELECT lr.id,lr.relationship_type,lr.relationship_category,lr.ended_at,lr.created_at,CASE WHEN lr.from_character_id=$1 THEN t.id ELSE f.id END AS other_character_id,CASE WHEN lr.from_character_id=$1 THEN t.first_name ELSE f.first_name END AS other_first_name,CASE WHEN lr.from_character_id=$1 THEN t.last_name ELSE f.last_name END AS other_last_name,CASE WHEN lr.from_character_id=$1 THEN t.avatar_url ELSE f.avatar_url END AS other_avatar_url FROM link_requests lr JOIN characters f ON f.id=lr.from_character_id JOIN characters t ON t.id=lr.to_character_id WHERE (lr.from_character_id=$1 OR lr.to_character_id=$1) AND lr.request_status IN ('accepted','ended') ORDER BY lr.ended_at NULLS FIRST,lr.created_at DESC",
          [characterId],
        ),
        databasePool.query(
          "SELECT d.id AS discussion_id,d.conversation_id,d.request_id,d.created_at,CASE WHEN d.character_a_id=$1 THEN b.id ELSE a.id END AS other_character_id,CASE WHEN d.character_a_id=$1 THEN b.first_name ELSE a.first_name END AS other_first_name,CASE WHEN d.character_a_id=$1 THEN b.last_name ELSE a.last_name END AS other_last_name,CASE WHEN d.character_a_id=$1 THEN b.avatar_url ELSE a.avatar_url END AS other_avatar_url,lr.relationship_type,(SELECT m.body FROM messages m WHERE m.conversation_id=d.conversation_id ORDER BY m.sent_at DESC LIMIT 1) AS last_message,(SELECT m.sent_at FROM messages m WHERE m.conversation_id=d.conversation_id ORDER BY m.sent_at DESC LIMIT 1) AS last_message_at,(SELECT count(*)::int FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.character_id=$1 WHERE m.conversation_id=d.conversation_id AND m.sender_character_id<>$1 AND m.sent_at>COALESCE(cm.last_read_at,'epoch'::timestamptz)) AS unread_count FROM link_discussions d JOIN characters a ON a.id=d.character_a_id JOIN characters b ON b.id=d.character_b_id LEFT JOIN link_requests lr ON lr.id=d.request_id WHERE (d.character_a_id=$1 OR d.character_b_id=$1) AND NOT EXISTS(SELECT 1 FROM link_discussion_hidden h WHERE h.discussion_id=d.id AND h.character_id=$1) ORDER BY COALESCE((SELECT max(m.sent_at) FROM messages m WHERE m.conversation_id=d.conversation_id),d.created_at) DESC",
          [characterId],
        ),
      ]);
      const notifs = await databasePool.query("UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE character_id=$1 AND target_type IN ('link_request','link_discussion') AND read_at IS NULL", [characterId]);
      return send(res, 200, { profile: profile.rows[0] ?? null, profiles: profiles.rows.filter((p: any) => p.character_id !== characterId), requests: requests.rows, relationships: relationships.rows, discussions: discussions.rows, notificationsRead: notifs.rowCount });
    }

    if (req.method === "POST" && action === "profile-save") {
      const description = String(body.description ?? "").trim().slice(0, 4000) || null;
      const desired = Array.isArray(body.desiredLinks) ? body.desiredLinks.map((item: any) => ({
        type: String(item?.type ?? "").trim().slice(0, 120),
        category: categories.has(String(item?.category ?? "")) ? String(item.category) : "other",
        detail: String(item?.detail ?? "").trim().slice(0, 1000),
      })).filter((item: any) => item.type) : [];
      if (!desired.length) return bad(res, "Choisis au moins un type de lien recherché.");
      const saved = await databasePool.query(
        "INSERT INTO link_profiles(character_id,description,desired_links) VALUES($1,$2,$3::jsonb) ON CONFLICT(character_id) DO UPDATE SET description=EXCLUDED.description,desired_links=EXCLUDED.desired_links,updated_at=now() RETURNING character_id,published_at,last_bumped_at,last_bumped_at + interval '1 month' AS next_bump_at",
        [characterId, description, JSON.stringify(desired)],
      );
      return send(res, 200, { ok: true, profile: saved.rows[0] });
    }

    if (req.method === "POST" && action === "profile-delete") {
      await databasePool.query("DELETE FROM link_profiles WHERE character_id=$1", [characterId]);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && action === "bump") {
      const bumped = await databasePool.query(
        "UPDATE link_profiles SET last_bumped_at=now(),updated_at=now() WHERE character_id=$1 AND last_bumped_at <= now() - interval '1 month' RETURNING last_bumped_at,last_bumped_at + interval '1 month' AS next_bump_at",
        [characterId],
      );
      if (!bumped.rowCount) {
        const next = await databasePool.query("SELECT last_bumped_at + interval '1 month' AS next_bump_at FROM link_profiles WHERE character_id=$1", [characterId]);
        if (!next.rowCount) return send(res, 404, { error: "Publie d'abord ta fiche de recherche." });
        return send(res, 409, { error: "La remontée est déjà utilisée. Prochaine disponibilité : " + new Date(next.rows[0].next_bump_at).toLocaleDateString("fr-FR") + "." });
      }
      return send(res, 200, { ok: true, ...bumped.rows[0] });
    }

    if (req.method === "POST" && action === "propose") {
      const targetId = String(body.toCharacterId ?? "");
      const rawRelationshipType = String(body.relationshipType ?? "").trim().slice(0, 120);
      const category = categories.has(String(body.relationshipCategory ?? "")) ? String(body.relationshipCategory) : "other";
      if (!targetId || targetId === characterId || !rawRelationshipType) return bad(res, "Proposition invalide.");
      const relationshipType = category === "other" && !/^autre\s*:/i.test(rawRelationshipType) ? "Autre : " + rawRelationshipType : rawRelationshipType;
      const target = await availableCharacter(targetId);
      if (!target.rowCount) return send(res, 404, { error: "Ce personnage n'est pas disponible." });
      const published = await databasePool.query("SELECT 1 FROM link_profiles WHERE character_id=$1", [targetId]);
      if (!published.rowCount) return send(res, 409, { error: "Ce personnage n'a pas publié sa demande de liens." });
      if (actor.character_type !== target.rows[0].character_type && !isFamily(category, relationshipType)) return send(res, 403, { error: "Entre un élève et un membre du personnel, seuls les liens familiaux sont autorisés." });
      const client = await databasePool.connect();
      try {
        await client.query("BEGIN");
        const request = await client.query("INSERT INTO link_requests(from_character_id,to_character_id,relationship_type,relationship_category,message) VALUES($1,$2,$3,$4,$5) RETURNING id", [characterId,targetId,relationshipType,category,String(body.message ?? "").trim() || null]);
        const conversation = await client.query("INSERT INTO conversations(conversation_type,created_by_character_id) VALUES('direct',$1) RETURNING id", [characterId]);
        await client.query("INSERT INTO conversation_members(conversation_id,character_id) VALUES($1,$2),($1,$3)", [conversation.rows[0].id,characterId,targetId]);
        await client.query("INSERT INTO link_discussions(conversation_id,request_id,character_a_id,character_b_id,created_by_character_id) VALUES($1,$2,$3,$4,$3)", [conversation.rows[0].id,request.rows[0].id,characterId,targetId]);
        await client.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_request','Nouvelle proposition de lien',$2,'link_request',$3)", [targetId, actor.first_name + " " + actor.last_name + " te propose : " + relationshipType, request.rows[0].id]);
        if (String(body.message ?? "").trim()) {
          await client.query("INSERT INTO messages(conversation_id,sender_character_id,body) VALUES($1,$2,$3)", [conversation.rows[0].id,characterId,String(body.message).trim()]);
          await client.query("UPDATE conversations SET updated_at=now() WHERE id=$1", [conversation.rows[0].id]);
          await client.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_discussion_message','Nouveau message concernant un lien','Tu as reçu un message avec une proposition de lien.','link_discussion',$2)", [targetId,request.rows[0].id]);
        }
        await client.query("COMMIT");
        return send(res, 201, { id: request.rows[0].id, conversationId: conversation.rows[0].id });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }

    if (req.method === "POST" && action === "respond") {
      const requestId = String(body.requestId ?? ""), status = String(body.status ?? "");
      if (!requestId || !["accepted","declined"].includes(status)) return bad(res, "Réponse invalide.");
      const changed = await databasePool.query("UPDATE link_requests SET request_status=$1,updated_at=now() WHERE id=$2 AND to_character_id=$3 AND request_status='pending' RETURNING from_character_id,relationship_type", [status,requestId,characterId]);
      if (!changed.rowCount) return send(res, 409, { error: "Cette proposition n'est plus en attente." });
      await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_response',$2,$3,'link_request',$4)", [changed.rows[0].from_character_id,status==="accepted"?"Proposition acceptée":"Proposition refusée",status==="accepted"?"Ta proposition de lien a été acceptée.":"Ta proposition de lien a été refusée.",requestId]);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && action === "edit-request") {
      const requestId = String(body.requestId ?? ""), rawRelationshipType = String(body.relationshipType ?? "").trim().slice(0,120);
      const category = categories.has(String(body.relationshipCategory ?? "")) ? String(body.relationshipCategory) : "other";
      if (!requestId || !rawRelationshipType) return bad(res, "Proposition invalide.");
      const relationshipType = category === "other" && !/^autre\s*:/i.test(rawRelationshipType) ? "Autre : " + rawRelationshipType : rawRelationshipType;
      const target = await databasePool.query("SELECT to_character_id FROM link_requests WHERE id=$1 AND from_character_id=$2 AND request_status='pending'", [requestId,characterId]);
      if (!target.rowCount) return send(res, 404, { error: "Cette proposition ne peut plus être modifiée." });
      const targetPerson = await availableCharacter(target.rows[0].to_character_id);
      if (actor.character_type !== targetPerson.rows[0]?.character_type && !isFamily(category,relationshipType)) return send(res, 403, { error: "Seuls les liens familiaux sont autorisés entre élèves et personnel." });
      await databasePool.query("UPDATE link_requests SET relationship_type=$1,relationship_category=$2,message=$3,updated_at=now() WHERE id=$4", [relationshipType,category,String(body.message??"").trim()||null,requestId]);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && action === "cancel") {
      const requestId = String(body.requestId ?? "");
      const changed = await databasePool.query("UPDATE link_requests SET request_status='cancelled',updated_at=now() WHERE id=$1 AND from_character_id=$2 AND request_status='pending' RETURNING to_character_id,relationship_type", [requestId,characterId]);
      if (!changed.rowCount) return send(res, 409, { error: "Cette proposition ne peut plus être annulée." });
      await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_cancelled','Proposition annulée',$2,'link_request',$3)", [changed.rows[0].to_character_id, "La proposition « " + changed.rows[0].relationship_type + " » a été annulée.", requestId]);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && action === "remove-link") {
      const requestId = String(body.requestId ?? "");
      const changed = await databasePool.query("UPDATE link_requests SET request_status='ended',ended_at=now(),updated_at=now() WHERE id=$1 AND (from_character_id=$2 OR to_character_id=$2) AND request_status='accepted' RETURNING from_character_id,to_character_id,relationship_type", [requestId,characterId]);
      if (!changed.rowCount) return send(res, 404, { error: "Ce lien n'est plus actif." });
      const otherId = changed.rows[0].from_character_id === characterId ? changed.rows[0].to_character_id : changed.rows[0].from_character_id;
      await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_removed','Lien terminé','Un de tes liens a été supprimé par l’autre personnage.','link_request',$2)", [otherId,requestId]);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && action === "discussion-create") {
      const targetId = String(body.targetCharacterId ?? ""), requestId = String(body.requestId ?? "") || null;
      if (!targetId || targetId === characterId) return bad(res, "Personnage invalide.");
      const target = await availableCharacter(targetId);
      if (!target.rowCount) return send(res,404,{error:"Personnage introuvable."});
      const published = await databasePool.query("SELECT 1 FROM link_profiles WHERE character_id=$1", [targetId]);
      if (!published.rowCount) return send(res,409,{error:"Ce personnage n'a pas publié sa demande de liens."});
      if (requestId) {
        const belongsToPair = await databasePool.query("SELECT 1 FROM link_requests WHERE id=$1 AND ((from_character_id=$2 AND to_character_id=$3) OR (from_character_id=$3 AND to_character_id=$2))", [requestId,characterId,targetId]);
        if (!belongsToPair.rowCount) return send(res,403,{error:"Cette proposition ne correspond pas à ces deux personnages."});
        const existing = await databasePool.query("SELECT conversation_id FROM link_discussions WHERE request_id=$1 AND ((character_a_id=$2 AND character_b_id=$3) OR (character_b_id=$2 AND character_a_id=$3))", [requestId,characterId,targetId]);
        if (existing.rowCount) return send(res,200,{conversationId:existing.rows[0].conversation_id});
      }
      const client = await databasePool.connect();
      try {
        await client.query("BEGIN");
        const conversation = await client.query("INSERT INTO conversations(conversation_type,created_by_character_id) VALUES('direct',$1) RETURNING id", [characterId]);
        await client.query("INSERT INTO conversation_members(conversation_id,character_id) VALUES($1,$2),($1,$3)", [conversation.rows[0].id,characterId,targetId]);
        const discussion = await client.query("INSERT INTO link_discussions(conversation_id,request_id,character_a_id,character_b_id,created_by_character_id) VALUES($1,$2,$3,$4,$3) RETURNING id", [conversation.rows[0].id,requestId,characterId,targetId]);
        await client.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_discussion_message','Nouvelle discussion de lien',$2,'link_discussion',$3)", [targetId, actor.first_name + " " + actor.last_name + " souhaite discuter d'un lien avec toi.",discussion.rows[0].id]);
        await client.query("COMMIT");
        return send(res,201,{conversationId:conversation.rows[0].id,discussionId:discussion.rows[0].id});
      } catch(error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    }

    if (req.method === "POST" && action === "discussion-hide") {
      const discussionId = String(body.discussionId ?? "");
      const allowed = await databasePool.query("SELECT 1 FROM link_discussions WHERE id=$1 AND (character_a_id=$2 OR character_b_id=$2)", [discussionId,characterId]);
      if (!allowed.rowCount) return send(res,404,{error:"Discussion introuvable."});
      await databasePool.query("INSERT INTO link_discussion_hidden(discussion_id,character_id) VALUES($1,$2) ON CONFLICT(discussion_id,character_id) DO UPDATE SET hidden_at=now()", [discussionId,characterId]);
      return send(res,200,{ok:true});
    }

    return bad(res, "Action Demandes de liens inconnue.");
  } catch (error) {
    console.error("Hogwarts Phone links API:", error);
    return send(res,500,{error:"Une erreur est survenue. Réessaie."});
  }
}
