/**
 * Importing a statement — the screen that turns a spreadsheet into money owed.
 *
 * ⚠️ THIS IS THE MOST DANGEROUS SCREEN IN THE CONSOLE, and the layout is built
 * around that rather than around looking tidy. Every other way revenue enters
 * this system is a webhook: the sale already happened and arrives whether
 * anyone is watching or not. Here a person points at a file and a thousand
 * rows become somebody's income — from a file they may have edited, exported
 * with the wrong settings, or already imported last week. The ledger is
 * append-only, so undoing a wrong import is a reversal per row, by hand.
 *
 * FOUR THINGS THE DESIGN IS DOING ON PURPOSE:
 *
 * 1. **You cannot reach the import button without seeing the preview.** The
 *    steps are ordered, and the last one restates the counts and the total
 *    immediately above the button. A single "import" button next to a file
 *    picker would be one mis-click away from the thing that cannot be undone.
 *
 * 2. **The warnings are above the fold and are not dismissible.** The missing
 *    reference column, the look-alike rows, the unknown names — all of them
 *    are things an owner is likely to be wrong about and unlikely to go
 *    looking for. The one that matters most is the look-alike count, because
 *    it is the only signal that catches importing the same statement twice
 *    under two different names.
 *
 * 3. **Rows that will be HELD are shown as an outcome, not an error.** Held is
 *    a normal, recoverable state — the sale is recorded, nothing is allocated,
 *    and it lands in the review queue. Presenting it as a failure would push
 *    an owner into "fixing" the file rather than importing it and resolving
 *    the names afterwards, which is the workflow the engine is built for.
 *
 * 4. **Money is never a number.** Amounts arrive as minor-unit strings and go
 *    through `formatMoney`, never `Number()`, exactly as in the portal.
 *
 * Vocabulary note (ratified decision #11): *work*, *person*, *statement*. Never
 * artist, artwork or track — the same screen has to serve a label, a press and
 * a print shop, and the vocabulary is where that leaks first.
 */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Info, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  commitCsv,
  inspectCsv,
  previewCsv,
  type CsvDateFormat,
  type CsvImportConfig,
  type CsvImportResult,
  type CsvInspection,
  type CsvPreview,
} from "@/lib/admin-api";
import { formatDate } from "@/lib/portal-date";
import { formatMoney } from "@/lib/portal-money";

/** Sentinel for "no column chosen". An empty string is not a legal Select value. */
const NONE = "__none__";

const DATE_FORMATS: Array<{ value: CsvDateFormat; label: string }> = [
  { value: "iso", label: "2026-03-04  (year first)" },
  { value: "mdy", label: "03/04/2026  (month first)" },
  { value: "dmy", label: "04/03/2026  (day first)" },
];

const COST_COLUMNS = [
  { key: "production", label: "Production cost" },
  { key: "shipping", label: "Shipping cost" },
  { key: "processing_fee", label: "Payment fee" },
] as const;

interface MappingState {
  amount: string;
  date: string;
  work: string;
  contributor: string;
  reference: string;
  quantity: string;
  currency: string;
  share: string;
  role: string;
  description: string;
  production: string;
  shipping: string;
  processing_fee: string;
}

const EMPTY_MAPPING: MappingState = {
  amount: NONE,
  date: NONE,
  work: NONE,
  contributor: NONE,
  reference: NONE,
  quantity: NONE,
  currency: NONE,
  share: NONE,
  role: NONE,
  description: NONE,
  production: NONE,
  shipping: NONE,
  processing_fee: NONE,
};

/**
 * Offer a column whose name looks like the field, as a starting point only.
 *
 * Deliberately conservative — it matches obvious names and leaves everything
 * else unchosen. A guess that is *usually* right is worse than no guess here,
 * because a mapping the owner did not read is exactly how the wrong column
 * becomes the amount. Nothing is ever auto-selected for the date FORMAT, which
 * is the one the file itself cannot settle.
 */
function guessColumn(headers: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const found = headers.find((header) => pattern.test(header.trim()));
    if (found) return found;
  }
  return NONE;
}

