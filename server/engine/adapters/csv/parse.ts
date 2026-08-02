/**
 * A CSV tokenizer, written rather than imported.
 *
 * WHY NOT A LIBRARY. The whole value of this adapter is that a statement file
 * turns into money owed to a named person, and the tokenizer is the first place
 * that can go wrong silently. A dependency here would be one whose quoting and
 * newline behaviour we would have to characterise with tests anyway, so the
 * tests would exist either way and the code they pin would be someone else's.
 * This file is ~150 lines, has no configuration surface beyond the delimiter,
 * and every behaviour it has is argued below.
 *
 * WHAT IT HANDLES, and why each one is here rather than "later":
 *
 * - **Quoted fields** with embedded delimiters, newlines and doubled quotes
 *   (RFC 4180). Book and music statements routinely carry titles with commas in
 *   them; a naive `split(",")` shifts every subsequent column by one, which
 *   turns a title into an amount and an amount into a date. That misparse does
 *   not throw — it produces a number — which is exactly the class of failure
 *   this system exists to remove.
 * - **A byte-order mark.** Excel writes one on "CSV UTF-8" export. Unstripped,
 *   the first header becomes "﻿title" and the tenant's column mapping
 *   silently fails to match the one column they definitely mapped.
 * - **CRLF, LF and CR** line endings, including inside quoted fields.
 * - **Tab and semicolon delimiters**, sniffed from the header line. A
 *   semicolon-delimited export (the default in much of Europe) otherwise parses
 *   as a single column and reports "no columns found", which reads as a
 *   corrupted file rather than a settings mismatch.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not skip blank lines in the middle
 * of a file, coerce types, trim quoted values, or attempt to repair a row with
 * the wrong number of fields. Every one of those is a guess, and a guess about
 * a statement row is a guess about somebody's income. Ragged rows are reported
 * with their line number and handled a layer up, where the owner sees them.
 */

/** The delimiters worth sniffing. Comma first: it wins ties. */
const CANDIDATE_DELIMITERS = [",", "\t", ";"] as const;

export type CsvDelimiter = (typeof CANDIDATE_DELIMITERS)[number];

export interface CsvRow {
  /**
   * 1-based line number in the ORIGINAL file, counting the header.
   *
   * Not the row's index in this array. A quoted field containing three newlines
   * makes those two numbers diverge, and the one an owner can act on is the one
   * their spreadsheet shows.
   */
  line: number;
  fields: string[];
}

export interface CsvDocument {
  headers: string[];
  rows: CsvRow[];
  delimiter: CsvDelimiter;
  /** Rows whose field count did not match the header. Never silently padded. */
  ragged: Array<{ line: number; fieldCount: number }>;
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/**
 * Guess the delimiter from the first line.
 *
 * Counts only delimiters OUTSIDE quotes, because a comma inside a quoted title
 * is not evidence of a comma-delimited file. Ties go to the earliest candidate,
 * which is the comma — the overwhelmingly common case, and the one a person
 * means when they say "CSV".
 */
function sniffDelimiter(text: string): CsvDelimiter {
  let best: CsvDelimiter = ",";
  let bestCount = 0;

  for (const candidate of CANDIDATE_DELIMITERS) {
    let count = 0;
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && (char === "\n" || char === "\r")) {
        break;
      } else if (!inQuotes && char === candidate) {
        count++;
      }
    }

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Tokenize a whole document.
 *
 * A single pass, character by character, tracking whether we are inside a
 * quoted field. The state machine is small enough to read in one sitting, which
 * matters more here than terseness.
 */
export function parseCsv(input: string, options: { delimiter?: CsvDelimiter } = {}): CsvDocument {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  if (text.trim() === "") {
    throw new CsvParseError("The file is empty.");
  }

  const delimiter = options.delimiter ?? sniffDelimiter(text);

  const records: CsvRow[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let sawAnything = false;

  const endField = () => {
    fields.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    // A line that is entirely empty is a trailing newline, not a record. Only
    // this exact shape is dropped — a row of empty *fields* (",,,") is a real
    // row with missing values and is reported as such rather than vanishing.
    if (!(fields.length === 1 && fields[0] === "")) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    recordLine = line + 1;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    sawAnything = true;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      endField();
      continue;
    }

    if (char === "\r") {
      // Consume CRLF as one terminator; a lone CR is still a terminator.
      if (text[i + 1] === "\n") i++;
      endRecord();
      line++;
      continue;
    }

    if (char === "\n") {
      endRecord();
      line++;
      continue;
    }

    field += char;
  }

  if (sawAnything && (field !== "" || fields.length > 0)) {
    endRecord();
  }

  if (inQuotes) {
    throw new CsvParseError(
      "The file ends inside a quoted value — a quotation mark is probably unclosed."
    );
  }

  const header = records.shift();
  if (!header) {
    throw new CsvParseError("The file has no rows.");
  }

  // Headers are trimmed because a trailing space in a column name is invisible
  // in every tool an owner uses to look at the file, and would make a mapping
  // they can see on screen fail to match.
  const headers = header.fields.map((name) => name.trim());

  if (headers.every((name) => name === "")) {
    throw new CsvParseError("The first row has no column names.");
  }

  const ragged: CsvDocument["ragged"] = [];
  const rows: CsvRow[] = [];

  for (const record of records) {
    if (record.fields.length !== headers.length) {
      ragged.push({ line: record.line, fieldCount: record.fields.length });
      continue;
    }
    rows.push(record);
  }

  return { headers, rows, delimiter, ragged };
}
