import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { databasePool } from "../../src/server/database.js";

const secretKey = process.env.CLERK_SECRET_KEY;

function authorizedParties() {
  const values = [
    process.env.APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!secretKey) {
    return res.status(503).json({ error: "Clerk server authentication is not configured" });
  }

  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not signed in" });

  try {
    const verifiedToken = await verifyToken(token, {
      secretKey,
      authorizedParties: authorizedParties(),
    });
    const clerkUserId = verifiedToken.sub;
    if (!clerkUserId) return res.status(401).json({ error: "Invalid session" });

    const clerk = createClerkClient({ secretKey });
    const clerkUser = await clerk.users.getUser(clerkUserId);
    const discordAccount = clerkUser.externalAccounts.find(
      (account) => account.provider.toLowerCase().includes("discord"),
    );

    if (!discordAccount?.providerUserId) {
      return res.status(403).json({ error: "Discord account not linked" });
    }

    const discordUserId = discordAccount.providerUserId;
    const discordUsername =
      discordAccount.username ||
      [discordAccount.firstName, discordAccount.lastName].filter(Boolean).join(" ") ||
      clerkUser.username ||
      clerkUser.firstName ||
      "Sorcière ou sorcier";
    const discordAvatarUrl = discordAccount.imageUrl || clerkUser.imageUrl || null;

    const adminResult = await databasePool.query(
      "SELECT EXISTS (SELECT 1 FROM app_admins WHERE discord_user_id = $1) AS is_admin",
      [discordUserId],
    );
    const isAdmin = Boolean(adminResult.rows[0]?.is_admin);

    const playerResult = await databasePool.query(
      "INSERT INTO app_users (discord_user_id, discord_username, discord_avatar_url, account_status) " +
      "VALUES ($1, $2, $3, $4) " +
      "ON CONFLICT (discord_user_id) DO UPDATE " +
      "SET discord_username = EXCLUDED.discord_username, " +
      "discord_avatar_url = EXCLUDED.discord_avatar_url, " +
      "account_status = CASE WHEN $4 = 'approved' THEN 'approved' ELSE app_users.account_status END, " +
      "updated_at = now() " +
      "RETURNING id, account_status",
      [discordUserId, discordUsername, discordAvatarUrl, isAdmin ? "approved" : "pending"],
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
        "SELECT id, first_name, last_name, character_type, house, role_title, avatar_url " +
        "FROM characters WHERE owner_user_id = $1 ORDER BY first_name ASC, last_name ASC",
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
    console.error("Hogwarts Phone Clerk account bootstrap failed:", error);
    return res.status(401).json({ error: "Unable to verify Clerk session" });
  }
}
