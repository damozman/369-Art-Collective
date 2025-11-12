import Stripe from "stripe";
import { storage } from "../storage";
import { emailService } from './email-service';
import { db } from './db';
import { emailLogs } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { updateFeaturedStatusForTier } from './featured-artists-service';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export type SubscriptionTier = 'free' | 'pro' | 'elite';

const SUBSCRIPTION_CONFIG = {
  pro: {
    priceMonthly: 1500,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    name: '247 Print Network Pro',
    features: [
      'Unlimited artwork uploads',
      'AI Art Studio access',
      '35% minimum royalty guarantee',
      'Priority support'
    ]
  },
  elite: {
    priceMonthly: 4000,
    priceId: process.env.STRIPE_ELITE_PRICE_ID,
    name: '247 Print Network Elite',
    features: [
      'Unlimited artwork uploads',
      'Full AI Art Studio access',
      '45% royalty guarantee (max tier)',
      'Profile customization',
      'Priority support',
      'Featured artist placement'
    ]
  }
};

async function getOrCreatePriceId(tier: 'pro' | 'elite'): Promise<string> {
  const config = SUBSCRIPTION_CONFIG[tier];
  
  if (config.priceId) {
    return config.priceId;
  }

  const products = await stripe.products.search({
    query: `metadata['tier']:'${tier}' AND metadata['platform']:'247-print-network'`,
  });

  let product;
  if (products.data.length > 0) {
    product = products.data[0];
  } else {
    product = await stripe.products.create({
      name: config.name,
      metadata: {
        tier,
        platform: '247-print-network'
      }
    });
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
  });

  if (prices.data.length > 0) {
    return prices.data[0].id;
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: config.priceMonthly,
    currency: 'usd',
    recurring: { interval: 'month' }
  });

  return price.id;
}

// Helper to check if email was already sent (idempotency guard)
async function hasEmailBeenSent(
  artistId: string,
  emailType: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  const logs = await db.select()
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.recipientId, artistId),
        eq(emailLogs.emailType, emailType as any),
        eq(emailLogs.status, 'sent')
      )
    )
    .orderBy(desc(emailLogs.sentAt))
    .limit(10); // Get last 10 to check for matches
  
  // If no logs found, email hasn't been sent
  if (logs.length === 0) {
    return false;
  }
  
  // If metadata provided, check if we've sent an email for this specific event
  if (metadata) {
    for (const log of logs) {
      const existingMetadata = log.metadata as Record<string, any> | null;
      if (existingMetadata) {
        // For subscription confirmations, check subscriptionId
        if (metadata.subscriptionId && existingMetadata.subscriptionId === metadata.subscriptionId) {
          return true;
        }
        // For payment failures, check invoiceId (critical for preventing spam)
        if (metadata.invoiceId && existingMetadata.invoiceId === metadata.invoiceId) {
          return true;
        }
      }
    }
    return false; // No matching metadata found
  }
  
  // If no metadata specified, just check if any email of this type was sent
  return true;
}

export class SubscriptionService {
  