function guessMapping(headers: string[]): MappingState {
  return {
    ...EMPTY_MAPPING,
    amount: guessColumn(headers, [/^(net|gross)?\s*(amount|revenue|earnings|royalty|total)$/i]),
    date: guessColumn(headers, [/^(sale|transaction|order|report(ed)?)?\s*date$/i]),
    work: guessColumn(headers, [/^(work|title|isrc|isbn|sku|product|item)(\s*(id|ref|code))?$/i]),
    contributor: guessColumn(headers, [/^(contributor|person|payee|writer|creator)$/i]),
    reference: guessColumn(headers, [
      /^(ref|reference|transaction\s*id|txn\s*id|order\s*id|line\s*id)$/i,
    ]),
    quantity: guessColumn(headers, [/^(quantity|qty|units|copies)$/i]),
    currency: guessColumn(headers, [/^currency$/i]),
  };
}

function toConfig(
  mapping: MappingState,
  dateFormat: CsvDateFormat,
  currency: string,
  statementLabel: string
): CsvImportConfig {
  const pick = (value: string) => (value === NONE ? undefined : value);
  const costs: CsvImportConfig["mapping"]["costs"] = {};
  for (const cost of COST_COLUMNS) {
    const column = pick(mapping[cost.key]);
    if (column) costs[cost.key] = column;
  }

  return {
    mapping: {
      amount: pick(mapping.amount) ?? "",
      date: pick(mapping.date) ?? "",
      work: pick(mapping.work),
      contributor: pick(mapping.contributor),
      reference: pick(mapping.reference),
      quantity: pick(mapping.quantity),
      currency: pick(mapping.currency),
      share: pick(mapping.share),
      role: pick(mapping.role),
      description: pick(mapping.description),
      costs,
    },
    dateFormat,
    currency,
    statementLabel,
  };
}

