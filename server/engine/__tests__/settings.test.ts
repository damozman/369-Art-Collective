/**
 * Business settings validation — pure, no database.
 *
 * The DB-facing half (the audit entry, and the fact that changing the hold
 * period does NOT move money already held) is proved in `e2e.ts` against real
 * Postgres, because that is a claim about stored rows and cannot be made here.
 *
 * What is proved here is the guard rail: that the settings which would quietly
 * misbehave are refused at the door rather than stored.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  AdminValidationError,
  validateSettingsInput,
  type TenantSettingsInput,
} from "../admin-mutations";

function settings(overrides: Partial<TenantSettingsInput> = {}): TenantSettingsInput {
  return {
    payoutHoldDays: 14,
    minimumPayout: "10.00",
    clawbackPolicy: "recoup",
    ...overrides,
  };
}

test("a normal set of settings validates", () => {
  assert.doesNotThrow(() => validateSettingsInput(settings()));
});

test("zero hold days is allowed — some businesses genuinely want to pay immediately", () => {
  assert.doesNotThrow(() => validateSettingsInput(settings({ payoutHoldDays: 0 })));
});

test("a negative hold period is refused", () => {
  assert.throws(
    () => validateSettingsInput(settings({ payoutHoldDays: -1 })),
    AdminValidationError
  );
});

test("a fractional hold period is refused rather than silently truncated", () => {
  // 14.5 days has no meaning against `holdUntil`, which adds whole UTC days.
  assert.throws(
    () => validateSettingsInput(settings({ payoutHoldDays: 14.5 })),
    AdminValidationError
  );
});

test("an absurd hold period is refused as a typo", () => {
  assert.throws(
    () => validateSettingsInput(settings({ payoutHoldDays: 3650 })),
    AdminValidationError
  );
});

test("an unrecognised refund policy is refused", () => {
  assert.throws(
    () =>
      validateSettingsInput(
        settings({ clawbackPolicy: "ignore" as TenantSettingsInput["clawbackPolicy"] })
      ),
    AdminValidationError
  );
});

test("reserve without a percentage is refused", () => {
  assert.throws(
    () => validateSettingsInput(settings({ clawbackPolicy: "reserve", reserveReleaseDays: 90 })),
    AdminValidationError
  );
});

test("reserve without a release period is refused", () => {
  assert.throws(
    () => validateSettingsInput(settings({ clawbackPolicy: "reserve", reservePercent: 10 })),
    AdminValidationError
  );
});

/**
 * The one that matters most. `reversal.ts:249` returns a zero reserve when the
 * rate is not positive, so storing `reserve` at 0% would leave the screen
 * saying "holding a reserve" while the engine behaves exactly like `recoup`.
 * A policy that silently is not the policy is worse than a rejected form.
 */
test("reserve at zero percent is refused, because it would silently behave as recoup", () => {
  assert.throws(
    () =>
      validateSettingsInput(
        settings({ clawbackPolicy: "reserve", reservePercent: 0, reserveReleaseDays: 90 })
      ),
    AdminValidationError
  );
});

test("reserve above 100 percent is refused", () => {
  assert.throws(
    () =>
      validateSettingsInput(
        settings({ clawbackPolicy: "reserve", reservePercent: 101, reserveReleaseDays: 90 })
      ),
    AdminValidationError
  );
});

test("a reserve percentage finer than basis points is refused rather than rounded", () => {
  // Storage is basis points; 10.005% cannot be held exactly and would be
  // silently rounded to 10.01%, which is a different deal.
  assert.throws(
    () =>
      validateSettingsInput(
        settings({ clawbackPolicy: "reserve", reservePercent: 10.005, reserveReleaseDays: 90 })
      ),
    AdminValidationError
  );
});

test("two decimal places of reserve are accepted", () => {
  assert.doesNotThrow(() =>
    validateSettingsInput(
      settings({ clawbackPolicy: "reserve", reservePercent: 12.25, reserveReleaseDays: 90 })
    )
  );
});

test("reserve settings are not required under the other policies", () => {
  // They are left stored but unused, so switching to reserve and back does not
  // lose the configuration.
  assert.doesNotThrow(() =>
    validateSettingsInput(settings({ clawbackPolicy: "absorb" }))
  );
});
