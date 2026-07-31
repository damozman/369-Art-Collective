/**
 * Reading and writing a tenant's links to external systems.
 *
 * The only module that touches `credentialSealed` and `webhookSecretSealed`.
 * Everything else asks for an opened credential and gets one, or asks for a
 * connection summary and gets one with no secret material in it at all — see
 * `ConnectionSummary`, which exists specifically so an API response cannot leak
 * a token by being built from the raw row.
 *
 * WHY LOOKUP IS BY `(provider, externalRef)` AND NOT BY TENANT. An inbound
 * webhook identifies itself by shop domain and nothing else. There is no tenant
 * in the request until this lookup resolves one, which is why the uniqueness
 * constraint on that pair is a correctness property rather than tidiness: two
 * rows claiming one store would make the routing ambiguous, and the ambiguity
 * would be resolved by whichever row the database returned first.
 */

import { and, eq, isNull } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";
import { open, openOrNull, seal } from "./secrets";

export type ConnectionProvider = "shopify" | "stripe";

export type ConnectionStatus =
  | "pending"
  | "active"
  | "disconnected"
  | "revoked"
  | "error";

/** Safe to serialise. Contains no secret material by construction. */
export interface ConnectionSummary {
  id: string;
  tenantId: string;
  provider: string;
  externalRef: string;
  label: string | null;
  status: ConnectionStatus;
  scopes: string[] | null;
  settings: Record<string, unknown> | null;
  hasCredential: boolean;
  hasWebhookSecret: boolean;
  lastEventAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  connectedAt: Date | null;
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export function toSummary(row: schema.SourceConnection): ConnectionSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    externalRef: row.externalRef,
    label: row.label,
    status: row.status as ConnectionStatus,
    scopes: (row.scopes as string[] | null) ?? null,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
    hasCredential: Boolean(row.credentialSealed),
    hasWebhookSecret: Boolean(row.webhookSecretSealed),
    lastEventAt: row.lastEventAt,
    lastErrorAt: row.lastErrorAt,
    lastError: row.lastError,
    connectedAt: row.connectedAt,
  };
}

export interface UpsertConnectionInput {
  tenantId: string;
  provider: ConnectionProvider;
  externalRef: string;
  label?: string | null;
  /** Plaintext. Sealed here and never stored raw. Omit to leave unchanged. */
  credential?: string | null;
  /** Plaintext. Sealed here. Omit to leave unchanged. */
  webhookSecret?: string | null;
  scopes?: string[] | null;
  settings?: Record<string, unknown> | null;
  status?: ConnectionStatus;
}

/**
 * Create or update a connection.
 *
 * Keyed on `(provider, externalRef)` so reconnecting the same store updates the
 * existing row rather than colliding with it. A reconnect that lands on another
 * tenant's row is rejected outright: that is either a misconfiguration or an
 * attempt to redirect someone else's revenue, and neither should succeed
 * quietly.
 */
export async function upsertConnection(
  db: EngineDb,
  input: UpsertConnectionInput
): Promise<ConnectionSummary> {
  const [existing] = await db
    .select()
    .from(schema.sourceConnections)
    .where(
      and(
        eq(schema.sourceConnections.provider, input.provider),
        eq(schema.sourceConnections.externalRef, input.externalRef)
      )
    )
    .limit(1);

  if (existing && existing.tenantId !== input.tenantId) {
    throw new ConnectionError(
      `${input.provider} connection "${input.externalRef}" is already claimed by another business. ` +
        "One store belongs to one business; disconnect it there first."
    );
  }

  const values = {
    tenantId: input.tenantId,
    provider: input.provider,
    externalRef: input.externalRef,
    label: input.label ?? existing?.label ?? null,
    status: input.status ?? existing?.status ?? "pending",
    scopes: input.scopes ?? existing?.scopes ?? null,
    settings: input.settings ?? existing?.settings ?? null,
    updatedAt: new Date(),
  };

  // `undefined` means "leave alone"; explicit `null` means "clear it". The
  // distinction matters — an update that only changes a setting must not wipe
  // the store's access token as a side effect.
  const credentialSealed =
    input.credential === undefined
      ? existing?.credentialSealed ?? null
      : input.credential === null
        ? null
        : seal(input.credential);

  const webhookSecretSealed =
    input.webhookSecret === undefined
      ? existing?.webhookSecretSealed ?? null
      : input.webhookSecret === null
        ? null
        : seal(input.webhookSecret);

  if (existing) {
    const [row] = await db
      .update(schema.sourceConnections)
      .set({
        ...values,
        credentialSealed,
        webhookSecretSealed,
        connectedAt:
          values.status === "active" && !existing.connectedAt
            ? new Date()
            : existing.connectedAt,
        disconnectedAt: values.status === "active" ? null : existing.disconnectedAt,
      })
      .where(eq(schema.sourceConnections.id, existing.id))
      .returning();
    return toSummary(row);
  }

  const [row] = await db
    .insert(schema.sourceConnections)
    .values({
      ...values,
      credentialSealed,
      webhookSecretSealed,
      connectedAt: values.status === "active" ? new Date() : null,
    })
    .returning();

  return toSummary(row);
}

