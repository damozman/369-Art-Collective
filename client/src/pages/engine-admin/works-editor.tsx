/**
 * The works you sell, and who gets paid for each.
 *
 * THIS SCREEN IS THE ATTRIBUTION MAP. It is where "a sale arrived" becomes "and
 * these people are owed something for it". The **reference** field is the join:
 * whatever the sales channel carries — a SKU fragment, a product handle — has to
 * match it, or the sale lands in "Needs attention" instead of paying anyone.
 * The engine never guesses, so this screen is the whole guessing mechanism.
 *
 * Two things are deliberately not offered here:
 *
 * 1. **No delete.** Removing a work would cascade to its contributor links and
 *    orphan the attribution behind payments already made — the history would
 *    show the payment but no longer be able to say what it was for. Archiving
 *    hides it and keeps every past sale explicable.
 * 2. **No rate.** What someone earns lives in Rates, effective-dated and
 *    versioned. Letting a rate be typed here would create a second place that
 *    decides what people are paid, which is exactly the defect this system was
 *    built to remove.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Plus, X } from "lucide-react";

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
  createWork,
  getContributors,
  getWorks,
  linkWorkContributor,
  setWorkArchived,
  unlinkWorkContributor,
  updateWork,
  type AdminWork,
} from "@/lib/admin-api";

export function WorksTab({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminWork | null>(null);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const works = useQuery({
    queryKey: ["admin-works", slug],
    queryFn: () => getWorks(slug),
  });

  const people = useQuery({
    queryKey: ["admin-contributors", slug],
    queryFn: () => getContributors(slug),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-works", slug] });
  }

  if (adding || editing) {
    return (
      <WorkEditor
        slug={slug}
        existing={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
          refresh();
        }}
        onCancel={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  const all = works.data?.works ?? [];
  const visible = showArchived ? all : all.filter((work) => !work.archivedAt);
  const archivedCount = all.filter((work) => work.archivedAt).length;

  return (
    <Card data-testid="card-works">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Works</CardTitle>
            <CardDescription>
              What you sell, and who earns from each. A sale is matched to a work by
              its reference.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setAdding(true)} data-testid="button-add-work">
              <Plus className="mr-2 h-4 w-4" />
              Add work
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {works.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {works.data && visible.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="text-works-empty">
            {all.length === 0
              ? "Nothing here yet. Add a work, then say who earns from it."
              : "Nothing here — everything is archived."}
          </p>
        )}

        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Reference</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Who earns from it</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody data-testid="table-works">
                {visible.map((work) => (
                  <WorkRow
                    key={work.id}
                    slug={slug}
                    work={work}
                    canWrite={canWrite}
                    people={people.data?.contributors ?? []}
                    onEdit={() => setEditing(work)}
                    onChanged={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {archivedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => setShowArchived((v) => !v)}
            data-testid="button-toggle-archived"
          >
            {showArchived
              ? "Hide archived"
              : `Show ${archivedCount} archived`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function WorkRow({
  slug,
  work,
  canWrite,
  people,
  onEdit,
  onChanged,
}: {
  slug: string;
  work: AdminWork;
  canWrite: boolean;
  people: Array<{ id: string; name: string; active: boolean }>;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  const link = useMutation({
    mutationFn: () => linkWorkContributor(slug, work.id, personId, role.trim() || undefined),
    onSuccess: () => {
      setAdding(false);
      setPersonId("");
      setRole("");
      onChanged();
    },
    onError: (err) => setError((err as Error).message),
  });

  const unlink = useMutation({
    mutationFn: (contributorId: string) =>
      unlinkWorkContributor(slug, work.id, contributorId),
    onSuccess: onChanged,
    onError: (err) => setError((err as Error).message),
  });

  const archive = useMutation({
    mutationFn: () => setWorkArchived(slug, work.id, !work.archivedAt),
    onSuccess: onChanged,
    onError: (err) => setError((err as Error).message),
  });

  const unattached = people.filter(
    (person) => !work.contributors.some((c) => c.id === person.id)
  );

  return (
    <tr className="border-b last:border-0 align-top" data-testid={`row-work-${work.id}`}>
      <td className="py-3 pr-4">
        <span className={work.archivedAt ? "text-muted-foreground line-through" : ""}>
          {work.title}
        </span>
        {work.archivedAt && (
          <Badge variant="outline" className="ml-2" data-testid="badge-archived">
            Archived
          </Badge>
        )}
      </td>

      <td className="py-3 pr-4">
        {work.externalRef ? (
          <code className="text-xs">{work.externalRef}</code>
        ) : (
          <span
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid="text-no-ref"
          >
            None — sales can't be matched
          </span>
        )}
      </td>

      <td className="py-3 pr-4 text-muted-foreground">{work.productType ?? "—"}</td>

      <td className="py-3 pr-4">
        {work.contributors.length === 0 ? (
          <p
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid="text-no-contributors"
          >
            Nobody — sales will need review
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {work.contributors.map((person) => (
              // `outline`, not `secondary`: this theme renders secondary in a
              // salmon that reads as an error state, and "Alice is on this
              // work" is the normal, healthy case.
              <Badge key={person.id} variant="outline" className="gap-1 font-normal">
                {person.name}
                {person.role && (
                  <span className="text-muted-foreground">· {person.role}</span>
                )}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => unlink.mutate(person.id)}
                    className="ml-0.5 rounded-sm hover:text-destructive"
                    aria-label={`Remove ${person.name} from ${work.title}`}
                    data-testid={`button-unlink-${person.id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {adding && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger className="h-8 w-44" data-testid="select-link-person">
                <SelectValue placeholder="Choose someone" />
              </SelectTrigger>
              <SelectContent>
                {unattached.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role (optional)"
              className="h-8 w-36"
              data-testid="input-link-role"
            />

            <Button
              size="sm"
              className="h-8"
              disabled={!personId || link.isPending}
              onClick={() => {
                setError(null);
                link.mutate();
              }}
              data-testid="button-confirm-link"
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </div>
        )}

        {canWrite && !adding && unattached.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1 block text-xs text-muted-foreground underline-offset-2 hover:underline"
            data-testid={`button-add-contributor-${work.id}`}
          >
            Add someone
          </button>
        )}

        {error && (
          <p className="mt-1 text-xs text-destructive" data-testid="text-work-row-error">
            {error}
          </p>
        )}
      </td>

      <td className="py-3 text-right">
        {canWrite && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} data-testid={`button-edit-work-${work.id}`}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => archive.mutate()}
              disabled={archive.isPending}
              aria-label={work.archivedAt ? "Restore" : "Archive"}
              data-testid={`button-archive-work-${work.id}`}
            >
              {work.archivedAt ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function WorkEditor({
  slug,
  existing,
  onDone,
  onCancel,
}: {
  slug: string;
  existing?: AdminWork;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(existing);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [externalRef, setExternalRef] = useState(existing?.externalRef ?? "");
  const [productType, setProductType] = useState(existing?.productType ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        externalRef: externalRef.trim(),
        productType: productType.trim(),
      };
      if (isEdit) {
        await updateWork(slug, existing!.id, payload);
      } else {
        await createWork(slug, payload);
      }
    },
    onSuccess: onDone,
    onError: (err) => setError((err as Error).message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <Card data-testid="card-work-editor">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit ${existing!.title}` : "Add a work"}</CardTitle>
        <CardDescription>
          {isEdit
            ? "Changing these does not affect anything already paid out."
            : "Add something you sell, then say who earns from it."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="work-title">Title</Label>
            <Input
              id="work-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              data-testid="input-work-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-ref">Reference</Label>
            <Input
              id="work-ref"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="SUNSET-01"
              data-testid="input-work-ref"
            />
            <p className="text-xs text-muted-foreground">
              How sales identify this work — usually part of the product code in your
              shop. If it doesn't match, sales of it land in "Needs attention" rather
              than paying anyone.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-type">Product type</Label>
            <Input
              id="work-type"
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              placeholder="print"
              data-testid="input-work-type"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Only matters if you set a rate that applies to a whole type of
              product rather than to a person.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-work-error">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending} data-testid="button-save-work">
              {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Add work"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel-work">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
