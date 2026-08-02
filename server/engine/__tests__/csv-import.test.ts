/**
 * The CSV importer's pure half — the tokenizer and the mapper.
 *
 * These are the assertions that have to hold before a real statement is ever
 * pointed at this, because every one of them is a case where the tempting
 * behaviour produces a NUMBER rather than an error. A misparsed quote shifts a
 * title into an amount column; a sniffed date moves a sale into the wrong tax
 * year; a European decimal comma read as a thousands separator is a 100×
 * overpayment. None of those throw on their own.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  CsvConfigError,
  mapCsvDocument,
  parseCsvDate,
  parseCsvMoney,
  type CsvImportConfig,
} from "../adapters/csv/map";
import { CsvParseError, parseCsv } from "../adapters/csv/parse";

// ============================================================
// The tokenizer
// ============================================================

test("parseCsv reads a plain comma file", () => {
  const doc = parseCsv("title,amount\nBlue Hour,12.50\nRed Sky,8.00\n");

  assert.deepEqual(doc.headers, ["title", "amount"]);
  assert.equal(doc.rows.length, 2);
  assert.deepEqual(doc.rows[0].fields, ["Blue Hour", "12.50"]);
  assert.equal(doc.delimiter, ",");
});

test("parseCsv keeps a comma inside a quoted title", () => {
  // The failure this prevents: `split(",")` shifts every later column left by
  // one, so the amount column reads a date and the date column reads a title.
  const doc = parseCsv('title,amount\n"Blue Hour, Revisited",12.50\n');

  assert.deepEqual(doc.rows[0].fields, ["Blue Hour, Revisited", "12.50"]);
});

test("parseCsv handles doubled quotes and embedded newlines", () => {
  const doc = parseCsv('title,note\n"The ""Long"" Way","line one\nline two"\n');

  assert.deepEqual(doc.rows[0].fields, ['The "Long" Way', "line one\nline two"]);
});

test("parseCsv reports the original line number, not the row index", () => {
  // A quoted field spanning three lines makes these two numbers diverge, and
  // the one an owner can act on is the one their spreadsheet shows.
  const doc = parseCsv('title,note\n"a","x\ny\nz"\n"b","q"\n');

  assert.equal(doc.rows[0].line, 2);
  assert.equal(doc.rows[1].line, 5);
});

test("parseCsv strips the byte-order mark Excel writes", () => {
  const doc = parseCsv("﻿title,amount\nBlue Hour,12.50\n");

  // Unstripped, the first header is "﻿title" and the column the owner
  // definitely mapped is the one that fails to match.
  assert.deepEqual(doc.headers, ["title", "amount"]);
});

test("parseCsv handles CRLF and a missing trailing newline", () => {
  const doc = parseCsv("title,amount\r\nBlue Hour,12.50\r\nRed Sky,8.00");

  assert.equal(doc.rows.length, 2);
  assert.deepEqual(doc.rows[1].fields, ["Red Sky", "8.00"]);
});

test("parseCsv sniffs tab and semicolon delimiters", () => {
  assert.equal(parseCsv("title\tamount\nBlue Hour\t12.50\n").delimiter, "\t");
  assert.equal(parseCsv("title;amount\nBlue Hour;12,50\n").delimiter, ";");
});

test("parseCsv does not let a quoted comma sway the delimiter sniff", () => {
  const doc = parseCsv('"a,b";c\n"x,y";z\n');

  assert.equal(doc.delimiter, ";");
  assert.deepEqual(doc.headers, ["a,b", "c"]);
});

test("parseCsv reports ragged rows rather than padding them", () => {
  const doc = parseCsv("title,amount\nBlue Hour,12.50\nRed Sky\n");

  assert.equal(doc.rows.length, 1);
  assert.deepEqual(doc.ragged, [{ line: 3, fieldCount: 1 }]);
});

test("parseCsv keeps a row of empty fields but drops a trailing blank line", () => {
  const doc = parseCsv("a,b\n,\n\n");

  // ",," is a real row with missing values; a bare newline is a file ending.
  assert.equal(doc.rows.length, 1);
  assert.deepEqual(doc.rows[0].fields, ["", ""]);
});

test("parseCsv refuses an empty file and an unclosed quote", () => {
  assert.throws(() => parseCsv("   "), CsvParseError);
  assert.throws(() => parseCsv('a,b\n"unterminated,2\n'), CsvParseError);
});

// ============================================================
// Money — decision 3
// ============================================================

test("parseCsvMoney reads plain and symbol-prefixed amounts exactly", () => {
  assert.equal(parseCsvMoney("12.50"), 1250n);
  assert.equal(parseCsvMoney("$12.50"), 1250n);
  assert.equal(parseCsvMoney("USD 12.50"), 1250n);
  assert.equal(parseCsvMoney("12.50 USD"), 1250n);
  assert.equal(parseCsvMoney("  8  "), 800n);
  assert.equal(parseCsvMoney("0"), 0n);
});

test("parseCsvMoney reads thousands separators", () => {
  assert.equal(parseCsvMoney("1,234.56"), 123456n);
  assert.equal(parseCsvMoney("$1,234,567.89"), 123456789n);
});

test("parseCsvMoney treats parentheses as negative", () => {
  // Accounting exports write (12.34) for −12.34. Reading it as positive
  // inverts a refund line into a sale.
  assert.equal(parseCsvMoney("(12.34)"), -1234n);
  assert.equal(parseCsvMoney("($12.34)"), -1234n);
  assert.equal(parseCsvMoney("-12.34"), -1234n);
});

test("parseCsvMoney REFUSES an ambiguous comma rather than picking a reading", () => {
  // "1,23" is €1.23 in much of Europe and a badly written $123 elsewhere.
  // Guessing is a 100× error in whichever half of the world we guessed wrong.
  assert.throws(() => parseCsvMoney("1,23"), /ambiguous-comma/);
  assert.throws(() => parseCsvMoney("1.234,56"), /ambiguous-comma/);
  assert.throws(() => parseCsvMoney("12,3456"), /ambiguous-comma/);
});

test("parseCsvMoney refuses what it cannot read exactly", () => {
  assert.throws(() => parseCsvMoney(""), /empty/);
  assert.throws(() => parseCsvMoney("n/a"), /not-a-number/);
  assert.throws(() => parseCsvMoney("12.5.6"), /not-a-number/);
  assert.throws(() => parseCsvMoney("--5"), /not-a-number/);
});

test("parseCsvMoney never routes through a float", () => {
  // The reason the string path exists: parseFloat("1.005") * 100 is
  // 100.49999999999999, so the float path loses a cent unpredictably.
  assert.equal(parseCsvMoney("1.005"), 101n);
  assert.equal(parseCsvMoney("9007199254740993.01"), 900719925474099301n);
});

// ============================================================
// Dates — decision 2
// ============================================================

test("parseCsvDate reads the format it was given, at UTC midnight", () => {
  assert.equal(parseCsvDate("2026-03-04", "iso").toISOString(), "2026-03-04T00:00:00.000Z");
  assert.equal(parseCsvDate("03/04/2026", "mdy").toISOString(), "2026-03-04T00:00:00.000Z");
  assert.equal(parseCsvDate("04/03/2026", "dmy").toISOString(), "2026-03-04T00:00:00.000Z");
});

test("the SAME string reads as two different days under two formats", () => {
  // This is the whole reason the format is asked for rather than sniffed:
  // there is no evidence in the file that settles 01/02/2026.
  assert.equal(parseCsvDate("01/02/2026", "mdy").toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(parseCsvDate("01/02/2026", "dmy").toISOString(), "2026-02-01T00:00:00.000Z");
});

test("parseCsvDate accepts dot and dash separators, and a two-digit year", () => {
  assert.equal(parseCsvDate("4.3.2026", "dmy").toISOString(), "2026-03-04T00:00:00.000Z");
  assert.equal(parseCsvDate("3-4-26", "mdy").toISOString(), "2026-03-04T00:00:00.000Z");
});

test("parseCsvDate rejects a date that does not exist", () => {
  // Date.UTC rolls 31 February forward into March rather than refusing, which
  // at a year boundary lands the sale in the wrong tax year.
  assert.throws(() => parseCsvDate("2026-02-31", "iso"), /range/);
  assert.throws(() => parseCsvDate("13/01/2026", "mdy"), /range/);
});

test("parseCsvDate refuses a format it was not given", () => {
  assert.throws(() => parseCsvDate("03/04/2026", "iso"), /format/);
  assert.throws(() => parseCsvDate("2026-03-04", "mdy"), /format/);
  assert.throws(() => parseCsvDate("4 March 2026", "iso"), /format/);
});

test("parseCsvDate keeps the time on an ISO timestamp", () => {
  assert.equal(
    parseCsvDate("2026-03-04T14:30:00Z", "iso").toISOString(),
    "2026-03-04T14:30:00.000Z"
  );
});

// ============================================================
// Mapping
// ============================================================

const BASE_CONFIG: CsvImportConfig = {
  mapping: { amount: "amount", date: "date", work: "isrc" },
  dateFormat: "iso",
  currency: "USD",
  statementLabel: "july",
};

const config = (overrides: Partial<CsvImportConfig> = {}): CsvImportConfig => ({
  ...BASE_CONFIG,
  ...overrides,
  mapping: { ...BASE_CONFIG.mapping, ...(overrides.mapping ?? {}) },
});

test("mapCsvDocument produces canonical sale events", () => {
  const doc = parseCsv("isrc,date,amount\nTRK-1,2026-03-04,12.50\n");
  const result = mapCsvDocument(doc, config());

  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 1);

  const event = result.rows[0].event;
  assert.equal(event.source, "csv");
  assert.equal(event.direction, "sale");
  assert.equal(event.grossAmountMinor, 1250n);
  assert.equal(event.currency, "USD");
  assert.equal(event.quantity, 1);
  assert.equal(event.workRef, "TRK-1");
  assert.equal(event.occurredAt.toISOString(), "2026-03-04T00:00:00.000Z");
});

test("a negative row is an error, not a reversal — decision 4", () => {
  // The engine models a reversal as referencing the exact event it undoes, so
  // that a clawback follows the original's own rate and policy. A CSV row
  // carries no such reference; importing it would create ledger entries that
  // reverse nothing and can never be reconciled.
  const doc = parseCsv("isrc,date,amount\nTRK-1,2026-03-04,(4.00)\n");
  const result = mapCsvDocument(doc, config());

  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /negative/);
  assert.match(result.errors[0].message, /refund the original sale/);
});

test("one unreadable row does not stop the others", () => {
  const doc = parseCsv(
    "isrc,date,amount\nTRK-1,2026-03-04,12.50\nTRK-2,not-a-date,8.00\nTRK-3,2026-03-05,9.00\n"
  );
  const result = mapCsvDocument(doc, config());

  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 3);
});

test("a blank cost cell is not zero — decision 6", () => {
  const doc = parseCsv(
    "isrc,date,amount,fee\nTRK-1,2026-03-04,12.50,\nTRK-2,2026-03-05,12.50,0\n"
  );
  const result = mapCsvDocument(
    doc,
    config({ mapping: { ...BASE_CONFIG.mapping, costs: { processing_fee: "fee" } } })
  );

  // Blank means "this file does not say", so no cost row is written and the
  // tenant's margin reporting stays honest about what it does not know.
  assert.equal(result.rows[0].event.costs.length, 0);
  // An explicit 0 means "there was none" and is recorded as such.
  assert.equal(result.rows[1].event.costs.length, 1);
  assert.equal(result.rows[1].event.costs[0].amountMinor, 0n);
  assert.equal(result.rows[1].event.costs[0].type, "processing_fee");
});

test("costs are refused when the type is not on the closed list", () => {
  const doc = parseCsv("isrc,date,amount,fee\nTRK-1,2026-03-04,12.50,1.00\n");

  assert.throws(
    () =>
      mapCsvDocument(
        doc,
        config({
          mapping: {
            ...BASE_CONFIG.mapping,
            costs: { proccessing_fee: "fee" } as never,
          },
        })
      ),
    CsvConfigError
  );
});

test("a per-row share is carried as basis points", () => {
  const doc = parseCsv("isrc,writer,date,amount,share\nTRK-1,alice,2026-03-04,100.00,62.5\n");
  const result = mapCsvDocument(
    doc,
    config({ mapping: { ...BASE_CONFIG.mapping, contributor: "writer", share: "share" } })
  );

  assert.deepEqual(result.rows[0].event.contributorRefs, [
    { ref: "alice", role: undefined, shareBasisPoints: 6250 },
  ]);
});

test("a share outside 0-100 is refused", () => {
  const doc = parseCsv("isrc,writer,date,amount,share\nTRK-1,alice,2026-03-04,100.00,150\n");
  const result = mapCsvDocument(
    doc,
    config({ mapping: { ...BASE_CONFIG.mapping, contributor: "writer", share: "share" } })
  );

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /percentage between 0 and 100/);
});

test("a mapping naming a column the file lacks fails the import, not every row", () => {
  const doc = parseCsv("isrc,date,amount\nTRK-1,2026-03-04,12.50\n");

  // Reporting this once is the point: eight thousand copies of one mistake
  // buries it.
  assert.throws(
    () => mapCsvDocument(doc, config({ mapping: { ...BASE_CONFIG.mapping, amount: "total" } })),
    CsvConfigError
  );
});

test("a file with no attribution column at all is refused", () => {
  const doc = parseCsv("date,amount\n2026-03-04,12.50\n");

  assert.throws(
    () => mapCsvDocument(doc, config({ mapping: { amount: "amount", date: "date" } })),
    CsvConfigError
  );
});

// ============================================================
// Identity — decision 5, the part that decides who gets paid twice
// ============================================================

test("a reference column becomes the key verbatim", () => {
  const doc = parseCsv("ref,isrc,date,amount\nTX-99,TRK-1,2026-03-04,12.50\n");
  const result = mapCsvDocument(
    doc,
    config({ mapping: { ...BASE_CONFIG.mapping, reference: "ref" } })
  );

  assert.equal(result.rows[0].event.sourceEventId, "TX-99");
});

test("a blank reference is an error, never a fallback to hashing", () => {
  // Falling back for one row would give it a key that a later re-import (with
  // the reference filled in) would not reproduce — so it would be paid twice.
  const doc = parseCsv("ref,isrc,date,amount\n,TRK-1,2026-03-04,12.50\n");
  const result = mapCsvDocument(
    doc,
    config({ mapping: { ...BASE_CONFIG.mapping, reference: "ref" } })
  );

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].message, /reference column is blank/);
});

test("a repeated reference inside one file is an error, not a silent duplicate", () => {
  // The second row would collide on the unique index and be reported as
  // "already imported", which reads as reassurance rather than as the error
  // it is.
  const doc = parseCsv(
    "ref,isrc,date,amount\nTX-1,TRK-1,2026-03-04,12.50\nTX-1,TRK-2,2026-03-05,9.00\n"
  );
  const result = mapCsvDocument(
    doc,
    config({ mapping: { ...BASE_CONFIG.mapping, reference: "ref" } })
  );

  assert.equal(result.rows.length, 1);
  assert.match(result.errors[0].message, /also used on line 2/);
});

test("two genuinely identical rows both import, via the occurrence ordinal", () => {
  // A book that sold twice on the same day at the same price reports as two
  // identical lines. Collapsing them would silently halve someone's income.
  const doc = parseCsv(
    "isrc,date,amount\nTRK-1,2026-03-04,12.50\nTRK-1,2026-03-04,12.50\n"
  );
  const result = mapCsvDocument(doc, config());

  assert.equal(result.rows.length, 2);
  assert.notEqual(result.rows[0].event.sourceEventId, result.rows[1].event.sourceEventId);
  assert.match(result.rows[0].event.sourceEventId, /#1$/);
  assert.match(result.rows[1].event.sourceEventId, /#2$/);
});

test("re-reading the same file reproduces the same keys exactly", () => {
  // This is what makes a re-import a no-op: every key collides on the unique
  // index rather than paying a second time.
  const content = "isrc,date,amount\nTRK-1,2026-03-04,12.50\nTRK-1,2026-03-04,12.50\n";
  const first = mapCsvDocument(parseCsv(content), config());
  const second = mapCsvDocument(parseCsv(content), config());

  assert.deepEqual(
    first.rows.map((row) => row.event.sourceEventId),
    second.rows.map((row) => row.event.sourceEventId)
  );
});

test("keys survive re-quoting and whitespace, but not a changed fact", () => {
  // Identity comes from what the row MEANS, not from its bytes — so an export
  // with different quoting is still the same sale.
  const plain = mapCsvDocument(parseCsv("isrc,date,amount\nTRK-1,2026-03-04,12.50\n"), config());
  const quoted = mapCsvDocument(
    parseCsv('isrc,date,amount\n"TRK-1"," 2026-03-04 ","$12.50"\n'),
    config()
  );
  assert.equal(plain.rows[0].event.sourceEventId, quoted.rows[0].event.sourceEventId);

  const different = mapCsvDocument(
    parseCsv("isrc,date,amount\nTRK-1,2026-03-04,12.51\n"),
    config()
  );
  assert.notEqual(plain.rows[0].event.sourceEventId, different.rows[0].event.sourceEventId);
});

test("the statement label is part of the key when no reference column exists", () => {
  // ⚠️ The accepted weakness, pinned so nobody removes the warning that goes
  // with it: the same rows under a different statement name are NEW keys and
  // would pay twice. The preview's look-alike check is what catches it.
  const content = "isrc,date,amount\nTRK-1,2026-03-04,12.50\n";
  const july = mapCsvDocument(parseCsv(content), config({ statementLabel: "july" }));
  const august = mapCsvDocument(parseCsv(content), config({ statementLabel: "august" }));

  assert.notEqual(july.rows[0].event.sourceEventId, august.rows[0].event.sourceEventId);
});

test("the missing-reference warning is always raised", () => {
  const doc = parseCsv("isrc,date,amount\nTRK-1,2026-03-04,12.50\n");
  const result = mapCsvDocument(doc, config());

  assert.ok(
    result.warnings.some((warning) => /pay them a second time/.test(warning)),
    "an owner importing without a reference column must be told what that costs"
  );
});
