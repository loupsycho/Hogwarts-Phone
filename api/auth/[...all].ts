import { toNodeHandler } from "better-auth/node";
import { auth } from "../../src/server/auth.js";

// Explicit Better Auth route for /api/auth/*.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
