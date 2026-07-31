import test from "node:test";
import assert from "node:assert/strict";

import { open, safeEqual, seal, SecretsError } from "../secrets";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function withKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env.ENGINE_SECRET_KEY;
  if (key === undefined) delete process.env.ENGINE_SECRET_KEY;
  else process.env.ENGINE_SECRET_KEY = key;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.ENGINE_SECRET_KEY;
    else process.env.ENGINE_SECRET_KEY = previous;
  }
}

test("a sealed credential opens back to exactly what went in", () => {
  withKey(KEY, () => {
    const token = "shpat_0123456789abcdef0123456789abcdef";
    assert.equal(open(seal(token)), token);
  });
});

test("sealing the same value twice produces different ciphertext", () => {
  // A fresh IV per seal. Without it, two tenants sharing a credential would be
  // visible in the database as two identical rows.
  withKey(KEY, () => {
    const a = seal("same-token");
    const b = seal("same-token");
    assert.notEqual(a, b);
    assert.equal(open(a), open(b));
  });
});

test("tampering with the ciphertext fails to open rather than returning garbage", () => {
  withKey(KEY, () => {
    const sealed = seal("shpat_real_token");
    const parts = sealed.split(".");
    // Flip a byte of the ciphertext.
    const bytes = Buffer.from(parts[3], "base64url");
    bytes[0] ^= 0xff;
    parts[3] = bytes.toString("base64url");

    assert.throws(() => open(parts.join(".")), SecretsError);
  });
});

test("a value sealed with one key does not open with another", () => {
  const sealed = withKey(KEY, () => seal("shpat_real_token"));
  const otherKey = "f".repeat(64);
  withKey(otherKey, () => {
    assert.throws(() => open(sealed), SecretsError);
  });
});

test("the error on a wrong key does not echo the value or the key", () => {
  const sealed = withKey(KEY, () => seal("shpat_super_secret_value"));
  withKey("f".repeat(64), () => {
    try {
      open(sealed);
      assert.fail("expected a throw");
    } catch (error) {
      const message = (error as Error).message;
      assert.ok(!message.includes("super_secret"), "must not echo the plaintext");
      assert.ok(!message.includes("ffff"), "must not echo the key");
    }
  });
});

test("sealing without a key is an error, not a silent passthrough", () => {
  withKey(undefined, () => {
    assert.throws(() => seal("token"), SecretsError);
  });
});

test("a passphrase key works, so local development is not blocked", () => {
  withKey("a local development passphrase", () => {
    assert.equal(open(seal("token")), "token");
  });
});

test("a malformed sealed value is rejected by shape before any crypto", () => {
  withKey(KEY, () => {
    assert.throws(() => open("not-sealed"), SecretsError);
    assert.throws(() => open("v1.a.b"), SecretsError);
    assert.throws(() => open("v2.a.b.c"), SecretsError);
  });
});

test("an empty value is refused rather than sealed", () => {
  withKey(KEY, () => {
    assert.throws(() => seal(""), SecretsError);
    assert.throws(() => open(""), SecretsError);
  });
});

test("safeEqual matches on equality and rejects different lengths", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});
