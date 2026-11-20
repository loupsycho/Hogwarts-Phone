import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createActivitySession, setActivitySessionCookie } from "../src/server/activity-session.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const code = String(req.body?.code ?? "");
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!code || !clientId || !clientSecret) return res.status(400).json({ error: "Informations de connexion manquantes." });

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://127.0.0.1",
    });
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenData = await tokenResponse.json() as { access_token?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Discord Activity token exchange failed:", tokenData.error_description || tokenResponse.status);
      return res.status(401).json({ error: "Discord n'a pas accepté l'autorisation. Vérifie les paramètres OAuth de l'application." });
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const user = await userResponse.json() as { id?: string; username?: string; global_name?: string; avatar?: string | null };
    if (!userResponse.ok || !user.id) return res.status(401).json({ error: "Impossible de récupérer ton compte Discord." });

    const username = user.global_name || user.username || "Sorcière ou sorcier";
    const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
    const session = createActivitySession({ id: user.id, username, avatar });
    setActivitySessionCookie(res, session);
    return res.status(200).json({ access_token: tokenData.access_token });
  } catch (error) {
    console.error("Hogwarts Phone Activity authentication failed:", error);
    return res.status(500).json({ error: "La connexion Discord a échoué." });
  }
}
