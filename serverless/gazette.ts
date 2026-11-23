import type { VercelRequest, VercelResponse } from "@vercel/node";
import { databasePool } from "../src/server/auth.js";
import { getActivitySession } from "../src/server/activity-session.js";

function send(res: VercelResponse, status: number, data: unknown) {
  return res.status(status).json(data);
}
const bad = (res: VercelResponse, message: string) => send(res, 400, { error: message });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const discord = getActivitySession(req.headers.cookie, req.headers.authorization);
    if (!discord) return send(res, 401, { error: "Connexion Discord requise." });

    const [adminResult, playerResult] = await Promise.all([
      databasePool.query("SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes", [discord.id]),
      databasePool.query("SELECT id,account_status FROM app_users WHERE discord_user_id=$1", [discord.id]),
    ]);
    const isAdmin = Boolean(adminResult.rows[0]?.yes);
    const player = playerResult.rows[0] ?? null;
    if (!isAdmin && player?.account_status !== "approved") return send(res, 403, { error: "Compte non autorisé." });

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
    const action = String(req.query.action ?? body.action ?? "feed");
    const characterId = String(body.characterId ?? req.query.characterId ?? "");

    async function requireCharacter() {
      if (!characterId) return null;
      const owned = await databasePool.query(
        "SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.id=$2 AND u.account_status='approved'",
        [characterId, player?.id],
      );
      return owned.rowCount ? characterId : null;
    }

    if (req.method === "GET") {
      if (action === "admin-dashboard") {
        if (!isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        const [articles, threads, settings, characters] = await Promise.all([
          databasePool.query(`
            SELECT a.id,a.title,a.summary,a.body,a.category,a.publication_status,a.published_at,a.created_at,
              CASE WHEN a.image_media_id IS NOT NULL THEN '/api/media?id='||a.image_media_id::text ELSE NULL END AS image_url,
              (SELECT count(*) FROM gazette_reactions r WHERE r.article_id=a.id AND r.reaction='like') AS likes,
              (SELECT count(*) FROM gazette_reactions r WHERE r.article_id=a.id AND r.reaction='dislike') AS dislikes,
              COALESCE((SELECT json_agg(json_build_object('name',c.first_name||' '||c.last_name,'reaction',r.reaction) ORDER BY c.first_name,c.last_name)
                FROM gazette_reactions r JOIN characters c ON c.id=r.character_id WHERE r.article_id=a.id), '[]'::json) AS reactions
            FROM gazette_articles a ORDER BY a.created_at DESC
          `),
          databasePool.query(`
            SELECT t.id AS thread_id,t.character_id,c.first_name,c.last_name,c.avatar_url,c.character_type,
              (SELECT count(*) FROM gazette_messages m WHERE m.thread_id=t.id AND m.sender_type='character' AND m.read_at IS NULL) AS unread_count,
              (SELECT COALESCE(NULLIF(m.body,''),'Photo') FROM gazette_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT m.created_at FROM gazette_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
            FROM gazette_threads t JOIN characters c ON c.id=t.character_id
            ORDER BY t.updated_at DESC
          `),
          databasePool.query("SELECT CASE WHEN avatar_media_id IS NOT NULL THEN '/api/media?id='||avatar_media_id::text ELSE NULL END AS avatar_url FROM gazette_settings WHERE id=1"),
          databasePool.query("SELECT c.id,c.first_name,c.last_name,c.character_type,c.house,c.role_title FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved' ORDER BY c.first_name,c.last_name"),
        ]);
        return send(res, 200, {
          articles: articles.rows,
          threads: threads.rows,
          avatarUrl: settings.rows[0]?.avatar_url ?? null,
          characters: characters.rows,
          unreadMessages: threads.rows.reduce((sum: number, thread: any) => sum + Number(thread.unread_count || 0), 0),
        });
      }

      if (action === "admin-thread") {
        if (!isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        const threadId = String(req.query.threadId ?? "");
        if (!threadId) return bad(res, "Conversation introuvable.");
        await databasePool.query("UPDATE gazette_messages SET read_at=COALESCE(read_at,now()) WHERE thread_id=$1 AND sender_type='character'", [threadId]);
        const thread = await databasePool.query("SELECT t.id,t.character_id,c.first_name,c.last_name,c.avatar_url FROM gazette_threads t JOIN characters c ON c.id=t.character_id WHERE t.id=$1", [threadId]);
        if (!thread.rowCount) return send(res, 404, { error: "Conversation introuvable." });
        const messages = await databasePool.query(`
          SELECT m.id,m.sender_type,m.body,m.created_at,m.media_id,
            CASE WHEN m.media_id IS NOT NULL THEN '/api/media?id='||m.media_id::text ELSE NULL END AS media_url,
            c.first_name,c.last_name
          FROM gazette_messages m LEFT JOIN characters c ON c.id=CASE WHEN m.sender_type='character' THEN (SELECT character_id FROM gazette_threads WHERE id=m.thread_id) ELSE NULL END
          WHERE m.thread_id=$1 ORDER BY m.created_at
        `, [threadId]);
        return send(res, 200, { thread: thread.rows[0], messages: messages.rows });
      }

      if (action === "thread") {
        const active = await requireCharacter();
        if (!active) return send(res, 403, { error: "Personnage inaccessible." });
        const thread = await databasePool.query("SELECT id FROM gazette_threads WHERE character_id=$1", [active]);
        if (!thread.rowCount) return send(res, 200, { threadId: null, messages: [] });
        const threadId = thread.rows[0].id;
        await databasePool.query("UPDATE gazette_messages SET read_at=COALESCE(read_at,now()) WHERE thread_id=$1 AND sender_type='gazette'", [threadId]);
        const messages = await databasePool.query(`
          SELECT m.id,m.sender_type,m.body,m.created_at,
            CASE WHEN m.media_id IS NOT NULL THEN '/api/media?id='||m.media_id::text ELSE NULL END AS media_url
          FROM gazette_messages m WHERE m.thread_id=$1 ORDER BY m.created_at
        `, [threadId]);
        return send(res, 200, { threadId, messages: messages.rows });
      }

      if (action === "feed") {
        if (characterId) {
          const active = await requireCharacter();
          if (!active) return send(res, 403, { error: "Personnage inaccessible." });
        }
        const [articles, settings] = await Promise.all([
          databasePool.query(`
            SELECT a.id,a.title,a.summary,a.body,a.category,a.published_at,
              CASE WHEN a.image_media_id IS NOT NULL THEN '/api/media?id='||a.image_media_id::text ELSE NULL END AS image_url,
              (SELECT count(*) FROM gazette_reactions r WHERE r.article_id=a.id AND r.reaction='like') AS likes,
              (SELECT count(*) FROM gazette_reactions r WHERE r.article_id=a.id AND r.reaction='dislike') AS dislikes,
              (SELECT r.reaction FROM gazette_reactions r WHERE r.article_id=a.id AND r.character_id=$1) AS my_reaction
            FROM gazette_articles a WHERE a.publication_status='published'
            ORDER BY a.published_at DESC NULLS LAST,a.created_at DESC
          `, [characterId || null]),
          databasePool.query("SELECT CASE WHEN avatar_media_id IS NOT NULL THEN '/api/media?id='||avatar_media_id::text ELSE NULL END AS avatar_url FROM gazette_settings WHERE id=1"),
        ]);
        return send(res, 200, { articles: articles.rows, avatarUrl: settings.rows[0]?.avatar_url ?? null });
      }
      return bad(res, "Action GET inconnue.");
    }

    if (req.method === "POST") {
      if (action === "send") {
        const active = await requireCharacter();
        if (!active) return send(res, 403, { error: "Personnage inaccessible." });
        const text = String(body.body ?? "").trim();
        const mediaId = body.mediaId ? String(body.mediaId) : null;
        if (!text && !mediaId) return bad(res, "Écris un message ou joins une photo.");
        if (mediaId) {
          const media = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='message'", [mediaId, active]);
          if (!media.rowCount) return bad(res, "Photo inaccessible.");
        }
        const thread = await databasePool.query("INSERT INTO gazette_threads(character_id) VALUES($1) ON CONFLICT(character_id) DO UPDATE SET updated_at=now() RETURNING id", [active]);
        const threadId = thread.rows[0].id;
        await databasePool.query("INSERT INTO gazette_messages(thread_id,sender_type,sender_user_id,body,media_id) VALUES($1,'character',$2,$3,$4)", [threadId, player?.id, text, mediaId]);
        await databasePool.query("UPDATE gazette_threads SET updated_at=now() WHERE id=$1", [threadId]);
        return send(res, 201, { ok: true, threadId });
      }

      if (action === "react") {
        const active = await requireCharacter();
        const articleId = String(body.articleId ?? "");
        const reaction = String(body.reaction ?? "");
        if (!active || !articleId || !["like", "dislike", "none"].includes(reaction)) return bad(res, "Réaction invalide.");
        const article = await databasePool.query("SELECT id FROM gazette_articles WHERE id=$1 AND publication_status='published'", [articleId]);
        if (!article.rowCount) return send(res, 404, { error: "Publication introuvable." });
        if (reaction === "none") await databasePool.query("DELETE FROM gazette_reactions WHERE article_id=$1 AND character_id=$2", [articleId, active]);
        else await databasePool.query("INSERT INTO gazette_reactions(article_id,character_id,reaction) VALUES($1,$2,$3) ON CONFLICT(article_id,character_id) DO UPDATE SET reaction=EXCLUDED.reaction,created_at=now()", [articleId, active, reaction]);
        return send(res, 200, { ok: true });
      }

      if (action === "admin-publish") {
        if (!isAdmin || !player?.id) return send(res, 403, { error: "Réservé à l'administration." });
        const title = String(body.title ?? "").trim();
        const text = String(body.body ?? "").trim();
        if (!title || !text) return bad(res, "Le titre et le texte de l'article sont obligatoires.");
        const imageMediaId = body.imageMediaId ? String(body.imageMediaId) : null;
        if (imageMediaId) {
          const media = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND owner_user_id=$2 AND media_kind='gazette'", [imageMediaId, player.id]);
          if (!media.rowCount) return bad(res, "Photo de publication inaccessible.");
        }
        const category = String(body.category ?? "Actualité").trim().slice(0, 80) || "Actualité";
        const inserted = await databasePool.query("INSERT INTO gazette_articles(title,summary,body,category,publication_status,created_by_user_id,published_at,image_media_id) VALUES($1,$2,$3,$4,'published',$5,now(),$6) RETURNING id", [title, String(body.summary ?? "").trim() || null, text, category, player.id, imageMediaId]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT c.id,'gazette_article','Nouvelle édition de la Gazette','La Gazette du Sorcier vient de publier un nouvel article.','gazette_article',$1 FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved'", [inserted.rows[0].id]);
        return send(res, 201, { id: inserted.rows[0].id });
      }

      if (action === "admin-delete-article") {
        if (!isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
        const articleId = String(body.articleId ?? "");
        if (!articleId) return bad(res, "Publication introuvable.");
        const client = await databasePool.connect();
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM notifications WHERE target_type='gazette_article' AND target_id=$1", [articleId]);
          const deleted = await client.query("DELETE FROM gazette_articles WHERE id=$1 RETURNING id", [articleId]);
          await client.query("COMMIT");
          return send(res, deleted.rowCount ? 200 : 404, { ok: Boolean(deleted.rowCount) });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }

      if (action === "admin-avatar") {
        if (!isAdmin || !player?.id) return send(res, 403, { error: "Réservé à l'administration." });
        const mediaId = String(body.mediaId ?? "");
        const media = await databasePool.query("SELECT id FROM media_assets WHERE id=$1 AND owner_user_id=$2 AND media_kind='gazette'", [mediaId, player.id]);
        if (!media.rowCount) return bad(res, "Photo de profil inaccessible.");
        await databasePool.query("INSERT INTO gazette_settings(id,avatar_media_id) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET avatar_media_id=EXCLUDED.avatar_media_id,updated_at=now()", [mediaId]);
        return send(res, 200, { ok: true });
      }

      if (action === "admin-reply" || action === "admin-send") {
        if (!isAdmin || !player?.id) return send(res, 403, { error: "Réservé à l'administration." });
        const text = String(body.body ?? "").trim();
        const targetCharacterId = String(body.characterId ?? body.targetCharacterId ?? "");
        if (!text) return bad(res, "Écris un message avant de l'envoyer.");
        let threadId = String(body.threadId ?? "");
        if (action === "admin-send") {
          const target = await databasePool.query("SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'", [targetCharacterId]);
          if (!target.rowCount) return bad(res, "Personnage introuvable.");
          const thread = await databasePool.query("INSERT INTO gazette_threads(character_id) VALUES($1) ON CONFLICT(character_id) DO UPDATE SET updated_at=now() RETURNING id", [targetCharacterId]);
          threadId = thread.rows[0].id;
        }
        const thread = await databasePool.query("SELECT character_id FROM gazette_threads WHERE id=$1", [threadId]);
        if (!thread.rowCount) return bad(res, "Conversation introuvable.");
        await databasePool.query("INSERT INTO gazette_messages(thread_id,sender_type,sender_user_id,body) VALUES($1,'gazette',$2,$3)", [threadId, player.id, text]);
        await databasePool.query("UPDATE gazette_threads SET updated_at=now() WHERE id=$1", [threadId]);
        await databasePool.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'gazette_message','Un message de la Gazette','La Gazette du Sorcier vous a envoyé un message privé.','gazette_message',$2)", [thread.rows[0].character_id, threadId]);
        return send(res, 201, { ok: true, threadId });
      }
      return bad(res, "Action POST inconnue.");
    }

    if (req.method === "DELETE") {
      if (!isAdmin) return send(res, 403, { error: "Réservé à l'administration." });
      if (action === "admin-article") {
        const articleId = String(req.query.articleId ?? body.articleId ?? "");
        if (!articleId) return bad(res, "Publication introuvable.");
        const deleted = await databasePool.query("DELETE FROM gazette_articles WHERE id=$1 RETURNING id", [articleId]);
        return send(res, deleted.rowCount ? 200 : 404, { ok: Boolean(deleted.rowCount) });
      }
      return bad(res, "Action DELETE inconnue.");
    }

    return send(res, 405, { error: "Méthode non autorisée." });
  } catch (error) {
    console.error("Hogwarts Phone Gazette API:", error);
    return send(res, 500, { error: "Une erreur est survenue dans la Gazette." });
  }
}
