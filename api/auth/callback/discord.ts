import { toNodeHandler } from "better-auth/node";
import { auth } from "../../../../src/server/auth.js";

// Register Discord's exact OAuth callback as a Vercel function.
// The general Better Auth handler remains responsible for all auth logic.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
