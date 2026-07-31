/**
 * `TransferExecutor` over Stripe.
 *
 * This is the second of §4's two seams filled in — the point where a decided
 * payout becomes an instruction to move money. Everything about *whether* and
 * *how much* was settled upstream in `payout.ts`; this file converts one
 * decision into one API call and converts the answer back.
 *
 * THE ONE CONVERSION THAT MATTERS. Amounts are `bigint` minor units everywhere
 * in the engine and `number` in the Stripe SDK. That conversion happens here,
 * once, and it is checked: a value that would not survive the round trip
 * through `Number` is refused rather than silently rounded. A payout large
 * enough to exceed `Number.MAX_SAFE_INTEGER` cents is implausible today, but
 * the check costs nothing and the failure it prevents is a wrong amount sent to
 * a real bank account.
 *
 * WHY A THROWN ERROR BECOMES `{status: "failed"}` RATHER THAN PROPAGATING. One
 * contributor's failure must not abort a batch — `runPayoutBatch` is built so
 * the other twenty still get paid — and it does that by reading a result, not
 * by catching. Letting an exception escape would take the whole run down and
 * leave the batch in `processing` forever.
 */

import type {
  TransferExecutor,
  TransferRequest,
  TransferResult,
} from "../../payout";
import {
  StripeTransferError,
  type StripeClient,
} from "./client";

export interface StripeTransferExecutorOptions {
  client: StripeClient;
  /**
   * The tenant's own connected account, which the funds come out of. Absent
   * only in a single-account test setup; in production this is always set,
   * because the platform never holds the money (ratified decision #1).
   */
  onBehalfOfAccount?: string;
}

/** Cents that cannot round-trip through a JS number are refused, not rounded. */
function toStripeAmount(amountMinor: bigint): number {
  if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StripeTransferError(
      `Amount ${amountMinor} exceeds what can be sent to Stripe without losing precision`,
      "amount_too_large",
      false
    );
  }
  if (amountMinor <= 0n) {
    throw new StripeTransferError(
      `Refusing to transfer a non-positive amount (${amountMinor})`,
      "amount_not_positive",
      false
    );
  }
  return Number(amountMinor);
}

export class StripeTransferExecutor implements TransferExecutor {
  constructor(private readonly options: StripeTransferExecutorOptions) {}

  async execute(request: TransferRequest): Promise<TransferResult> {
    try {
      const transfer = await this.options.client.createTransfer({
        amount: toStripeAmount(request.amountMinor),
        currency: request.currency,
        destination: request.destinationAccountId,
        description: request.description,
        // Stripe metadata values must be strings. Everything the engine puts in
        // here already is, but coercing makes that a property of this file
        // rather than an assumption about every caller.
        metadata: Object.fromEntries(
          Object.entries(request.metadata).map(([key, value]) => [key, String(value)])
        ),
        idempotencyKey: request.idempotencyKey,
        onBehalfOfAccount: this.options.onBehalfOfAccount,
      });

      return { status: "succeeded", transferId: transfer.id };
    } catch (error) {
      if (error instanceof StripeTransferError) {
        return {
          status: "failed",
          // The retryable flag is carried in the text rather than a field
          // because `TransferResult` is provider-agnostic by design, and the
          // owner reading "payouts are disabled on this account" needs the
          // sentence more than the system needs the boolean.
          failureReason: describeFailure(error),
        };
      }

      return {
        status: "failed",
        failureReason:
          error instanceof Error ? error.message : "Transfer failed for an unknown reason",
      };
    }
  }
}

/**
 * Turn a Stripe error into something an owner can act on.
 *
 * "Transfer failed: account_invalid" tells a business owner nothing. The point
 * of the payout console showing failure reasons at all is that most failures
 * are things they can fix, and they can only fix what the message names.
 */
function describeFailure(error: StripeTransferError): string {
  switch (error.code) {
    case "account_invalid":
      return "The contributor's payout account is not valid. They may need to reconnect it.";
    case "balance_insufficient":
      return "Not enough funds in the business's Stripe balance to cover this payout.";
    case "transfers_not_allowed":
      return "This Stripe account is not permitted to send transfers. Check Connect settings.";
    case "account_closed":
      return "The contributor's payout account has been closed.";
    case "rate_limit":
      return "Stripe rate-limited the request. This will be retried.";
    default:
      return error.retryable
        ? `Temporary Stripe problem: ${error.message}. Safe to retry.`
        : `Stripe rejected the transfer: ${error.message}`;
  }
}
