import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Endpoint to validate authentication tokens
http.route({
  path: "/auth/validate",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { token } = body;
    
    if (!token) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Here we would normally validate the JWT token
    // For now, we'll accept any token as valid for testing
    // In production, you'd verify the JWT signature and claims
    
    return new Response(JSON.stringify({ valid: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;