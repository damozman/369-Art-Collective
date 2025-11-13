import Stripe from 'stripe';

// Lazy initialization to ensure runtime environment variable is used
// Prevents build-time caching of wrong key (VITE_STRIPE_PUBLIC_KEY fallback)
function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }
  
  // Sanity check: ensure we're not using publishable key
  if (process.env.STRIPE_SECRET_KEY.startsWith('pk_')) {
    throw new Error('STRIPE_SECRET_KEY must be a secret key (sk_*), not a publishable key (pk_*)');
  }
  
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-10-28.acacia',
  });
}

export interface CreateAccountLinkParams {
  artistId: string;
  artistEmail: string;
  stripeAccountId?: string; // Use existing account if provided
  refreshUrl: string;
  returnUrl: string;
}

export interface ProcessTransferParams {
  connectedAccountId: string;
  amount: number; // in cents
  description: string;
  metadata?: Record<string, string>;
}

export class StripeConnectService {
  /**
   * Create a Stripe Connect account for an artist
   */
  async createConnectedAccount(email: string, metadata: { artistId: string }): Promise<string> {
    const account = await getStripeClient().accounts.create({
      type: 'express',
      email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata,
    });

    return account.id;
  }

  /**
   * Create an account link for onboarding
   */
  async createAccountLink(params: CreateAccountLinkParams): Promise<{
    url: string;
    accountId: string;
  }> {
    let accountId: string;

    // Use existing stripeAccountId if provided, otherwise create new account
    if (params.stripeAccountId) {
      accountId = params.stripeAccountId;
    } else {
      accountId = await this.createConnectedAccount(params.artistEmail, {
        artistId: params.artistId,
      });
    }

    const accountLink = await getStripeClient().accountLinks.create({
      account: accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: 'account_onboarding',
    });

    return {
      url: accountLink.url,
      accountId,
    };
  }

  /**
   * Get account details and status
   */
  async getAccountStatus(accountId: string): Promise<{
    id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    requirements: {
      currently_due: string[];
      past_due: string[];
      eventually_due: string[];
    };
    default_currency?: string;
    external_account_last4?: string;
  }> {
    const account = await getStripeClient().accounts.retrieve(accountId);

    // Extract external account details (bank account)
    let externalAccountLast4: string | undefined;
    if (account.external_accounts?.data.length) {
      const bankAccount = account.external_accounts.data[0];
      if ('last4' in bankAccount) {
        externalAccountLast4 = bankAccount.last4;
      }
    }

    return {
      id: account.id,
      charges_enabled: account.charges_enabled || false,
      payouts_enabled: account.payouts_enabled || false,
      details_submitted: account.details_submitted || false,
      requirements: {
        currently_due: account.requirements?.currently_due || [],
        past_due: account.requirements?.past_due || [],
        eventually_due: account.requirements?.eventually_due || [],
      },
      default_currency: account.default_currency,
      external_account_last4: externalAccountLast4,
    };
  }

  /**
   * Process a transfer to a connected account
   */
  async processTransfer(params: ProcessTransferParams): Promise<string> {
    const transfer = await getStripeClient().transfers.create({
      amount: params.amount,
      currency: 'usd',
      destination: params.connectedAccountId,
      description: params.description,
      metadata: params.metadata || {},
    });

    return transfer.id;
  }

  /**
   * Retrieve account by artist ID from metadata
   */
  async getAccountByArtistId(artistId: string): Promise<string | null> {
    const accounts = await getStripeClient().accounts.list({
      limit: 100,
    });

    const account = accounts.data.find((acc) => acc.metadata?.artistId === artistId);
    return account?.id || null;
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    return getStripeClient().webhooks.constructEvent(payload, signature, webhookSecret);
  }
}

export const stripeConnectService = new StripeConnectService();
export { getStripeClient };
