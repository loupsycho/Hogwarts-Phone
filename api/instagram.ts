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
  return { discord, isAdmin: Boolean(admin.rows[0]?.yes), player: player.rows[0] ?? null };
}

function send(res: VercelResponse, status: number, data: unknown) {
  return res.status(status).json(data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ctx = await getContext(req);
    if (!ctx) return send(res, 401, { error: "Connexion Discord requise." });
    if (!ctx.isAdmin && ctx.player?.account_status !== "approved") return send(res, 403, { error: "Compte non autorisé." });

    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, any>;
    const action = String(req.query.action ?? body.action ?? "");
    const characterId = String(req.query.characterId ?? body.characterId ?? "");
    const ownCharacter = async (id: string) => {
      if (!id) return null;
      const result = await databasePool.query(
        "SELECT id, owner_user_id, first_name, last_name, avatar_url, house, biography FROM characters WHERE id=$1",
        [id],
      );
      if (!result.rowCount) return null;
      if (!ctx.isAdmin && result.rows[0].owner_user_id !== ctx.player?.id) return null;
      return result.rows[0];
    };
    if (characterId && !await ownCharacter(characterId)) return send(res, 403, { error: "Personnage inaccessible." });

    if (req.method === "GET") {
      if (action === "feed") {
        const result = await databasePool.query(
          `SELECT p.id, p.character_id, p.caption,
             COALESCE(p.image_url, CASE WHEN p.media_id IS NOT NULL THEN '/api/media?id=' || p.media_id::text ELSE NULL END) AS image_url,
             ma.mime_type AS media_mime_type, p.created_at,
             c.first_name, c.last_name, c.avatar_url, c.house,
             (SELECT count(*) FROM instagram_likes l WHERE l.post_id=p.id) AS likes,
             (SELECT count(*) FROM instagram_comments cm WHERE cm.post_id=p.id) AS comments,
             EXISTS(SELECT 1 FROM instagram_likes l WHERE l.post_id=p.id AND l.character_id=$1) AS liked,
             (SELECT COALESCE(json_agg(json_build_object(
               'id',cm.id,'body',cm.body,'characterId',cm.character_id,
               'characterName',cc.first_name || ' ' || cc.last_name,
               'avatarUrl',cc.avatar_url,'parentCommentId',cm.parent_comment_id,
               'likes',(SELECT count(*) FROM instagram_comment_likes cl WHERE cl.comment_id=cm.id),
               'liked',EXISTS(SELECT 1 FROM instagram_comment_likes cl WHERE cl.comment_id=cm.id AND cl.character_id=$1)
             ) ORDER BY cm.created_at), '[]'::json)
              FROM instagram_comments cm JOIN characters cc ON cc.id=cm.character_id WHERE cm.post_id=p.id) AS comment_list
           FROM instagram_posts p
           JOIN characters c ON c.id=p.character_id
           JOIN app_users u ON u.id=c.owner_user_id AND u.account_status='approved'
           LEFT JOIN media_assets ma ON ma.id=p.media_id
           WHERE ($2::uuid IS NULL OR p.id=$2::uuid)
           ORDER BY p.created_at DESC LIMIT 100`,
          [characterId || null, req.query.postId ? String(req.query.postId) : null],
        );
        return send(res, 200, { posts: result.rows });
      }

      if (action === "search") {
        const query = String(req.query.q ?? "").trim();
        if (query.length < 1) return send(res, 200, { characters: [] });
        const result = await databasePool.query(
          `SELECT c.id,c.first_name,c.last_name,c.avatar_url,c.house,c.character_type,c.role_title,
             (SELECT count(*) FROM instagram_follows f WHERE f.followed_character_id=c.id) AS followers
           FROM characters c JOIN app_users u ON u.id=c.owner_user_id
           WHERE u.account_status='approved' AND (c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR (c.first_name || ' ' || c.last_name) ILIKE $1)
           ORDER BY c.first_name,c.last_name LIMIT 30`,
          [`%${query}%`],
        );
        return send(res, 200, { characters: result.rows });
      }

      if (action === "profile") {
        const targetId = String(req.query.profileCharacterId ?? "");
        const result = await databasePool.query(
          `SELECT c.id,c.first_name,c.last_name,c.avatar_url,c.house,c.character_type,c.role_title,c.biography,
             (SELECT count(*) FROM instagram_posts p WHERE p.character_id=c.id) AS posts_count,
             (SELECT count(*) FROM instagram_follows f WHERE f.followed_character_id=c.id) AS followers,
             (SELECT count(*) FROM instagram_follows f WHERE f.follower_character_id=c.id) AS following,
             EXISTS(SELECT 1 FROM instagram_follows f WHERE f.follower_character_id=$2 AND f.followed_character_id=c.id) AS is_following
           FROM characters c JOIN app_users u ON u.id=c.owner_user_id
           WHERE c.id=$1 AND u.account_status='approved'`,
          [targetId, characterId || null],
        );
        if (!result.rowCount) return send(res, 404, { error: "Profil introuvable." });
        const posts = await databasePool.query(
          `SELECT p.id,p.character_id,p.caption,
             COALESCE(p.image_url,CASE WHEN p.media_id IS NOT NULL THEN '/api/media?id='||p.media_id::text ELSE NULL END) AS image_url,
             ma.mime_type AS media_mime_type,p.created_at
           FROM instagram_posts p LEFT JOIN media_assets ma ON ma.id=p.media_id
           WHERE p.character_id=$1 ORDER BY p.created_at DESC`,
          [targetId],
        );
        return send(res, 200, { profile: result.rows[0], posts: posts.rows });
      }

      if (action === "notifications") {
        const result = await databasePool.query(
          "SELECT id,notification_type,title,body,target_type,target_id,read_at,created_at FROM notifications WHERE character_id=$1 AND notification_type LIKE 'instagram_%' ORDER BY created_at DESC LIMIT 100",
          [characterId],
        );
        return send(res, 200, { notifications: result.rows });
      }
      return send(res, 400, { error: "Action Instagram inconnue." });
    }

    if (req.method === "POST") {
      if (!characterId) return send(res, 400, { error: "Personnage requis." });

      if (action === "delete-post") {
        const postId = String(body.postId ?? "");
        if (!postId) return send(res, 400, { error: "Publication requise." });
        const deleted = await databasePool.query(
          "DELETE FROM instagram_posts WHERE id=$1 AND character_id=$2 RETURNING id",
          [postId, characterId],
        );
        return send(res, deleted.rowCount ? 200 : 404, { ok: Boolean(deleted.rowCount), error: deleted.rowCount ? undefined : "Publication introuvable ou tu n’en es pas l’auteur." });
      }

      if (action === "post") {
        if (!body.mediaId) return send(res, 400, { error: "Ajoute une photo ou une vidéo pour publier." });
        if (body.mediaId) {
          const media = await databasePool.query(
            "SELECT id FROM media_assets WHERE id=$1 AND character_id=$2 AND media_kind='instagram'",
            [body.mediaId, characterId],
          );
          if (!media.rowCount) return send(res, 400, { error: "Média inaccessible." });
        }
        const post = await databasePool.query(
          "INSERT INTO instagram_posts(character_id,caption,media_id) VALUES($1,$2,$3) RETURNING id",
          [characterId, String(body.caption ?? "").trim() || null, body.mediaId || null],
        );
        const author = await ownCharacter(characterId);
        await databasePool.query(
          `INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id)
           SELECT f.follower_character_id,'instagram_new_post','Nouvelle publication',
             $2 || ' vient de publier une nouvelle photo ou vidéo.','instagram_post',$3
           FROM instagram_follows f WHERE f.followed_character_id=$1 AND f.follower_character_id<>$1`,
          [characterId, [author?.first_name, author?.last_name].filter(Boolean).join(" "), post.rows[0].id],
        );
        const mentionedIds = Array.isArray(body.mentionCharacterIds)
          ? [...new Set(body.mentionCharacterIds.map(String).filter((id: string) => id && id !== characterId))]
          : [];
        if (mentionedIds.length) {
          const mentioned = await databasePool.query(
            `SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id
             WHERE c.id=ANY($1::uuid[]) AND u.account_status='approved'`,
            [mentionedIds],
          );
          for (const person of mentioned.rows) {
            await databasePool.query(
              "INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_mention','Vous avez été identifié(e)',$2,'instagram_post',$3)",
              [person.id, `${author?.first_name ?? "Un personnage"} vous a identifié dans son post.`, post.rows[0].id],
            );
          }
        }
        return send(res, 201, { id: post.rows[0].id });
      }

      if (action === "like" || action === "unlike") {
        if (!body.postId) return send(res, 400, { error: "Publication requise." });
        if (action === "unlike") {
          await databasePool.query("DELETE FROM instagram_likes WHERE post_id=$1 AND character_id=$2", [body.postId, characterId]);
          return send(res, 200, { ok: true });
        }
        const liked = await databasePool.query(
          "INSERT INTO instagram_likes(post_id,character_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING post_id",
          [body.postId, characterId],
        );
        if (liked.rowCount) {
          const owner = await databasePool.query("SELECT character_id FROM instagram_posts WHERE id=$1", [body.postId]);
          const actor = await ownCharacter(characterId);
          if (owner.rowCount && owner.rows[0].character_id !== characterId) {
            await databasePool.query(
              "INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_like','Nouveau J’aime',$2,'instagram_post',$3)",
              [owner.rows[0].character_id, `${actor?.first_name ?? "Un personnage"} aime votre publication.`, body.postId],
            );
          }
        }
        return send(res, 200, { ok: true });
      }

      if (action === "comment" || action === "reply") {
        const text = String(body.body ?? "").trim();
        if (!body.postId || !text) return send(res, 400, { error: "Commentaire invalide." });
        if (action === "reply" && !body.parentCommentId) return send(res, 400, { error: "Commentaire parent requis." });
        if (body.parentCommentId) {
          const parent = await databasePool.query(
            "SELECT id,character_id FROM instagram_comments WHERE id=$1 AND post_id=$2",
            [body.parentCommentId, body.postId],
          );
          if (!parent.rowCount) return send(res, 400, { error: "Commentaire introuvable." });
        }
        const inserted = await databasePool.query(
          "INSERT INTO instagram_comments(post_id,character_id,body,parent_comment_id) VALUES($1,$2,$3,$4) RETURNING id",
          [body.postId, characterId, text, body.parentCommentId || null],
        );
        const [postOwner, actor] = await Promise.all([
          databasePool.query("SELECT character_id FROM instagram_posts WHERE id=$1", [body.postId]),
          ownCharacter(characterId),
        ]);
        const recipients = new Set<string>();
        if (postOwner.rowCount && postOwner.rows[0].character_id !== characterId) recipients.add(postOwner.rows[0].character_id);
        if (body.parentCommentId) {
          const parent = await databasePool.query("SELECT character_id FROM instagram_comments WHERE id=$1", [body.parentCommentId]);
          if (parent.rowCount && parent.rows[0].character_id !== characterId) recipients.add(parent.rows[0].character_id);
        }
        for (const recipient of recipients) {
          await databasePool.query(
            "INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_comment','Nouveau commentaire',$2,'instagram_post',$3)",
            [recipient, `${actor?.first_name ?? "Un personnage"} a commenté votre publication.`, body.postId],
          );
        }
        return send(res, 201, { id: inserted.rows[0].id });
      }

      if (action === "comment-like" || action === "comment-unlike") {
        if (!body.commentId) return send(res, 400, { error: "Commentaire requis." });
        if (action === "comment-unlike") {
          await databasePool.query("DELETE FROM instagram_comment_likes WHERE comment_id=$1 AND character_id=$2", [body.commentId, characterId]);
          return send(res, 200, { ok: true });
        }
        const result = await databasePool.query(
          "INSERT INTO instagram_comment_likes(comment_id,character_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING comment_id",
          [body.commentId, characterId],
        );
        if (result.rowCount) {
          const owner = await databasePool.query("SELECT character_id FROM instagram_comments WHERE id=$1", [body.commentId]);
          const actor = await ownCharacter(characterId);
          if (owner.rowCount && owner.rows[0].character_id !== characterId) {
            await databasePool.query(
              "INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_comment_like','J’aime sur votre commentaire',$2,'instagram_post',(SELECT post_id FROM instagram_comments WHERE id=$3))",
              [owner.rows[0].character_id, `${actor?.first_name ?? "Un personnage"} aime votre commentaire.`, body.commentId],
            );
          }
        }
        return send(res, 200, { ok: true });
      }

      if (action === "follow" || action === "unfollow") {
        if (!body.targetCharacterId || body.targetCharacterId === characterId) return send(res, 400, { error: "Profil invalide." });
        if (action === "unfollow") {
          await databasePool.query("DELETE FROM instagram_follows WHERE follower_character_id=$1 AND followed_character_id=$2", [characterId, body.targetCharacterId]);
          return send(res, 200, { ok: true });
        }
        const target = await databasePool.query(
          "SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE c.id=$1 AND u.account_status='approved'",
          [body.targetCharacterId],
        );
        if (!target.rowCount) return send(res, 404, { error: "Profil indisponible." });
        const result = await databasePool.query(
          "INSERT INTO instagram_follows(follower_character_id,followed_character_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING followed_character_id",
          [characterId, body.targetCharacterId],
        );
        if (result.rowCount) {
          const actor = await ownCharacter(characterId);
          await databasePool.query(
            "INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) VALUES($1,'instagram_follow','Nouvel abonnement',$2,'instagram_profile',$3)",
            [body.targetCharacterId, `${actor?.first_name ?? "Un personnage"} s’est abonné à votre compte.`, characterId],
          );
        }
        return send(res, 200, { ok: true });
      }

      if (action === "read-all-notifications") {
        await databasePool.query(
          "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE character_id=$1 AND notification_type LIKE 'instagram_%'",
          [characterId],
        );
        return send(res, 200, { ok: true });
      }

      if (action === "read-notification") {
        if (!body.notificationId) return send(res, 400, { error: "Notification requise." });
        const result = await databasePool.query(
          "UPDATE notifications SET read_at=now() WHERE id=$1 AND character_id=$2 RETURNING id",
          [body.notificationId, characterId],
        );
        return send(res, result.rowCount ? 200 : 404, { ok: Boolean(result.rowCount) });
      }

      return send(res, 400, { error: "Action Instagram inconnue." });
    }

    if (req.method === "DELETE" && action === "post") {
      const postId = String(body.postId ?? req.query.postId ?? "");
      if (!characterId || !postId) return send(res, 400, { error: "Publication requise." });
      const result = await databasePool.query(
        "DELETE FROM instagram_posts WHERE id=$1 AND character_id=$2 RETURNING id",
        [postId, characterId],
      );
      return send(res, result.rowCount ? 200 : 404, { ok: Boolean(result.rowCount) });
    }

    return send(res, 405, { error: "Méthode non autorisée." });
  } catch (error) {
    console.error("Hogwarts Phone Instagram API:", error);
    return send(res, 500, { error: "Une erreur est survenue. Réessaie." });
  }
}
