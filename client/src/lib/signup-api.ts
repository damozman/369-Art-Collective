/**
 * Client for the public signup and pricing endpoints.
 *
 * Standalone, like `portal-api.ts` and `admin-api.ts`, and for the same reason:
 * this is the engine's surface and must survive Phase 2 when the marketplace
 * client is deleted.
 *
 * Prices are `Money` — `{ minor: string; formatted: string }` — never numbers.
 * They are small enough that a JSON number would survive, which is exactly why
 * the rule is applied mechanically rather than where it seems to matter.
 */

import type { Money } from "./portal-money";

export class SignupApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "SignupApiError";
  }
}

export interface PublicPlan {
  key: string;
  name: string;
  blurb: string;
  peopleLimit: number;
  currency: string;
  monthly: Money;
  annual: Money;
  annualPerMonth: Money;
  annualSaving: Money;
  monthsChargedAnnually: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new SignupApiError(response.status, body.message ?? "Something went wrong");
  }

  return body as T;
}

export function getPlans(): Promise<{ plans: PublicPlan[] }> {
  return request("/api/engine/plans");
}

export function signUp(input: {
  businessName: string;
  name: string;
  email: string;
  password: string;
  planKey: string;
  billingInterval: "monthly" | "annual";
}): Promise<{ tenantSlug: string; trialEndsAt: string; pendingApproval: boolean }> {
  return request("/api/engine/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
