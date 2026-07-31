import test from "node:test";
import assert from "node:assert/strict";

import bcrypt from "bcryptjs";

import {
  assertCanReadContributor,
  AuthError,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  validatePassword,
  type ContributorSession,
} from "../auth";

const session: ContributorSession = {
  contributorId: "c-alice",
  tenantId: "t-369",
  name: "Alice",
  email: "alice@example.com",
};

test("passwords below the minimum length are refused", () => {
  assert.throws(() => validatePassword("short"), AuthError);
  assert.throws(() => validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1)), /at least/);
  assert.doesNotThrow(() => validatePassword("a".repeat(MIN_PASSWORD_LENGTH)));
});

test("hashing produces a verifiable bcrypt hash, not the password", async () => {
  const hash = await hashPassword("correct horse battery");
  assert.notEqual(hash, "correct horse battery");
  assert.match(hash, /^\$2[aby]\$/);
  assert.equal(await bcrypt.compare("correct horse battery", hash), true);
  assert.equal(await bcrypt.compare("wrong", hash), false);
});

test("hashing the same password twice gives different hashes", async () => {
  // Distinct salts. Identical hashes would let anyone spot two contributors
  // sharing a password just by looking at the table.
  const a = await hashPassword("correct horse battery");
  const b = await hashPassword("correct horse battery");
  assert.notEqual(a, b);
});

test("hashing refuses a password that fails the policy", async () => {
  await assert.rejects(() => hashPassword("short"), AuthError);
});

test("a contributor may read their own earnings", () => {
  assert.doesNotThrow(() => assertCanReadContributor(session, "t-369", "c-alice"));
});

test("a contributor may not read another contributor in the same tenant", () => {
  assert.throws(() => assertCanReadContributor(session, "t-369", "c-bob"), /only read their own/);
});

test("a contributor may not read across tenants", () => {
  // Checked before the contributor check, so a cross-tenant probe never even
  // reveals whether that contributor id exists.
  assert.throws(
    () => assertCanReadContributor(session, "t-press", "c-alice"),
    /Cross-tenant access denied/
  );
});

test("cross-tenant is refused even when the contributor id matches", () => {
  assert.throws(() => assertCanReadContributor(session, "t-other", "c-alice"), AuthError);
});
