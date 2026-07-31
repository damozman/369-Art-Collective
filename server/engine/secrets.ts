/**
 * Sealing provider credentials at rest.
 *
 * WHY THIS EXISTS. `engine_source_connections` stores Shopify offline access
 * tokens and webhook signing secrets. An offline token is a standing grant to
 * read a merchant's entire order history, and it does not expire — so it
 * outlives any breach that exposes it. Database backups get copied to laptops,
 * shared with contractors, and restored into staging; a plaintext token column
 * turns every one of those into a credential leak with no expiry.
 *
 * The key lives in `ENGINE_SECRET_KEY` and is never written to the database, so
 * a stolen dump alone is not enough. This is not key management — a real KMS
 * with rotation and per-tenant keys is better and is the eventual answer — but
 * it is the difference between "a backup leaked" and "a backup leaked and every
 * merchant's store is readable".
 *
 * AES-256-GCM, not CBC or ECB: GCM authenticates the ciphertext, so a tampered
 * value fails to open rather than decrypting into garbage that gets sent to
 * Shopify as a token. A random 12-byte IV per seal means sealing the same token
 * twice produces different ciphertext, which stops anyone inferring that two
 * tenants share a credential.
 *
 * THE FORMAT IS VERSIONED. `v1.<iv>.<tag>.<ciphertext>`, all base64url. The
 * version prefix is what makes rotating the algorithm or the key possible
 * later without a flag day: `open()` dispatches on it, so old rows keep opening
 * while new rows are written in the new format.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsError";
  }
}

/**
 * Derive the 32-byte key from `ENGINE_SECRET_KEY`.
 *
 * Accepts either 64 hex characters (a real 256-bit key, which is what
 * `openssl rand -hex 32` gives and what production should use) or an arbitrary
 * passphrase, which is hashed to length. The passphrase path exists so local
 * development and tests are not blocked on key ceremony; it is deliberately
 * *not* a KDF with a work factor, because a low-entropy passphrase is not
 * rescued by stretching and pretending otherwise is worse than being explicit.
 */
function deriveKey(material: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    return Buffer.from(material, "hex");
  }
  return createHash("sha256").update(material, "utf8").digest();
}

let cachedKey: Buffer | null = null;
let cachedMaterial: string | null = null;

function getKey(): Buffer {
  const material = process.env.ENGINE_SECRET_KEY;

  if (!material) {
    throw new SecretsError(
      "ENGINE_SECRET_KEY is not set. Provider credentials cannot be sealed or opened " +
        "without it. Generate one with `openssl rand -hex 32` and put it in .env.local."
    );
  }

  // Re-derive when the environment changes, so a test can swap keys.
  if (cachedKey && cachedMaterial === material) return cachedKey;

  cachedKey = deriveKey(material);
  cachedMaterial = material;
  return cachedKey;
}

/** True when sealing is possible. Lets callers degrade honestly rather than throw. */
export function isSealingConfigured(): boolean {
  return Boolean(process.env.ENGINE_SECRET_KEY);
}

/** Encrypt a credential for storage. */
export function seal(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new SecretsError("Refusing to seal an empty value");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a stored credential.
 *
 * Throws on tampering, on the wrong key, and on a malformed value. All three
 * are the same answer operationally — the credential is unusable — and none of
 * them should be papered over with a fallback, because a fallback here means
 * calling Shopify with a wrong token and logging the response.
 */
export function open(sealed: string): string {
  if (typeof sealed !== "string" || sealed.length === 0) {
    throw new SecretsError("Refusing to open an empty value");
  }

  const parts = sealed.split(".");
  if (parts.length !== 4) {
    throw new SecretsError(
      `Malformed sealed value: expected 4 dot-separated parts, got ${parts.length}`
    );
  }

  const [version, ivB64, tagB64, ciphertextB64] = parts;
  if (version !== VERSION) {
    throw new SecretsError(
      `Unknown sealed-value version "${version}". This build understands ${VERSION}.`
    );
  }

  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== IV_BYTES) {
    throw new SecretsError(`Sealed value has a ${iv.length}-byte IV, expected ${IV_BYTES}`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new SecretsError(`Sealed value has a ${tag.length}-byte tag, expected ${TAG_BYTES}`);
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Deliberately does not echo the value or the key.
    throw new SecretsError(
      "Sealed value failed authentication. It was tampered with, or ENGINE_SECRET_KEY " +
        "differs from the key it was sealed with."
    );
  }
}

/** Open a nullable column without a null check at every call site. */
export function openOrNull(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  return open(sealed);
}

/**
 * Constant-time string comparison.
 *
 * Lives here rather than in the Shopify adapter because every provider that
 * signs a webhook needs it, and `a === b` on a signature leaks the length of
 * the matching prefix through timing. Lengths are compared first and in the
 * clear — signature lengths are fixed per algorithm and public anyway.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
