import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Add auth routes
auth.addHttpRoutes(http);

export default http;