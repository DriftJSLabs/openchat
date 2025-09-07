// Convex Auth configuration for verifying JWTs issued by @convex-dev/auth
// Configure a Custom JWT provider pointing to our own issuer + JWKS.

// Strict, env-driven configuration for JWT verification.

type CustomJwtProvider = {
  type: "customJwt";
  // Optional, helps tag the app in Convex dashboard
  applicationID?: string | null;
  issuer: string;
  jwks: string;
  algorithm: "RS256" | string;
};

// Use AUTH_ISSUER when set; fall back to CONVEX_SITE_URL for local dev.
// If neither is set, default to local dev URL to keep the backend
// bootable so we can configure env vars via `convex env set`.
const issuer =
  process.env.AUTH_ISSUER ||
  process.env.CONVEX_SITE_URL ||
  "http://127.0.0.1:3211";
// Local-dev safety net JWKS matching @convex-dev/auth's default dev key.
// This lets `convex dev` start even before JWKS is configured.
const DEFAULT_LOCAL_JWKS = '{"keys":[{"use":"sig","kty":"RSA","n":"xqFhdcXigRKsrcIoKCpqz0JbPBRXKw_7YUWeFKsBPvCbDLc-YebT_egdops7EYCXRw2kajkau9JegrzQoQwhFUlU_lJsapBCwQDLBCuLvFMFXqGnJG_dPK-R_YLsqhUK8pVxbLD_0_lH_YiyLxg6E4mgLKhSVd0YOISyy4yhW05AcB2l7ZONDgjxPD_rEwhfWQUPvkeEa0nfGXNmBdqL4dNfLkconIU4ury78lIkO3jbX9L7yF8C772I6wNxgXCbaDXo2suLJZjNvuNy4htMX8Ap3CTVnGvDrU_9l2oLVioiypoxvM1VxGdNQHSOsLjleun4Rku-3ze0izb9JPZdPQ","e":"AQAB"}]}'
  .replace(/\n/g, "");
const jwks = process.env.JWKS || DEFAULT_LOCAL_JWKS;

// In production, we still require explicit configuration.
if (process.env.NODE_ENV === "production") {
  if (!process.env.AUTH_ISSUER && !process.env.CONVEX_SITE_URL) {
    throw new Error(
      "Production: AUTH_ISSUER or CONVEX_SITE_URL must be set in Convex env",
    );
  }
  if (!process.env.JWKS) {
    throw new Error("Production: JWKS must be set in Convex env");
  }
}

const providers: CustomJwtProvider[] = [
  {
    type: "customJwt",
    applicationID: "convex",
    issuer,
    jwks,
    algorithm: "RS256",
    // @ts-ignore audience supported by Convex at runtime
    audience: "convex",
  } as any,
];

// Local dev quirk: some setups issue tokens with 3211 as issuer.
// Accept both 3210 and 3211 to avoid NoAuthProvider during dev.
try {
  const url = new URL(issuer);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    const alt = new URL(issuer);
    alt.port = alt.port === "3211" ? "3210" : "3211";
    providers.push({
      type: "customJwt",
      applicationID: "convex",
      issuer: alt.toString(),
      jwks,
      algorithm: "RS256",
      // @ts-ignore audience supported by Convex at runtime
      audience: "convex",
    } as any);
  }
} catch {}

// Debug log to verify which issuer/jwks are used at build/load time
// eslint-disable-next-line no-console
console.log("[auth.config] issuer:", issuer, "jwks.len:", (jwks || "").length, "providers:", providers.map(p => p.issuer));

const authConfig = { providers };

export default authConfig;
