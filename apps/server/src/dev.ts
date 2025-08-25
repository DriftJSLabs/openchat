#!/usr/bin/env bun

// Development server entry point
import app from "./index";

console.log("🚀 Starting OpenChat server on port 3000...");

Bun.serve({
  port: 3000,
  fetch: app.fetch,
  error(error) {
    console.error("Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

console.log("✅ OpenChat server running at http://localhost:3000");