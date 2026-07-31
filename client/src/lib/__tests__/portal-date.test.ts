/**
 * Portal date display.
 *
 * The test that matters is the timezone one: a UTC-early-morning timestamp must
 * render as its UTC day regardless of where the contributor is sitting. These
 * run with TZ forced to a negative offset so a locale-based implementation
 * would visibly fail here rather than only in production, in California.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDate, isoDate, startOfYearIso, todayIso } from "../portal-date";

test("formats an ISO timestamp as a readable UTC date", () => {
  assert.equal(formatDate("2026-06-15T12:00:00.000Z"), "15 Jun 2026");
  assert.equal(formatDate("2026-01-01T00:00:00.000Z"), "1 Jan 2026");
  assert.equal(formatDate("2026-12-31T23:59:59.000Z"), "31 Dec 2026");
});

test("does not shift the day for a viewer west of UTC", () => {
  // 02:00 UTC is the previous evening in Los Angeles. `new Date(...)` plus a
  // locale format would render "14 Jun 2026" and disagree with the emailed
  // statement, the server's text render, and the tenant's own records.
  const previousTz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(formatDate("2026-06-15T02:00:00.000Z"), "15 Jun 2026");
  } finally {
    process.env.TZ = previousTz;
  }
});

test("a plain date string works as well as a full timestamp", () => {
  assert.equal(formatDate("2026-06-15"), "15 Jun 2026");
});

test("missing or malformed dates degrade instead of printing Invalid Date", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(undefined), "—");
  assert.equal(formatDate(""), "—");
  assert.equal(formatDate("not-a-date"), "—");
});

test("isoDate extracts the date part only", () => {
  assert.equal(isoDate("2026-06-15T12:00:00.000Z"), "2026-06-15");
  assert.equal(isoDate("garbage"), null);
  assert.equal(isoDate(null), null);
});

test("range defaults are UTC-derived", () => {
  const when = new Date("2026-07-31T23:30:00.000Z");
  assert.equal(todayIso(when), "2026-07-31");
  assert.equal(startOfYearIso(when), "2026-01-01");
});
