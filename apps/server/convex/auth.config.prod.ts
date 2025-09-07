// Production Convex Auth configuration that requires explicit envs.
// This file is used by tests and can be used for real deployments.

type CustomJwtProvider = {
  type: "customJwt";
  applicationID?: string | null;
  issuer: string;
  jwks: string;
  algorithm: "RS256" | string;
  audience?: string;
};

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

