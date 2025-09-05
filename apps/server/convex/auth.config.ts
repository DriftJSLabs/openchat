// Convex Auth configuration for verifying JWTs issued by @convex-dev/auth
// Configure a Custom JWT provider pointing to our own issuer + JWKS.

type CustomJwtProvider = {
  type: "customJwt";
  // Optional, helps tag the app in Convex dashboard
  applicationID?: string | null;
  issuer: string;
  jwks: string;
  algorithm: "RS256" | string;
};

// Prefer a custom issuer env var to avoid conflicts with Convex's built-in
// `CONVEX_SITE_URL` which is read-only on self-hosted/cloud deployments.
// This lets us use a different issuer domain (e.g. dash.ochat.pro) than the
// deployment URL (e.g. api.ochat.pro).
const issuer = process.env.AUTH_ISSUER || process.env.CONVEX_SITE_URL;
const jwks = process.env.JWKS;

if (!issuer) {
  throw new Error("Environment variable AUTH_ISSUER (or CONVEX_SITE_URL) is required for auth.config");
}
if (!jwks) {
  throw new Error("Environment variable JWKS is required for auth.config");
}

const authConfig = {
  providers: [
    {
      type: "customJwt",
      applicationID: "convex",
      issuer,
      jwks,
      algorithm: "RS256",
      audience: "convex",
    } as CustomJwtProvider,
  ],
};

export default authConfig;
