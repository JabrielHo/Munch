// Generates the RS256 keypair Convex Auth needs and writes them to .auth-keys/.
// Run once per deployment, then load into Convex env vars (see README).
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { mkdirSync, writeFileSync } from "node:fs";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const pkcs8 = await exportPKCS8(privateKey);
const jwk = await exportJWK(publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...jwk }] });

// Convex Auth stores the private key as a SINGLE line with newlines replaced by
// spaces (jose's PEM parser tolerates the spaces, and it survives env-var
// round-trips that mangle multiline values). This matches the official CLI.
const privateKeyOneLine = pkcs8.trimEnd().replace(/\n/g, " ");

mkdirSync(".auth-keys", { recursive: true });
writeFileSync(".auth-keys/jwt_private_key.txt", privateKeyOneLine);
writeFileSync(".auth-keys/jwks.json", jwks);
console.log("Wrote .auth-keys/jwt_private_key.txt and .auth-keys/jwks.json");
