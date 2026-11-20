import { toNodeHandler } from "better-auth/node";
import { auth } from "../../src/server/auth.js";

export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
