import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "hogwarts_activity_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export type ActivitySession = { id: string; username: string; avatar: string | null; exp: number };

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is required.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createActivitySession(session: Omit<ActivitySession, "exp">) {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return payload + "." + sign(payload);
}

export function getActivitySession(cookieHeader?: string, authorization?: string): ActivitySession | null {
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const raw = bearer || cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE_NAME + "="))?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ActivitySession;
    if (!data.id || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

export function setActivitySessionCookie(res: { setHeader(name: string, value: string): unknown }, token: string) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`);
}

export function clearActivitySessionCookie(res: { setHeader(name: string, value: string): unknown }) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`);
}
