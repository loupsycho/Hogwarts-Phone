import { toNodeHandler } from "better-auth/node";
import { auth } from "../../../src/server/auth.js";

// Explicit Vercel function for Discord's social sign-in endpoint.
// The Better Auth catch-all remains responsible for callbacks and session routes.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