  async getOrCreateStripeCustomer(artistId: string, email: string, name: string): Promise<string> {
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    if (artist.stripeCustomerId) {
      return artist.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        artistId,
        platform: '247-print-network'
      }
    });

    await storage.updateArtist(artistId, {
      stripeCustomerId: customer.id
    });

    return customer.id;
  }

  async createSubscription(
    artistId: string,
    tier: 'pro' | 'elite',
    email: string,
    name: string,
    idempotencyKey: string
  ): Promise<{ subscriptionId: string; clientSecret: string }> {
    // Require idempotency key from client to ensure retries use same key
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new Error('Idempotency key is required for subscription creation');
    }

    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    // Check for existing subscriptions
    if (artist.stripeSubscriptionId) {
      const existingSub = await stripe.subscriptions.retrieve(artist.stripeSubscriptionId, {
        expand: ['latest_invoice.payment_intent']
      });
      
      // If subscription exists and is active/trialing, prevent duplicate
      if (['active', 'trialing'].includes(existingSub.status)) {
        throw new Error('Artist already has an active subscription');
      }
      
      // If subscription is incomplete or past_due, return existing payment intent for retry
      if (['incomplete', 'past_due'].includes(existingSub.status)) {
        // Type guard: expanded fields are objects, unexpanded are string IDs
        if (typeof existingSub.latest_invoice !== 'string' && existingSub.latest_invoice) {
          const invoice = existingSub.latest_invoice as Stripe.Invoice;
          
          if (typeof invoice.payment_intent !== 'string' && invoice.payment_intent) {
            const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
            
            if (paymentIntent.client_secret) {
              return {
                subscriptionId: existingSub.id,
                clientSecret: paymentIntent.client_secret
              };
            }
          }
        }
        
        // Edge case: subscription is incomplete but has no payment intent
        console.error(`Subscription ${existingSub.id} is ${existingSub.status} but missing payment intent`);
        throw new Error('Cannot retry payment - subscription is in invalid state. Please contact support.');
      }
    }

    const customerId = await this.getOrCreateStripeCustomer(artistId, email, name);

    const priceId = await getOrCreatePriceId(tier);

    // Configure trial period: 14 days for Pro, 7 days for Elite
    const trialPeriodDays = tier === 'pro' ? 14 : 7;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialPeriodDays);

    // Use client-provided idempotency key to ensure retries are safely deduplicated by Stripe
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      trial_period_days: trialPeriodDays, // Add trial period (14 days Pro, 7 days Elite)
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        artistId,
        tier,
        trialDays: trialPeriodDays.toString()
      }
    }, {
      idempotencyKey
    });

    // Type guard: expanded fields are objects, unexpanded are string IDs
    if (typeof subscription.latest_invoice !== 'string' && subscription.latest_invoice) {
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      
      if (typeof invoice.payment_intent !== 'string' && invoice.payment_intent) {
        const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

        const periodEnd = typeof subscription.current_period_end === 'number'
          ? new Date(subscription.current_period_end * 1000)
          : new Date();

        // Update artist with subscription and trial info
        await storage.updateArtist(artistId, {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionTier: tier,
          subscriptionPeriodEnd: periodEnd as any,
          trialEndsAt: trialEnd as any
        });

        // Create trial analytics record
        await storage.createSubscriptionTrial({
          artistId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          tier,
          status: 'active',
          trialSource: 'dashboard_upgrade', // Default source, can be customized later
          trialStartedAt: new Date(),
          scheduledTrialEnd: trialEnd,
        });

        if (!paymentIntent.client_secret) {
          throw new Error('Payment intent missing client secret');
        }

        return {
          subscriptionId: subscription.id,
          clientSecret: paymentIntent.client_secret
        };
      }
    }
    
    throw new Error('Failed to create subscription - missing payment intent');
  }

  async upgradeSubscription(artistId: string, newTier: 'pro' | 'elite', idempotencyKey: string): Promise<void> {
    // Require idempotency key from client to ensure retries use same key
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new Error('Idempotency key is required for subscription upgrade');
    }

    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    if (!artist.stripeSubscriptionId) {
      throw new Error('No active subscription to upgrade');
    }

    const subscription = await stripe.subscriptions.retrieve(artist.stripeSubscriptionId);
    
    const priceId = await getOrCreatePriceId(newTier);

    // Use client-provided idempotency key to ensure retries are safely deduplicated by Stripe
    await stripe.subscriptions.update(artist.stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: 'create_prorations',
      metadata: {
        tier: newTier
      }
    }, {
      idempotencyKey
    });

    await storage.updateArtist(artistId, {
      subscriptionTier: newTier
    });
  }

  async cancelSubscription(artistId: string): Promise<void> {
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    if (!artist.stripeSubscriptionId) {
      throw new Error('No active subscription to cancel');
    }

    await stripe.subscriptions.update(artist.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    await storage.updateArtist(artistId, {
      subscriptionStatus: 'canceling'
    });
  }

  async reactivateSubscription(artistId: string): Promise<void> {
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    if (!artist.stripeSubscriptionId) {
      throw new Error('No subscription to reactivate');
    }

    await stripe.subscriptions.update(artist.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    await storage.updateArtist(artistId, {
      subscriptionStatus: 'active'
    });
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const artistId = subscription.metadata?.artistId;
        const tier = subscription.metadata?.tier as SubscriptionTier;
        
        if (!artistId) {
          console.error('Subscription created/updated but missing artistId metadata');
          break;
        }

        const periodEnd = typeof subscription.current_period_end === 'number'
          ? new Date(subscription.current_period_end * 1000)
          : new Date();

        await storage.updateArtist(artistId, {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionTier: tier,
          subscriptionPeriodEnd: periodEnd as any
        });
        
        // Auto-update featured artist status based on new tier
        if (tier) {
          await updateFeaturedStatusForTier(artistId, tier);
        }
        
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const artistId = subscription.metadata?.artistId;
        
        if (!artistId) {
          console.error('Subscription deleted but missing artistId metadata');
          break;
        }

        await storage.updateArtist(artistId, {
          subscriptionStatus: 'canceled',
          subscriptionTier: 'free'
        });
        
        // Reset featured status to free tier (not eligible)
        await updateFeaturedStatusForTier(artistId, 'free');
        
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (typeof invoice.subscription === 'string' && invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const artistId = subscription.metadata?.artistId;
          const tier = subscription.metadata?.tier as 'pro' | 'elite' | undefined;
          
          if (!artistId) {
            console.error('Invoice payment succeeded but subscription missing artistId metadata');
            break;
          }

          const periodEnd = typeof subscription.current_period_end === 'number'
            ? new Date(subscription.current_period_end * 1000)
            : new Date();

          await storage.updateArtist(artistId, {
            subscriptionStatus: 'active',
            subscriptionPeriodEnd: periodEnd as any
          });

          // Send subscription confirmation email (only on first payment, not renewals)
          // Check if this is the first invoice using billing_reason
          if (invoice.billing_reason === 'subscription_create' && tier) {
            const artist = await storage.getArtist(artistId);
            if (artist) {
              const alreadySent = await hasEmailBeenSent(
                artistId,
                'subscription_confirmed',
                { subscriptionId: subscription.id }
              );

              if (!alreadySent) {
                console.log(`[SUCCESS][SUBSCRIPTION_CONFIRMED] Sending confirmation email to ${artist.email} for ${tier} subscription`);
                await emailService.sendSubscriptionConfirmation(
                  artist.email,
                  artist.artistName,
                  artistId,
                  tier,
                  periodEnd
                ).catch((error) => {
                  console.error(`[ERROR][SUBSCRIPTION_EMAIL] Failed to send confirmation: ${error.message}`);
                });
              }
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (typeof invoice.subscription === 'string' && invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const artistId = subscription.metadata?.artistId;
          const tier = subscription.metadata?.tier as 'pro' | 'elite' | undefined;
          
          if (!artistId) {
            console.error('Invoice payment failed but subscription missing artistId metadata');
            break;
          }

          await storage.updateArtist(artistId, {
            subscriptionStatus: 'past_due'
          });

          // Send payment failed email to help artist fix the issue (with idempotency guard)
          if (tier && invoice.id) {
            const artist = await storage.getArtist(artistId);
            if (artist) {
              // Check if we already sent an email for this specific invoice
              const alreadySent = await hasEmailBeenSent(
                artistId,
                'payment_failed',
                { invoiceId: invoice.id, subscriptionId: subscription.id }
              );

              if (!alreadySent) {
                console.log(`[WARN][PAYMENT_FAILED] Sending payment failed email to ${artist.email} for ${tier} subscription (invoice: ${invoice.id})`);
                await emailService.sendPaymentFailed(
                  artist.email,
                  artist.artistName,
                  artistId,
                  tier,
                  subscription.id,
                  invoice.id
                ).catch((error) => {
                  console.error(`[ERROR][PAYMENT_FAILED_EMAIL] Failed to send payment failed notification: ${error.message}`);
                });
              } else {
                console.log(`[INFO][PAYMENT_FAILED] Email already sent for invoice ${invoice.id}, skipping duplicate`);
              }
            }
          }
        }
        break;
      }
    }
  }

  async getSubscriptionDetails(artistId: string) {
    const artist = await storage.getArtist(artistId);
    
    // Defensive: If artist not found in database, return Free tier as default
    // This prevents breaking the subscription flow when session/storage has data drift
    if (!artist) {
      console.warn(`[WARN][SUBSCRIPTION_ARTIST_NOT_FOUND] artistId=${artistId} - returning Free tier default`);
      return {
        tier: 'free',
        status: 'active',
        features: ['Upload up to 20 artworks', '30% royalty rate', 'Basic profile'],
        cancelAtPeriodEnd: false
      };
    }

    if (!artist.stripeSubscriptionId) {
      return {
        tier: 'free',
        status: 'active',
        features: ['20 artwork limit', '30% base royalty'],
        cancelAtPeriodEnd: false
      };
    }

    const subscription = await stripe.subscriptions.retrieve(artist.stripeSubscriptionId);
    const tier = subscription.metadata?.tier as SubscriptionTier;
    const config = tier === 'pro' ? SUBSCRIPTION_CONFIG.pro : SUBSCRIPTION_CONFIG.elite;

    const periodEnd = typeof subscription.current_period_end === 'number'
      ? new Date(subscription.current_period_end * 1000)
      : new Date();

    return {
      tier: artist.subscriptionTier || tier,
      status: subscription.status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      features: config.features,
      priceMonthly: config.priceMonthly / 100
    };
  }
}

export const subscriptionService = new SubscriptionService();
