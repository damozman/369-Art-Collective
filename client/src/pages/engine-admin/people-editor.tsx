/**
 * Adding and editing the people you pay.
 *
 * The field that matters most here is the **reference**. It is how an incoming
 * sale is matched to a person — a fragment of the SKU, a vendor name, whatever
 * the sales channel carries. Get it wrong and the sale lands in "needs review"
 * rather than being paid; the engine will not guess.
 *
 * Setting a password here is optional and separate from paying someone: it
 * controls whether they can sign in and see their own earnings. Somebody can be
 * paid without ever logging in.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
  createContributor,
  updateContributor,
  type AdminContributor,
} from "@/lib/admin-api";

export function PeopleEditor({
  slug,
  existing,
  onDone,
  onCancel,
}: {
  slug: string;
  existing?: AdminContributor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [externalRef, setExternalRef] = useState(existing?.externalRef ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        email: email.trim() || undefined,
        externalRef: externalRef.trim() || undefined,
        // Only send a password when one was typed — an empty box means
        // "leave it alone", not "clear it".
        password: password.trim() || undefined,
      };

      return isEdit
        ? updateContributor(slug, existing!.id, payload)
        : createContributor(slug, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contributors", slug] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview", slug] });
      onDone();
    },
    onError: (err) => setError((err as Error).message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <Card data-testid="card-people-editor">
      <CardHeader>
        <CardTitle>{isEdit ? `Edit ${existing!.name}` : "Add someone"}</CardTitle>
        <CardDescription>
          {isEdit
            ? "Changing details here does not affect anything they have already been paid."
            : "Add a person you need to pay."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="person-name">Name</Label>
            <Input
              id="person-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="input-person-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-email">Email</Label>
            <Input
              id="person-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-person-email"
            />
            <p className="text-xs text-muted-foreground">
              Used for signing in to see their earnings. Optional.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-ref">Reference</Label>
            <Input
              id="person-ref"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="maya"
              data-testid="input-person-ref"
            />
            <p className="text-xs text-muted-foreground">
              How sales identify this person — usually the code in your product SKUs.
              If it doesn't match, their sales land in "Needs attention" instead of
              being paid.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="person-password">
              {isEdit ? "New password" : "Password"}
            </Label>
            <Input
              id="person-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "Leave blank to keep the current one" : ""}
              data-testid="input-person-password"
            />
            <p className="text-xs text-muted-foreground">
              Lets them sign in and see their own statement. Optional — you can pay
              someone who never logs in.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-person-error">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending} data-testid="button-save-person">
              {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Add person"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel-person">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
