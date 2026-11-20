import { toNodeHandler } from "better-auth/node";
import { auth } from "../../src/server/auth.js";

// One catch-all Vercel Function handles every Better Auth endpoint:
// /api/auth/get-session, /api/auth/sign-in/social, /api/auth/callback/discord, etc.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
