import type { VercelRequest, VercelResponse } from "@vercel/node";
import { databasePool } from "../src/server/auth.js";
import { getActivitySession } from "../src/server/activity-session.js";

async function context(req: VercelRequest) {
  const discord = getActivitySession(req.headers.cookie, req.headers.authorization);
  if (!discord) return null;
  const admin = await databasePool.query("SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes", [discord.id]);
  const player = await databasePool.query("SELECT id, account_status FROM app_users WHERE discord_user_id=$1", [discord.id]);
  return { discord, isAdmin: Boolean(admin.rows[0]?.yes), player: player.rows[0] ?? null };
}

function send(res: VercelResponse, status: number, data: unknown) {
  return res.status(status).json(data);
}
const bad = (res: VercelResponse, message: string) => send(res, 400, { error: message });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ctx = await context(req);
    if (!ctx) return send(res, 401, { error: "Connexion Discord requise." });
    if (!ctx.isAdmin && ctx.player?.account_status !== "approved") return send(res, 403, { error: "Compte non autorisé." });
    const action = String(req.query.action ?? req.body?.action ?? "");
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
    const own = async (id: string) => {
      const r = await databasePool.query("SELECT id, owner_user_id, first_name, last_name, character_type, house, role_title, avatar_url, biography FROM characters WHERE id=$1", [id]);
      if (!r.rowCount) return null;
      if (!ctx.isAdmin && r.rows[0].owner_user_id !== ctx.player?.id) return null;
      return r.rows[0];
    };
    const activeCharacter = String(body.characterId ?? req.query.characterId ?? "");
    if (activeCharacter && !await own(activeCharacter)) return send(res, 403, { error: "Personnage inaccessible." });

    if (req.method === "GET") {
      if (action === "contacts") {
        const r = await databasePool.query("SELECT c.id, c.first_name, c.last_name, c.character_type, c.house, c.role_title, c.avatar_url, c.age, c.character_kind, c.quidditch_position, c.optional_courses, c.important_role, c.house_responsibility, c.sexual_orientation FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved' ORDER BY c.character_type, c.house NULLS LAST, c.first_name");
        return send(res, 200, { characters: r.rows });
      }
      if (action === "feed") {
        const r = await databasePool.query("SELECT p.id,p.character_id,p.caption,COALESCE(p.image_url, CASE WHEN p.media_id IS NOT NULL THEN '/api/media?id=' || p.media_id::text ELSE NULL END) AS image_url,ma.mime_type AS media_mime_type,p.created_at,c.first_name,c.last_name,c.avatar_url,c.house,c.sexual_orientation,(SELECT count(*) FROM instagram_likes l WHERE l.post_id=p.id) AS likes,(SELECT count(*) FROM instagram_comments cm WHERE cm.post_id=p.id) AS comments, (SELECT COALESCE(json_agg(json_build_object('id',cm.id,'body',cm.body,'characterName',cc.first_name || ' ' || cc.last_name) ORDER BY cm.created_at), '[]'::json) FROM instagram_comments cm JOIN characters cc ON cc.id=cm.character_id WHERE cm.post_id=p.id) AS comment_list, EXISTS(SELECT 1 FROM instagram_likes l WHERE l.post_id=p.id AND l.character_id=$1) AS liked FROM instagram_posts p JOIN characters c ON c.id=p.character_id LEFT JOIN media_assets ma ON ma.id=p.media_id ORDER BY p.created_at DESC LIMIT 100", [activeCharacter || null]);
        return send(res, 200, { posts: r.rows });
      }
      if (action === "notifications") {
        const r = await databasePool.query("SELECT id,notification_type,title,body,target_type,target_id,read_at,created_at FROM notifications WHERE character_id=$1 ORDER BY created_at DESC LIMIT 100", [activeCharacter]);
        return send(res, 200, { notifications: r.rows });
      }
      if (action === "instagram-profile") {
        const targetId = String(req.query.profileCharacterId ?? "");
        const person = await databasePool.query("SELECT c.id,c.first_name,c.last_name,c.avatar_url,c.house,c.character_type,c.role_title,c.sexual_orientation,c.age,(SELECT count(*) FROM instagram_follows f WHERE f.followed_character_id=c.id) AS followers,(SELECT count(*) FROM instagram_follows f WHERE f.follower_character_id=c.id) AS following,EXISTS(SELECT 1 FROM instagram_follows f WHERE f.follower_character_id=$2 AND f.followed_character_id=c.id) AS is_following FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'", [targetId, activeCharacter || null]);
        if (!person.rowCount) return send(res, 404, { error: "Profil introuvable." });
        const posts = await databasePool.query("SELECT p.id,p.caption,COALESCE(p.image_url,CASE WHEN p.media_id IS NOT NULL THEN '/api/media?id='||p.media_id::text ELSE NULL END) AS image_url,ma.mime_type AS media_mime_type,p.created_at FROM instagram_posts p LEFT JOIN media_assets ma ON ma.id=p.media_id WHERE p.character_id=$1 ORDER BY p.created_at DESC", [targetId]);
        return send(res, 200, { profile: person.rows[0], posts: posts.rows });
      }
      if (action === "following") {
        const r = await databasePool.query("SELECT c.id,c.first_name,c.last_name,c.avatar_url,c.house,c.sexual_orientation FROM instagram_follows f JOIN characters c ON c.id=f.followed_character_id WHERE f.follower_character_id=$1 ORDER BY c.first_name", [activeCharacter]);
        return send(res, 200, { characters: r.rows });
      }
      if (action === "gazette") {
        const r = await databasePool.query("SELECT id,title,summary,body,category,published_at FROM gazette_articles WHERE publication_status='published' ORDER BY published_at DESC NULLS LAST");
        return send(res, 200, { articles: r.rows });
      }
      if (action === "contact-links") {
        const targetId = String(req.query.targetCharacterId ?? "");
        if (!targetId) return bad(res, "Personnage requis.");
        const target = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'", [targetId]);
        if (!target.rowCount) return send(res, 404, { error: "Personnage introuvable." });
        const r = await databasePool.query(
          "SELECT lr.relationship_type, other.first_name, other.last_name FROM link_requests lr JOIN characters other ON other.id=CASE WHEN lr.from_character_id=$1 THEN lr.to_character_id ELSE lr.from_character_id END WHERE (lr.from_character_id=$1 OR lr.to_character_id=$1) AND lr.request_status='accepted' ORDER BY other.first_name, other.last_name",
          [targetId]
        );
        return send(res, 200, { links: r.rows });
      }
      if (action === "links") {
        const r = await databasePool.query("SELECT lr.*, f.first_name AS from_first_name,f.last_name AS from_last_name,f.sexual_orientation AS from_orientation,t.first_name AS to_first_name,t.last_name AS to_last_name,t.sexual_orientation AS to_orientation FROM link_requests lr JOIN characters f ON f.id=lr.from_character_id JOIN characters t ON t.id=lr.to_character_id WHERE lr.from_character_id=$1 OR lr.to_character_id=$1 ORDER BY lr.created_at DESC", [activeCharacter]);
        return send(res, 200, { requests: r.rows });
      }
      if (action === "conversations") {
        const r = await databasePool.query("SELECT c.id,c.conversation_type,c.title,c.updated_at,CASE WHEN c.avatar_media_id IS NOT NULL THEN '/api/media?id='||c.avatar_media_id::text ELSE NULL END AS avatar_url, (SELECT string_agg(ch.first_name || ' ' || ch.last_name, ', ') FROM conversation_members cm JOIN characters ch ON ch.id=cm.character_id WHERE cm.conversation_id=c.id AND ch.id<>$1) AS participants, (SELECT ch.avatar_url FROM conversation_members cm JOIN characters ch ON ch.id=cm.character_id WHERE cm.conversation_id=c.id AND ch.id<>$1 ORDER BY ch.first_name LIMIT 1) AS participant_avatar_url, (SELECT COALESCE(NULLIF(m.body,''), CASE WHEN m.media_id IS NOT NULL THEN 'Photo' ELSE NULL END) FROM messages m WHERE m.conversation_id=c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message FROM conversations c JOIN conversation_members mine ON mine.conversation_id=c.id WHERE mine.character_id=$1 ORDER BY c.updated_at DESC", [activeCharacter]);
        return send(res, 200, { conversations: r.rows });
      }
      if (action === "messages") {
        const id = String(req.query.conversationId ?? "");
        const allowed = await databasePool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND character_id=$2", [id, activeCharacter]);
        if (!allowed.rowCount) return send(res, 403, { error: "Conversation inaccessible." });
        const r = await databasePool.query("SELECT m.id,m.body,m.sent_at,m.sender_character_id,c.first_name,c.last_name,c.avatar_url,m.media_id,ma.mime_type,CASE WHEN m.media_id IS NOT NULL THEN '/api/media?id=' || m.media_id::text ELSE NULL END AS media_url FROM messages m JOIN characters c ON c.id=m.sender_character_id LEFT JOIN media_assets ma ON ma.id=m.media_id WHERE m.conversation_id=$1 ORDER BY m.sent_at ASC LIMIT 300", [id]);
        return send(res, 200, { messages: r.rows });
      }
      if (action === "agenda") {
        const r = await databasePool.query("SELECT e.*, (SELECT ep.response FROM agenda_event_participants ep WHERE ep.event_id=e.id AND ep.character_id=$1) AS my_response FROM agenda_events e WHERE e.visibility='all' OR (e.visibility='students' AND EXISTS(SELECT 1 FROM characters c WHERE c.id=$1 AND c.character_type='student')) OR (e.visibility='staff' AND EXISTS(SELECT 1 FROM characters c WHERE c.id=$1 AND c.character_type='staff')) OR (e.visibility='house' AND EXISTS(SELECT 1 FROM characters c WHERE c.id=$1 AND c.house=e.house)) OR e.created_by_character_id=$1 OR EXISTS(SELECT 1 FROM agenda_event_participants ep WHERE ep.event_id=e.id AND ep.character_id=$1) ORDER BY e.starts_at", [activeCharacter || null]);
        return send(res, 200, { events: r.rows });
      }
      if (action === "admin") {
        if (!ctx.isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        const [players, chars, articles, events] = await Promise.all([
          databasePool.query("SELECT id,discord_user_id,discord_username,discord_avatar_url,account_status,created_at FROM app_users ORDER BY created_at DESC"),
          databasePool.query("SELECT c.*,u.discord_username FROM characters c JOIN app_users u ON u.id=c.owner_user_id ORDER BY c.created_at DESC"),
          databasePool.query("SELECT id,title,category,publication_status,created_at FROM gazette_articles ORDER BY created_at DESC"),
          databasePool.query("SELECT id,title,starts_at,visibility FROM agenda_events ORDER BY starts_at DESC LIMIT 30"),
        ]);
        return send(res, 200, { players: players.rows, characters: chars.rows, articles: articles.rows, events: events.rows });
      }
      return bad(res, "Action GET inconnue.");
    }

    if (req.method === "POST") {
      if (action === "instagram-post") {
        if (!activeCharacter) return bad(res, "Personnage requis.");
        if (!body.caption && !body.imageUrl && !body.mediaId) return bad(res, "Ajoute un texte ou un média.");
        if (body.mediaId) { const m = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='instagram'", [body.mediaId, activeCharacter]); if (!m.rowCount) return bad(res, "Média inaccessible."); }
        const r = await databasePool.query("INSERT INTO instagram_posts(character_id,caption,image_url,media_id) VALUES($1,$2,$3,$4) RETURNING id", [activeCharacter, body.caption || null, body.imageUrl || null, body.mediaId || null]);
        return send(res, 201, { id: r.rows[0].id });
      }
      if (action === "instagram-unlike") {
        if (!activeCharacter || !body.postId) return bad(res, "Données manquantes.");
        await databasePool.query("DELETE FROM instagram_likes WHERE post_id=$1 AND character_id=$2", [body.postId, activeCharacter]);
        return send(res, 200, { ok: true });
      }
      if (action === "instagram-like") {
        if (!activeCharacter || !body.postId) return bad(res, "Données manquantes.");
        const liked = await databasePool.query("INSERT INTO instagram_likes(post_id,character_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING post_id", [body.postId, activeCharacter]);
        if (liked.rowCount) { const owner = await databasePool.query("SELECT character_id FROM instagram_posts WHERE id=$1", [body.postId]); if (owner.rowCount && owner.rows[0].character_id !== activeCharacter) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_like','Nouveau J’aime','Une personne aime votre publication.','instagram_post',$2)", [owner.rows[0].character_id,body.postId]); }
        return send(res, 200, { ok: true });
      }
      if (action === "instagram-comment") {
        if (!activeCharacter || !body.postId || !String(body.body ?? "").trim()) return bad(res, "Commentaire invalide.");
        await databasePool.query("INSERT INTO instagram_comments(post_id,character_id,body) VALUES($1,$2,$3)", [body.postId, activeCharacter, String(body.body).trim()]);
        const owner = await databasePool.query("SELECT character_id FROM instagram_posts WHERE id=$1", [body.postId]); if (owner.rowCount && owner.rows[0].character_id !== activeCharacter) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_comment','Nouveau commentaire','Une personne a commenté votre publication.','instagram_post',$2)", [owner.rows[0].character_id,body.postId]);
        return send(res, 201, { ok: true });
      }
      if (action === "link-request") {
        if (!activeCharacter || !body.toCharacterId || !body.relationshipType || body.toCharacterId === activeCharacter) return bad(res, "Demande invalide.");
        const target = await databasePool.query("SELECT 1 FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'", [body.toCharacterId]);
        if (!target.rowCount) return bad(res, "Ce personnage n'est pas disponible.");
        const r = await databasePool.query("INSERT INTO link_requests(from_character_id,to_character_id,relationship_type,message) VALUES($1,$2,$3,$4) RETURNING id", [activeCharacter, body.toCharacterId, String(body.relationshipType), body.message || null]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_request','Nouvelle demande de lien','Un personnage vous propose un lien.','link_request',$2)", [body.toCharacterId,r.rows[0].id]);
        return send(res, 201, { id: r.rows[0].id });
      }
      if (action === "link-response") {
        if (!activeCharacter || !body.requestId || !["accepted","declined"].includes(body.status)) return bad(res, "Réponse invalide.");
        const r = await databasePool.query("UPDATE link_requests SET request_status=$1,updated_at=now() WHERE id=$2 AND to_character_id=$3 RETURNING id,from_character_id", [body.status, body.requestId, activeCharacter]);
        if (r.rowCount) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'link_response','Réponse à votre demande de lien',$2,'link_request',$3)", [r.rows[0].from_character_id,body.status==="accepted"?"Votre demande de lien a été acceptée.":"Votre demande de lien a été refusée.",body.requestId]);
        return send(res, r.rowCount ? 200 : 404, { ok: Boolean(r.rowCount) });
      }
      if (action === "conversation") {
        if (!activeCharacter || !Array.isArray(body.participantIds) || !body.participantIds.length) return bad(res, "Destinataires requis.");
        const ids = [...new Set([activeCharacter, ...body.participantIds.map(String)])];
        const check = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=ANY($1::uuid[]) AND u.account_status='approved'", [ids]);
        if (check.rowCount !== ids.length) return bad(res, "Un destinataire est invalide.");
        if (body.avatarMediaId) { const media = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='gallery'", [body.avatarMediaId,activeCharacter]); if (!media.rowCount) return bad(res,"Photo de groupe inaccessible."); }
        if (ids.length === 2) {
          const existing = await databasePool.query("SELECT c.id FROM conversations c WHERE c.conversation_type='direct' AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.character_id=$1) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.character_id=$2) AND (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)=2 LIMIT 1", [ids[0],ids[1]]);
          if (existing.rowCount) return send(res, 200, { id: existing.rows[0].id });
        }
        const c = await databasePool.query("INSERT INTO conversations(conversation_type,title,created_by_character_id,avatar_media_id) VALUES($1,$2,$3,$4) RETURNING id", [ids.length > 2 ? "group" : "direct", body.title || null, activeCharacter,body.avatarMediaId||null]);
        await databasePool.query("INSERT INTO conversation_members(conversation_id,character_id) SELECT $1, unnest($2::uuid[])", [c.rows[0].id, ids]);
        if (ids.length > 2) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT unnest($1::uuid[]),'group_invite','Nouveau groupe',$2,'conversation',$3", [ids.filter(id=>id!==activeCharacter),body.title||"Vous avez été ajouté à un groupe.",c.rows[0].id]);
        return send(res, 201, { id: c.rows[0].id });
      }
      if (action === "message") {
        if (!activeCharacter || !body.conversationId || (!String(body.body ?? "").trim() && !body.mediaId)) return bad(res, "Message invalide.");
        const allowed = await databasePool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND character_id=$2", [body.conversationId, activeCharacter]);
        if (!allowed.rowCount) return send(res, 403, { error: "Conversation inaccessible." });
        if (body.mediaId) { const m = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='message'", [body.mediaId, activeCharacter]); if (!m.rowCount) return bad(res, "Pièce jointe inaccessible."); }
        const r = await databasePool.query("INSERT INTO messages(conversation_id,sender_character_id,body,media_id) VALUES($1,$2,$3,$4) RETURNING id", [body.conversationId, activeCharacter, String(body.body ?? "").trim(), body.mediaId || null]);
        await databasePool.query("UPDATE conversations SET updated_at=now() WHERE id=$1", [body.conversationId]);
        const recipients = await databasePool.query("SELECT character_id FROM conversation_members WHERE conversation_id=$1 AND character_id<>$2", [body.conversationId,activeCharacter]);
        for (const recipient of recipients.rows) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'message','Nouveau hibou',$2,'conversation',$3)", [recipient.character_id,String(body.body??"").trim()?"Vous avez reçu un nouveau message.":"Vous avez reçu une pièce jointe.",body.conversationId]);
        return send(res, 201, { id: r.rows[0].id });
      }
      if (action === "agenda-invite") {
        if (!body.eventId || !Array.isArray(body.participantIds) || !body.participantIds.length) return bad(res, "Choisis au moins un participant.");
        const event = await databasePool.query("SELECT id,created_by_character_id FROM agenda_events WHERE id=$1", [body.eventId]);
        if (!event.rowCount || (!ctx.isAdmin && event.rows[0].created_by_character_id !== activeCharacter)) return send(res, 403, { error: "Tu ne peux pas inviter à cet événement." });
        const ids = [...new Set(body.participantIds.map(String))];
        const allowed = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=ANY($1::uuid[]) AND u.account_status='approved'", [ids]);
        if (allowed.rowCount !== ids.length) return bad(res, "Un participant n'est pas disponible.");
        await databasePool.query("INSERT INTO agenda_event_participants(event_id,character_id,response) SELECT $1, unnest($2::uuid[]), 'invited' ON CONFLICT(event_id,character_id) DO NOTHING", [body.eventId, ids]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT unnest($1::uuid[]),'agenda_invite','Invitation à un événement','Vous avez été invité à un événement.','agenda_event',$2", [ids,body.eventId]);
        return send(res, 201, { ok: true });
      }
      if (action === "agenda-response") {
        if (!activeCharacter || !body.eventId || !["accepted","declined"].includes(body.response)) return bad(res, "Réponse invalide.");
        const r = await databasePool.query("UPDATE agenda_event_participants SET response=$1 WHERE event_id=$2 AND character_id=$3 RETURNING event_id", [body.response,body.eventId,activeCharacter]);
        if (r.rowCount) { const owner=await databasePool.query("SELECT created_by_character_id,title FROM agenda_events WHERE id=$1",[body.eventId]); if(owner.rowCount&&owner.rows[0].created_by_character_id&&owner.rows[0].created_by_character_id!==activeCharacter) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'agenda_response','Réponse à votre invitation',$2,'agenda_event',$3)",[owner.rows[0].created_by_character_id,body.response==="accepted"?"Un personnage a accepté votre invitation.":"Un personnage a décliné votre invitation.",body.eventId]); }
        return send(res, r.rowCount ? 200 : 404, { ok: Boolean(r.rowCount) });
      }
      if (action === "notification-read") {
        if (!activeCharacter || !body.notificationId) return bad(res,"Notification invalide.");
        const r = await databasePool.query("UPDATE notifications SET read_at=now() WHERE id=$1 AND character_id=$2 RETURNING id", [body.notificationId,activeCharacter]);
        return send(res,r.rowCount?200:404,{ok:Boolean(r.rowCount)});
      }
      if (action === "instagram-follow") {
        if (!activeCharacter || !body.targetCharacterId || body.targetCharacterId===activeCharacter) return bad(res,"Profil invalide.");
        const target = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'",[body.targetCharacterId]);
        if (!target.rowCount) return bad(res,"Profil indisponible.");
        const followed = await databasePool.query("INSERT INTO instagram_follows(follower_character_id,followed_character_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING followed_character_id",[activeCharacter,body.targetCharacterId]);
        if (followed.rowCount) await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_follow','Nouvel abonnement','Un personnage vous suit désormais sur Instagram.','instagram_profile',$2)",[body.targetCharacterId,activeCharacter]);
        return send(res,200,{ok:true});
      }
      if (action === "instagram-unfollow") {
        await databasePool.query("DELETE FROM instagram_follows WHERE follower_character_id=$1 AND followed_character_id=$2",[activeCharacter,body.targetCharacterId]);
        return send(res,200,{ok:true});
      }
      if (action === "agenda-event") {
        if (!body.title || !body.startsAt) return bad(res, "Titre et date requis.");
        const r = await databasePool.query("INSERT INTO agenda_events(title,description,location,starts_at,ends_at,visibility,house,created_by_user_id,created_by_character_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [body.title,body.description||null,body.location||null,body.startsAt,body.endsAt||null,body.visibility||"all",body.house||null,ctx.player?.id||null,activeCharacter||null]);
        return send(res, 201, { id: r.rows[0].id });
      }
      if (action === "admin-player-status") {
        if (!ctx.isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        if (!body.userId || !["pending","approved","rejected","suspended"].includes(body.status)) return bad(res, "Statut invalide.");
        await databasePool.query("UPDATE app_users SET account_status=$1,updated_at=now() WHERE id=$2", [body.status,body.userId]);
        return send(res, 200, { ok: true });
      }
      if (action === "admin-character") {
        if (!ctx.isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        if (!body.ownerUserId || !body.firstName || !body.lastName || !["student","staff"].includes(body.characterType) || !["OC","Saga"].includes(body.characterKind)) return bad(res, "Fiche personnage incomplète.");
        const student = body.characterType === "student";
        const age = student ? 17 : Number(body.age);
        if (!student && (!Number.isInteger(age) || age < 18 || age > 300)) return bad(res, "L'âge de l'employé doit être compris entre 18 et 300 ans.");
        if (student && !["Gryffindor","Slytherin","Ravenclaw","Hufflepuff"].includes(body.house)) return bad(res, "Choisis une maison.");
        const courses = Array.isArray(body.optionalCourses) ? body.optionalCourses.map(String) : [];
        const r = await databasePool.query(
          "INSERT INTO characters(owner_user_id,first_name,last_name,character_type,house,role_title,age,character_kind,quidditch_position,optional_courses,important_role,house_responsibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
          [body.ownerUserId,body.firstName,body.lastName,body.characterType,student?body.house:null,student?null:(body.roleTitle||"Autre"),age,body.characterKind,student?(body.quidditchPosition||"Pas de Quidditch"):null,student?courses:[],student?(body.importantRole||"Aucun"):null,student?null:(body.houseResponsibility||"Non")]
        );
        return send(res, 201, { id: r.rows[0].id });
      }
      if (action === "admin-article") {
        if (!ctx.isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        if (!body.title || !body.body) return bad(res, "Titre et contenu requis.");
        const status = body.publicationStatus === "published" ? "published" : "draft";
        const r = await databasePool.query("INSERT INTO gazette_articles(title,summary,body,category,publication_status,created_by_user_id,published_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5='published' THEN now() ELSE NULL END) RETURNING id", [body.title,body.summary||null,body.body,body.category||"Actualité",status,ctx.player?.id||null]);
        return send(res, 201, { id: r.rows[0].id });
      }
      return bad(res, "Action POST inconnue.");
    }

    if (req.method === "DELETE") {
      if (!ctx.isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
      if (action === "admin-character" && req.query.characterId) {
        const r = await databasePool.query("DELETE FROM characters WHERE id=$1 RETURNING id", [String(req.query.characterId)]);
        return send(res, r.rowCount ? 200 : 404, { ok: Boolean(r.rowCount) });
      }
      return bad(res, "Action DELETE inconnue.");
    }

    if (req.method === "PATCH") {
      if (!ctx.isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
      if (action === "admin-article-status" && body.articleId && ["draft","published","archived"].includes(body.status)) {
        await databasePool.query("UPDATE gazette_articles SET publication_status=$1,published_at=CASE WHEN $1='published' THEN COALESCE(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=$2", [body.status,body.articleId]);
        return send(res, 200, { ok: true });
      }
      if (action === "admin-character" && body.characterId) {
        if (!body.firstName || !body.lastName || !["student","staff"].includes(body.characterType) || !["OC","Saga"].includes(body.characterKind)) return bad(res, "Fiche personnage incomplète.");
        const student = body.characterType === "student";
        const age = student ? 17 : Number(body.age);
        if (!student && (!Number.isInteger(age) || age < 18 || age > 300)) return bad(res, "L'âge de l'employé doit être compris entre 18 et 300 ans.");
        const courses = Array.isArray(body.optionalCourses) ? body.optionalCourses.map(String) : [];
        const r = await databasePool.query(
          "UPDATE characters SET first_name=$1,last_name=$2,character_type=$3,house=$4,role_title=$5,age=$6,character_kind=$7,quidditch_position=$8,optional_courses=$9,important_role=$10,house_responsibility=$11,updated_at=now() WHERE id=$12 RETURNING id",
          [body.firstName,body.lastName,body.characterType,student?body.house:null,student?null:(body.roleTitle||"Autre"),age,body.characterKind,student?(body.quidditchPosition||"Pas de Quidditch"):null,student?courses:[],student?(body.importantRole||"Aucun"):null,student?null:(body.houseResponsibility||"Non"),body.characterId]
        );
        return send(res, r.rowCount ? 200 : 404, { ok: Boolean(r.rowCount) });
      }
      return bad(res, "Action PATCH inconnue.");
    }

    return send(res, 405, { error: "Méthode non autorisée." });
  } catch (error) {
    console.error("Hogwarts Phone data API:", error);
    return send(res, 500, { error: "Une erreur est survenue. Réessaie." });
  }
}