export function ImportTab({
  slug,
  currency,
  canWrite,
}: {
  slug: string;
  currency: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [inspection, setInspection] = useState<CsvInspection | null>(null);
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING);
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>("iso");
  const [statementLabel, setStatementLabel] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * ⚠️ ANY CHANGE TO THE MAPPING THROWS THE PREVIEW AWAY, and this is the most
   * important behaviour on the screen.
   *
   * The preview is computed from the configuration as it stood when the button
   * was pressed; the import reads the configuration as it stands NOW. Leaving a
   * stale preview on screen therefore lets an owner read "2 rows, $1,384.56",
   * change which column is the amount, and press Import — importing something
   * other than the thing they approved, with the approval still visible above
   * the button. Every setter below goes through this for that reason.
   */
  const invalidatePreview = () => {
    setPreview(null);
    setResult(null);
  };

  const changeMapping = (next: MappingState) => {
    setMapping(next);
    invalidatePreview();
  };

  const changeDateFormat = (next: CsvDateFormat) => {
    setDateFormat(next);
    invalidatePreview();
  };

  const changeStatementLabel = (next: string) => {
    setStatementLabel(next);
    invalidatePreview();
  };

  /** Clear everything the current file produced. */
  const clearFileState = () => {
    setContent(null);
    setFilename("");
    setInspection(null);
    setMapping(EMPTY_MAPPING);
    setStatementLabel("");
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const reset = () => {
    clearFileState();
    if (fileInput.current) fileInput.current.value = "";
  };

  const inspectMutation = useMutation({
    mutationFn: (text: string) => inspectCsv(slug, text),
    onSuccess: (data) => {
      setInspection(data);
      setMapping(guessMapping(data.headers));
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewCsv(
        slug,
        content ?? "",
        toConfig(mapping, dateFormat, currency, statementLabel.trim())
      ),
    onSuccess: (data) => {
      setPreview(data);
      setError(null);
    },
    onError: (err: Error) => {
      setPreview(null);
      setError(err.message);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitCsv(
        slug,
        content ?? "",
        toConfig(mapping, dateFormat, currency, statementLabel.trim())
      ),
    onSuccess: (data) => {
      setResult(data);
      setPreview(null);
      setError(null);
      // Everything downstream of the ledger has just changed.
      queryClient.invalidateQueries({ queryKey: ["admin-overview", slug] });
      queryClient.invalidateQueries({ queryKey: ["admin-review", slug] });
      queryClient.invalidateQueries({ queryKey: ["admin-contributors", slug] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    // Deliberately NOT `reset()` — that clears the file input itself, which
    // leaves the browser showing "No file chosen" beside a fully populated
    // mapping form. The owner reads that as the upload having failed.
    clearFileState();
    const text = await file.text();
    setContent(text);
    setFilename(file.name);
    // The filename is the default statement name because it is what the owner
    // will re-use if they import the file again — and re-using it is what makes
    // the second import a no-op rather than a second payment.
    setStatementLabel(file.name.replace(/\.[^.]+$/, ""));
    inspectMutation.mutate(text);
  };

  const ready =
    inspection !== null &&
    mapping.amount !== NONE &&
    mapping.date !== NONE &&
    (mapping.work !== NONE || mapping.contributor !== NONE) &&
    statementLabel.trim() !== "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Import a statement</CardTitle>
          <CardDescription>
            Turn a spreadsheet of sales into earnings. Nothing is recorded until you have seen
            what it would do.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              className="max-w-sm"
              disabled={!canWrite}
              onChange={(event) => onFile(event.target.files?.[0])}
              data-testid="input-import-file"
            />
            {filename && (
              <Button variant="ghost" size="sm" onClick={reset} data-testid="button-import-reset">
                Start over
              </Button>
            )}
            {inspectMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {!canWrite && (
            <p className="text-sm text-muted-foreground">
              You have read-only access, so you can't import.
            </p>
          )}

          {error && (
            <Alert variant="destructive" data-testid="alert-import-error">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>That didn't work</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {inspection && (
            <p className="text-sm text-muted-foreground" data-testid="text-import-summary">
              {inspection.rowCount} row{inspection.rowCount === 1 ? "" : "s"},{" "}
              {inspection.headers.length} columns
              {inspection.raggedCount > 0 && (
                <>
                  {" "}
                  — {inspection.raggedCount} row
                  {inspection.raggedCount === 1 ? "" : "s"} had the wrong number of columns and
                  will be skipped
                </>
              )}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {inspection && (
        <MappingCard
          headers={inspection.headers}
          sample={inspection.sample}
          mapping={mapping}
          setMapping={changeMapping}
          dateFormat={dateFormat}
          setDateFormat={changeDateFormat}
          statementLabel={statementLabel}
          setStatementLabel={changeStatementLabel}
          currency={currency}
          disabled={!canWrite}
        />
      )}

      {inspection && (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => previewMutation.mutate()}
            disabled={!ready || !canWrite || previewMutation.isPending}
            data-testid="button-import-preview"
          >
            {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check what this would do
          </Button>
          {!ready && (
            <span className="text-sm text-muted-foreground">
              Choose the amount, the date, a name for the statement, and either a work or a
              person.
            </span>
          )}
        </div>
      )}

      {preview && (
        <PreviewCard
          preview={preview}
          onImport={() => commitMutation.mutate()}
          importing={commitMutation.isPending}
          canWrite={canWrite}
        />
      )}

      {result && <ResultCard result={result} onDone={reset} />}
    </div>
  );
}

// ============================================================
// Mapping
// ============================================================

function ColumnPicker({
  label,
  hint,
  value,
  onChange,
  headers,
  disabled,
  testId,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  headers: string[];
  disabled: boolean;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder="Not used" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not used</SelectItem>
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MappingCard({
  headers,
  sample,
  mapping,
  setMapping,
  dateFormat,
  setDateFormat,
  statementLabel,
  setStatementLabel,
  currency,
  disabled,
}: {
  headers: string[];
  sample: string[][];
  mapping: MappingState;
  setMapping: (next: MappingState) => void;
  dateFormat: CsvDateFormat;
  setDateFormat: (next: CsvDateFormat) => void;
  statementLabel: string;
  setStatementLabel: (next: string) => void;
  currency: string;
  disabled: boolean;
}) {
  const set = (key: keyof MappingState) => (value: string) =>
    setMapping({ ...mapping, [key]: value });

  const usable = headers.filter((header) => header !== "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>What's in each column</CardTitle>
        <CardDescription>
          Only the amount, the date, and either a work or a person are needed. Everything else
          is optional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ColumnPicker
            label="Amount"
            hint="What the sale was worth, before your costs."
            value={mapping.amount}
            onChange={set("amount")}
            headers={usable}
            disabled={disabled}
            testId="select-map-amount"
          />
          <ColumnPicker
            label="Date"
            hint="When the sale happened."
            value={mapping.date}
            onChange={set("date")}
            headers={usable}
            disabled={disabled}
            testId="select-map-date"
          />
          <div className="space-y-1.5">
            <Label className="text-sm">How the dates are written</Label>
            <Select
              value={dateFormat}
              onValueChange={(value) => setDateFormat(value as CsvDateFormat)}
              disabled={disabled}
            >
              <SelectTrigger data-testid="select-map-dateformat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The one thing the file genuinely cannot tell us. 01/02/2026 is
                two different days and there is no evidence in the file that
                settles it, so it is asked rather than sniffed. */}
            <p className="text-xs text-muted-foreground">
              Check this against the file. 01/02/2026 means two different days depending on the
              answer.
            </p>
          </div>

          <ColumnPicker
            label="Work"
            hint="Matched against the reference on your works."
            value={mapping.work}
            onChange={set("work")}
            headers={usable}
            disabled={disabled}
            testId="select-map-work"
          />
          <ColumnPicker
            label="Person"
            hint="Use when the file already says who earned it."
            value={mapping.contributor}
            onChange={set("contributor")}
            headers={usable}
            disabled={disabled}
            testId="select-map-contributor"
          />
          <ColumnPicker
            label="Reference"
            hint="The file's own transaction id, if it has one. Strongly recommended."
            value={mapping.reference}
            onChange={set("reference")}
            headers={usable}
            disabled={disabled}
            testId="select-map-reference"
          />

          <ColumnPicker
            label="Quantity"
            value={mapping.quantity}
            onChange={set("quantity")}
            headers={usable}
            disabled={disabled}
            testId="select-map-quantity"
          />
          <ColumnPicker
            label="Currency"
            hint={`Defaults to ${currency} when not set.`}
            value={mapping.currency}
            onChange={set("currency")}
            headers={usable}
            disabled={disabled}
            testId="select-map-currency"
          />
          <ColumnPicker
            label="Share"
            hint="A percentage, so 50 means half. Only used with a person column."
            value={mapping.share}
            onChange={set("share")}
            headers={usable}
            disabled={disabled}
            testId="select-map-share"
          />

          <ColumnPicker
            label="Role"
            value={mapping.role}
            onChange={set("role")}
            headers={usable}
            disabled={disabled}
            testId="select-map-role"
          />
          <ColumnPicker
            label="Description"
            hint="Kept with the sale so the row stays recognisable."
            value={mapping.description}
            onChange={set("description")}
            headers={usable}
            disabled={disabled}
            testId="select-map-description"
          />
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">Costs, if the file lists them</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {COST_COLUMNS.map((cost) => (
              <ColumnPicker
                key={cost.key}
                label={cost.label}
                value={mapping[cost.key]}
                onChange={set(cost.key)}
                headers={usable}
                disabled={disabled}
                testId={`select-map-cost-${cost.key}`}
              />
            ))}
          </div>
          {/* Decision 6 in the mapper, said in the owner's words. */}
          <p className="mt-2 text-xs text-muted-foreground">
            A blank cost cell means the file doesn't say, and nothing is recorded. A zero means
            there wasn't one.
          </p>
        </div>

        <div className="max-w-sm space-y-1.5">
          <Label className="text-sm" htmlFor="statement-label">
            Name for this statement
          </Label>
          <Input
            id="statement-label"
            value={statementLabel}
            onChange={(event) => setStatementLabel(event.target.value)}
            disabled={disabled}
            data-testid="input-statement-label"
          />
          <p className="text-xs text-muted-foreground">
            Use the same name if you import this file again — that's what stops it being
            counted twice.
          </p>
        </div>

        {sample.length > 0 && (
          <div className="overflow-x-auto">
            <p className="mb-2 text-sm font-medium">First few rows</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {headers.map((header, index) => (
                    <th key={index} className="whitespace-nowrap px-2 py-1 font-medium">
                      {header || <span className="italic">(no name)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-0">
                    {row.map((value, index) => (
                      <td key={index} className="whitespace-nowrap px-2 py-1">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Preview
// ============================================================

const OUTCOME_BADGE: Record<
  CsvPreview["rows"][number]["outcome"],
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  import: { label: "Will import", variant: "default" },
  hold: { label: "Held for review", variant: "secondary" },
  already_imported: { label: "Already imported", variant: "outline" },
};

function PreviewCard({
  preview,
  onImport,
  importing,
  canWrite,
}: {
  preview: CsvPreview;
  onImport: () => void;
  importing: boolean;
  canWrite: boolean;
}) {
  const nothingToDo = preview.willImport === 0 && preview.willHold === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>What this would do</CardTitle>
        <CardDescription>Nothing has been recorded yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Figure label="Will import" value={String(preview.willImport)} testId="stat-will-import" />
          <Figure label="Held for review" value={String(preview.willHold)} testId="stat-will-hold" />
          <Figure
            label="Already imported"
            value={String(preview.alreadyImported)}
            testId="stat-already-imported"
          />
          <Figure
            label="Total"
            value={
              preview.currencies.length > 1
                ? `${preview.currencies.length} currencies`
                : formatMoney(preview.total.minor, preview.currencies[0] ?? "USD")
            }
            testId="stat-import-total"
          />
        </div>

        {/* ⚠️ The check that catches importing the same statement twice under
            two names — the one failure the key design cannot prevent. */}
        {preview.lookAlikes.length > 0 && (
          <Alert data-testid="alert-lookalikes">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {preview.lookAlikes.length === 1
                ? "1 row looks like a sale you've already recorded"
                : `${preview.lookAlikes.length} rows look like sales you've already recorded`}
            </AlertTitle>
            <AlertDescription>
              Same work, same day, same amount — but recorded under a different reference, so
              they would come in as new earnings. That's correct if you genuinely sold the same
              thing twice. If you're re-importing a statement you've already done, stop and
              check first. Line
              {preview.lookAlikes.length === 1 ? "" : "s"}{" "}
              {preview.lookAlikes.slice(0, 10).map((entry) => entry.line).join(", ")}
              {preview.lookAlikes.length > 10 ? ", …" : ""}.
            </AlertDescription>
          </Alert>
        )}

        {preview.lookAlikeCheckSkipped && (
          <Alert data-testid="alert-lookalike-skipped">
            <Info className="h-4 w-4" />
            <AlertDescription>
              There were too many existing sales in this date range to check for repeats, so
              that check didn't run.
            </AlertDescription>
          </Alert>
        )}

        {preview.warnings.map((warning, index) => (
          <Alert key={index} data-testid={`alert-import-warning-${index}`}>
            <Info className="h-4 w-4" />
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ))}

        {(preview.unknownWorks.length > 0 || preview.unknownContributors.length > 0) && (
          <Alert data-testid="alert-unknown-references">
            <Info className="h-4 w-4" />
            <AlertTitle>Some names aren't set up yet</AlertTitle>
            <AlertDescription>
              {preview.unknownWorks.length > 0 && (
                <p>
                  Works you don't have:{" "}
                  {preview.unknownWorks.slice(0, 8).join(", ")}
                  {preview.unknownWorks.length > 8
                    ? ` and ${preview.unknownWorks.length - 8} more`
                    : ""}
                  .
                </p>
              )}
              {preview.unknownContributors.length > 0 && (
                <p>
                  People you don't have:{" "}
                  {preview.unknownContributors.slice(0, 8).join(", ")}
                  {preview.unknownContributors.length > 8
                    ? ` and ${preview.unknownContributors.length - 8} more`
                    : ""}
                  .
                </p>
              )}
              {/* Held is a normal state, not a failure — say so, or an owner
                  goes and edits the file instead of importing it. */}
              <p className="mt-1">
                These sales still get recorded. They wait in Needs attention until you say who
                they belong to, and are then paid at the rate that applied on the day of the
                sale.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {preview.errors.length > 0 && (
          <Alert variant="destructive" data-testid="alert-import-rows-skipped">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} can't be read
              and will be left out
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-0.5">
                {preview.errors.slice(0, 10).map((rowError) => (
                  <li key={rowError.line}>
                    Line {rowError.line}: {rowError.message}
                  </li>
                ))}
              </ul>
              {preview.errors.length > 10 && (
                <p className="mt-1">…and {preview.errors.length - 10} more.</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 font-medium">Line</th>
                <th className="px-2 py-1 font-medium">Date</th>
                <th className="px-2 py-1 font-medium">Work</th>
                <th className="px-2 py-1 font-medium">Person</th>
                <th className="px-2 py-1 text-right font-medium">Amount</th>
                <th className="px-2 py-1 font-medium">What happens</th>
              </tr>
            </thead>
            <tbody data-testid="table-import-preview">
              {preview.rows.slice(0, 50).map((row) => (
                <tr key={row.line} className="border-b last:border-0">
                  <td className="px-2 py-1 text-muted-foreground">{row.line}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatDate(row.occurredAt)}</td>
                  <td className="px-2 py-1">{row.workRef ?? "—"}</td>
                  <td className="px-2 py-1">{row.contributorRef ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                    {formatMoney(row.amount.minor, row.currency)}
                  </td>
                  <td className="px-2 py-1">
                    <Badge variant={OUTCOME_BADGE[row.outcome].variant}>
                      {OUTCOME_BADGE[row.outcome].label}
                    </Badge>
                    {row.reason && (
                      <span className="ml-2 text-xs text-muted-foreground">{row.reason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.rows.length > 50 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Showing the first 50 of {preview.rows.length} rows.
            </p>
          )}
        </div>

        {/* The counts are restated here, immediately above the button, so the
            last thing read before the irreversible action is what it does. */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            onClick={onImport}
            disabled={!canWrite || importing || nothingToDo}
            data-testid="button-import-commit"
          >
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <FileUp className="mr-2 h-4 w-4" />
            Import {preview.willImport + preview.willHold} row
            {preview.willImport + preview.willHold === 1 ? "" : "s"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {nothingToDo
              ? "There's nothing new in this file."
              : preview.alreadyImported > 0
                ? `${preview.alreadyImported} row${preview.alreadyImported === 1 ? "" : "s"} already recorded will be skipped.`
                : "This can't be undone without reversing each sale."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

// ============================================================
// Result
// ============================================================

function ResultCard({ result, onDone }: { result: CsvImportResult; onDone: () => void }) {
  return (
    <Card data-testid="card-import-result">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Imported "{result.statementLabel}"
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Figure label="Recorded" value={String(result.imported)} testId="stat-result-imported" />
          <Figure
            label="Held for review"
            value={String(result.heldForReview)}
            testId="stat-result-held"
          />
          <Figure
            label="Already there"
            value={String(result.duplicates)}
            testId="stat-result-duplicates"
          />
          <Figure
            label="Earnings created"
            value={formatMoney(result.totalAllocated.minor)}
            testId="stat-result-allocated"
          />
        </div>

        {result.heldForReview > 0 && (
          <p className="text-sm text-muted-foreground">
            The held rows are in <strong>Needs attention</strong>. Say who they belong to and
            they'll be paid at the rate that applied on the day of the sale.
          </p>
        )}

        {result.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {result.errors.length === 1
                ? "1 row was left out"
                : `${result.errors.length} rows were left out`}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-0.5">
                {result.errors.slice(0, 10).map((rowError) => (
                  <li key={`${rowError.line}-${rowError.message}`}>
                    Line {rowError.line}: {rowError.message}
                  </li>
                ))}
              </ul>
              {/* Re-importing after a fix is safe, and saying so is what stops
                  an owner hand-entering the failures and double-paying. */}
              <p className="mt-2">
                Fix these in the file and import it again under the same name — everything that
                went in this time will be skipped.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <Button variant="outline" onClick={onDone} data-testid="button-import-done">
          Import another
        </Button>
      </CardContent>
    </Card>
  );
}
