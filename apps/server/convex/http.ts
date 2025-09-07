import { httpRouter } from "convex/server";
import { auth, signIn, signOut } from "./auth";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Add auth routes
auth.addHttpRoutes(http);

// Debug: password sign-in via HTTP to help test without WebSockets
http.route({
  path: "/e2e/password-signin",
  method: "POST",
  handler: httpAction(async ({ runAction }, request) => {
    try {
      const { email, password, flow } = await request.json();
      const result = await runAction(signIn, {
        provider: "password",
        params: { email, password, flow: flow || "signIn" },
      } as any);
      return new Response(JSON.stringify(result || {}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

http.route({
  path: "/e2e/signout",
  method: "POST",
  handler: httpAction(async ({ runAction }) => {
    try {
      const result = await runAction(signOut, {} as any);
      return new Response(JSON.stringify(result || {}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Who am I — return the identity seen by Convex for this HTTP request
http.route({
  path: "/e2e/whoami",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return new Response(JSON.stringify({ identity }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Run getChats via HTTP
http.route({
  path: "/e2e/get-chats",
  method: "GET",
  handler: httpAction(async ({ runQuery }) => {
    const chats = await runQuery(api.chats.getChats, {} as any);
    return new Response(JSON.stringify({ chats }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Create chat via HTTP
http.route({
  path: "/e2e/create-chat",
  method: "POST",
  handler: httpAction(async ({ runMutation }, request) => {
    const { title } = await request.json().catch(() => ({ title: "E2E Chat" }));
    try {
      const chatId = await runMutation(api.chats.createChat, { title } as any);
      return new Response(JSON.stringify({ chatId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
