import { toNodeHandler } from "better-auth/node";
import { auth } from "../../src/server/auth.js";

// Better Auth's Node adapter expects the auth.handler function.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default toNodeHandler(auth.handler);
