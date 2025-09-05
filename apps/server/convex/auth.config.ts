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

const issuer = process.env.CONVEX_SITE_URL;
const jwks = process.env.JWKS;

if (!issuer) {
  throw new Error("Environment variable CONVEX_SITE_URL is required for auth.config");
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
    } as CustomJwtProvider,
  ],
};

export default authConfig;

