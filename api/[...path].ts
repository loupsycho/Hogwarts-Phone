import { toNodeHandler } from "better-auth/node";
import { auth } from "../src/server/auth.js";

// Vercel catch-all for Better Auth endpoints under /api/auth/*.
// The explicit /api/account/bootstrap function remains a more specific route.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
