import { toNodeHandler } from "better-auth/node";
import { auth } from "../../src/server/auth.js";

// Explicit Better Auth route. Keep this specific route for /api/auth/*;
// api/[...path].ts remains the general API fallback.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
