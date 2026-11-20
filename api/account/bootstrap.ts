import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fromNodeHeaders } from "better-auth/node";
import { auth, databasePool } from "../../src/server/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: "Not signed in" });

    const linkedAccount = await databasePool.query(
      'SELECT a."accountId" AS discord_user_id, u.name AS discord_username, u.image AS discord_avatar_url ' +
      'FROM "account" a JOIN "user" u ON u.id = a."userId" ' +
      'WHERE a."userId" = $1 AND a."providerId" = $2 LIMIT 1',
      [session.user.id, "discord"],
    );

    if (linkedAccount.rowCount === 0) {
      return res.status(403).json({ error: "Discord account not linked" });
    }

    const discord = linkedAccount.rows[0];
    const adminResult = await databasePool.query(
      "SELECT EXISTS (SELECT 1 FROM app_admins WHERE discord_user_id = $1) AS is_admin",
      [discord.discord_user_id],
    );
    const isAdmin = Boolean(adminResult.rows[0]?.is_admin);

    const playerResult = await databasePool.query(
      'INSERT INTO app_users (discord_user_id, discord_username, discord_avatar_url, account_status) ' +
      'VALUES ($1, $2, $3, $4) ' +
      'ON CONFLICT (discord_user_id) DO UPDATE ' +
      'SET discord_username = EXCLUDED.discord_username, ' +
      'discord_avatar_url = EXCLUDED.discord_avatar_url, ' +
      "account_status = CASE WHEN $4 = 'approved' THEN 'approved' ELSE app_users.account_status END, " +
      'updated_at = now() ' +
      'RETURNING id, account_status',
      [discord.discord_user_id, discord.discord_username ?? "Sorcière ou sorcier", discord.discord_avatar_url, isAdmin ? "approved" : "pending"],
    );

    const player = playerResult.rows[0];
    const response: {
      accountStatus: string;
      isAdmin: boolean;
      characters: Array<{
        id: string;
        firstName: string;
        lastName: string;
        characterType: "student" | "staff";
        house: string | null;
        roleTitle: string | null;
        avatarUrl: string | null;
      }>;
    } = { accountStatus: player.account_status, isAdmin, characters: [] };

    if (player.account_status === "approved") {
      const characterResult = await databasePool.query(
        'SELECT id, first_name, last_name, character_type, house, role_title, avatar_url ' +
        'FROM characters WHERE owner_user_id = $1 ORDER BY first_name ASC, last_name ASC',
        [player.id],
      );
      response.characters = characterResult.rows.map((character) => ({
        id: character.id,
        firstName: character.first_name,
        lastName: character.last_name,
        characterType: character.character_type,
        house: character.house,
        roleTitle: character.role_title,
        avatarUrl: character.avatar_url,
      }));
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Hogwarts Phone account bootstrap failed:", error);
    return res.status(500).json({ error: "Unable to load player account" });
  }
}
