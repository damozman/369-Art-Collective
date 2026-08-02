/**
 * Token handling and the reset email. No database.
 *
 * The five security rules that depend on stored rows — hashed at rest, single
 * use, expiry, killing sibling links, and tenant scoping — are proved in
 * `e2e.ts` against real Postgres.
 *
 * What is proved here is the token itself, and the one sentence in the email
 * that matters most.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  RESET_TTL_MINUTES,
  hashToken,
  mintToken,
  safeTokenEqual,
} from "../password-reset";
import { passwordResetEmail } from "../email/templates";

// ============================================================
// The token
// ============================================================

test("tokens are long enough to be unguessable", () => {
  const token = mintToken();
  // 32 random bytes, base64url — 43 characters, 256 bits of entropy.
  assert.ok(token.length >= 43, `token was only ${token.length} characters`);
});

test("tokens are URL-safe, because they travel in a link", () => {
  for (let i = 0; i < 50; i++) {
    // base64url must never emit +, / or = — all three break or get mangled in
    // a query string, and a mangled token is an unusable reset link.
    assert.doesNotMatch(mintToken(), /[+/=]/);
  }
});

test("tokens do not repeat", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(mintToken());
  assert.equal(seen.size, 500);
});

/**
 * ⚠️ RULE 1, at the level this file can prove it: the stored form must not
 * contain the token. A database backup must not be a set of live
 * account-takeover links.
 */
test("the hash does not contain the token", () => {
  const token = mintToken();
  const hash = hashToken(token);

  assert.notEqual(hash, token);
  assert.ok(!hash.includes(token));
  assert.equal(hash.length, 64, "sha-256 hex");
});

test("hashing is deterministic, or lookups would never match", () => {
  const token = mintToken();
  assert.equal(hashToken(token), hashToken(token));
});

test("different tokens hash differently", () => {
  assert.notEqual(hashToken(mintToken()), hashToken(mintToken()));
});

test("comparison is length-safe and correct", () => {
  const a = mintToken();
  assert.equal(safeTokenEqual(a, a), true);
  assert.equal(safeTokenEqual(a, mintToken()), false);
  // Different lengths must return false rather than throwing — `timingSafeEqual`
  // throws on mismatched buffers, which would turn a bad token into a 500.
  assert.equal(safeTokenEqual(a, "short"), false);
});

test("the expiry window is an hour", () => {
  assert.equal(RESET_TTL_MINUTES, 60);
});

// ============================================================
// The email
// ============================================================

/**
 * ⚠️ THE LINE THIS TEST PROTECTS. This email is what somebody receives when an
 * attacker types their address into the form. "Ignore it, nothing has changed"
 * is both true and the only useful instruction — and its absence turns a
 * non-event into a panic.
 */
test("the reset email tells someone what to do if they did not ask", () => {
  const email = passwordResetEmail({
    name: "Alice",
    tenantName: "Harbour Press",
    resetUrl: "https://app.example/portal/harbour/reset?token=abc",
    expiresInMinutes: 60,
  });

  assert.match(email.text, /[Ii]f it was not you/);
  assert.match(email.text, /[Nn]othing has changed/);
});

test("the reset email names the business", () => {
  // A contributor may work with several. An unattributed "reset your password"
  // is indistinguishable from phishing.
  const email = passwordResetEmail({
    name: "Alice",
    tenantName: "Harbour Press",
    resetUrl: "https://app.example/x",
    expiresInMinutes: 60,
  });

  assert.match(email.subject, /Harbour Press/);
});

test("the reset email says the link is single-use and time-limited", () => {
  const email = passwordResetEmail({
    name: "Alice",
    tenantName: "Harbour Press",
    resetUrl: "https://app.example/x",
    expiresInMinutes: 60,
  });

  assert.match(email.text, /once/);
  assert.match(email.text, /60 minutes/);
});

test("the reset link survives HTML escaping intact", () => {
  // A token containing characters the escaper touches would arrive broken.
  const url = "https://app.example/portal/h/reset?token=aB3-_xyz";
  const email = passwordResetEmail({
    name: "Alice",
    tenantName: "Harbour Press",
    resetUrl: url,
    expiresInMinutes: 60,
  });

  assert.ok(email.text.includes(url));
  assert.ok(email.html.includes(url));
});
