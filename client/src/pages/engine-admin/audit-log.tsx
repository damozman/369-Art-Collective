/**
 * The log of changes.
 *
 * Called "Changes", not "History" — the console already has a History tab for
 * payout runs, and two tabs with the same name is a defect however accurate
 * both labels are on their own.
 *
 * ⚠️ THIS SCREEN'S JOB IS TO ANSWER "WHO CHANGED THIS, AND WHEN?" IN A SENTENCE.
 * The raw log rows are `action`, `entityType`, and two JSON blobs — accurate,
 * and useless to the person reading them. Every entry is therefore rendered as
 * plain English, with the raw before/after available underneath for the rare
 * case where somebody genuinely needs it.
 *
 * A history nobody can read is the same as no history, and the reason this
 * system records anything is so a disagreement about money can be settled.
 *
 * Dates are UTC, from the ISO string — same rule as the portal and the emails.
 * A history that disagrees with the statement it explains is worse than none.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuditLog, type AdminAuditEntry } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/portal-date";

const ALL = "__all__";

/**
 * How each kind of change reads on screen.
 *
 * Anything not listed falls back to the raw action with underscores removed —
 * a new entry type shows up as slightly ugly English rather than disappearing,
 * which is the right failure: a missing history entry is invisible, and an ugly
 * one gets fixed.
 */
const ACTION_LABELS: Record<string, string> = {
  update_settings: "Changed the business settings",
  deactivate_rule: "Turned off a rate",
  resolve_review: "Assigned a held sale to someone",
  dismiss_review: "Dismissed a held sale",
  record_cost: "Recorded a cost on a sale",
  write_off: "Wrote off a negative balance",
  change_plan: "Changed the subscription plan",
  signup: "Created this account",
  export_tax_report: "Downloaded the year-end report",
  password_reset: "Reset a password",
};

function label(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function AuditTab({ slug }: { slug: string }) {
  const [action, setAction] = useState<string>(ALL);

  const query = useQuery({
    queryKey: ["admin-audit", slug, action],
    queryFn: () => getAuditLog(slug, action === ALL ? {} : { action }),
  });

  return (
    <Card data-testid="card-audit">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Changes</CardTitle>
            <CardDescription>
              Every change anyone has made, newest first. Nothing here can be edited
              or removed.
            </CardDescription>
          </div>

          {query.data && query.data.actions.length > 0 && (
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-56" data-testid="select-audit-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everything</SelectItem>
                {query.data.actions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {label(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {query.data && query.data.entries.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="text-audit-empty">
            {action === ALL
              ? "Nothing has been changed yet."
              : "No changes of that kind."}
          </p>
        )}

        {query.data && query.data.entries.length > 0 && (
          <ul className="divide-y" data-testid="list-audit">
            {query.data.entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {query.data && query.data.entries.length >= 100 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Showing the 100 most recent changes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.before) || Boolean(entry.after);

  return (
    <li className="py-3" data-testid={`row-audit-${entry.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm">
          <span className="font-medium">{entry.actorName}</span>{" "}
          <span className="text-muted-foreground">{label(entry.action).toLowerCase()}</span>
          {entry.actorType === "system" && (
            <Badge variant="outline" className="ml-2 font-normal">
              Automatic
            </Badge>
          )}
        </p>
        <span className="text-xs text-muted-foreground" data-testid="text-audit-when">
          {formatDateTime(entry.occurredAt)}
        </span>
      </div>

      {hasDetail && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            data-testid={`button-audit-detail-${entry.id}`}
          >
            {open ? "Hide detail" : "Show detail"}
          </button>

          {open && (
            <div className="mt-2 grid gap-3 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-2">
              <Detail title="Before" value={entry.before} />
              <Detail title="After" value={entry.after} />
            </div>
          )}
        </>
      )}
    </li>
  );
}

function Detail({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">—</p>
      </div>
    );
  }

  const entries =
    typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : [["value", value] as const];

  return (
    <div>
      <p className="font-medium">{title}</p>
      <dl className="mt-1 space-y-0.5">
        {entries.map(([key, item]) => (
          <div key={key} className="flex gap-2">
            <dt className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").toLowerCase()}:</dt>
            <dd className="break-all">{formatValue(item)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  // Deliberately not parsed as money: the log stores whatever the writer put
  // there, and guessing which fields are amounts would eventually mis-label one.
  return String(value);
}
