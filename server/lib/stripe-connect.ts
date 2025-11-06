import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
});

export interface CreateAccountLinkParams {
  artistId: string;
  artistEmail: string;
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
    const account = await stripe.accounts.create({
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
  async createAccountLink(params: CreateAccountLinkParams): Promise<string> {
    let accountId: string;

    // Check if account already exists, otherwise create
    const accounts = await stripe.accounts.list({
      limit: 1,
    });

    const existingAccount = accounts.data.find(
      (acc) => acc.metadata?.artistId === params.artistId
    );

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      accountId = await this.createConnectedAccount(params.artistEmail, {
        artistId: params.artistId,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: 'account_onboarding',
    });

    return accountLink.url;
  }

  /**
   * Get account details and status
   */
  async getAccountStatus(accountId: string): Promise<{
    id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  }> {
    const account = await stripe.accounts.retrieve(accountId);

    return {
      id: account.id,
      charges_enabled: account.charges_enabled || false,
      payouts_enabled: account.payouts_enabled || false,
      details_submitted: account.details_submitted || false,
    };
  }

  /**
   * Process a transfer to a connected account
   */
  async processTransfer(params: ProcessTransferParams): Promise<string> {
    const transfer = await stripe.transfers.create({
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
    const accounts = await stripe.accounts.list({
      limit: 100,
    });

    const account = accounts.data.find((acc) => acc.metadata?.artistId === artistId);
    return account?.id || null;
  }
}

export const stripeConnectService = new StripeConnectService();