/** The routing lookup an inbound webhook does. Returns the raw row. */
export async function findConnectionByExternalRef(
  db: EngineDb,
  provider: ConnectionProvider,
  externalRef: string
): Promise<schema.SourceConnection | null> {
  const [row] = await db
    .select()
    .from(schema.sourceConnections)
    .where(
      and(
        eq(schema.sourceConnections.provider, provider),
        eq(schema.sourceConnections.externalRef, externalRef)
      )
    )
    .limit(1);

  return row ?? null;
}

/** A tenant's connections for one provider, newest first. */
export async function listConnections(
  db: EngineDb,
  tenantId: string,
  provider?: ConnectionProvider
): Promise<ConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.sourceConnections)
    .where(
      provider
        ? and(
            eq(schema.sourceConnections.tenantId, tenantId),
            eq(schema.sourceConnections.provider, provider)
          )
        : eq(schema.sourceConnections.tenantId, tenantId)
    );

  return rows.map(toSummary);
}

/** The one active connection for a tenant and provider, if there is one. */
export async function getActiveConnection(
  db: EngineDb,
  tenantId: string,
  provider: ConnectionProvider
): Promise<schema.SourceConnection | null> {
  const [row] = await db
    .select()
    .from(schema.sourceConnections)
    .where(
      and(
        eq(schema.sourceConnections.tenantId, tenantId),
        eq(schema.sourceConnections.provider, provider),
        eq(schema.sourceConnections.status, "active"),
        isNull(schema.sourceConnections.disconnectedAt)
      )
    )
    .limit(1);

  return row ?? null;
}

/** Open the stored credential. Throws when there is none — never returns "". */
export function openCredential(connection: schema.SourceConnection): string {
  if (!connection.credentialSealed) {
    throw new ConnectionError(
      `${connection.provider} connection "${connection.externalRef}" has no stored credential`
    );
  }
  return open(connection.credentialSealed);
}

export function openWebhookSecret(connection: schema.SourceConnection): string | null {
  return openOrNull(connection.webhookSecretSealed);
}

/** Record that the provider rejected us, so the console can say "reconnect". */
export async function markConnectionError(
  db: EngineDb,
  connectionId: string,
  message: string,
  options: { status?: ConnectionStatus } = {}
): Promise<void> {
  await db
    .update(schema.sourceConnections)
    .set({
      status: options.status ?? "error",
      lastError: message.slice(0, 1000),
      lastErrorAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.sourceConnections.id, connectionId));
}

/**
 * Record a successfully processed inbound event.
 *
 * Also clears a previous error: a connection that is working again should stop
 * telling the owner to reconnect, and nothing else would ever clear it.
 */
export async function markConnectionEvent(
  db: EngineDb,
  connectionId: string
): Promise<void> {
  await db
    .update(schema.sourceConnections)
    .set({
      lastEventAt: new Date(),
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.sourceConnections.id, connectionId));
}

/**
 * Disconnect a connection.
 *
 * The credential is destroyed, not merely orphaned. A disconnected row that
 * keeps a live Shopify token is a credential with no owner watching it, which
 * is the worst of both.
 */
export async function disconnectConnection(
  db: EngineDb,
  connectionId: string,
  reason: "disconnected" | "revoked" = "disconnected"
): Promise<void> {
  await db
    .update(schema.sourceConnections)
    .set({
      status: reason,
      credentialSealed: null,
      webhookSecretSealed: null,
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.sourceConnections.id, connectionId));
}
