import Stripe from "stripe";
import { storage } from "../storage";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

export type SubscriptionTier = 'free' | 'pro' | 'elite';

const SUBSCRIPTION_CONFIG = {
  pro: {
    priceMonthly: 1500,
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
    name: string
  ): Promise<{ subscriptionId: string; clientSecret: string }> {
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    if (artist.stripeSubscriptionId) {
      const existingSub = await stripe.subscriptions.retrieve(artist.stripeSubscriptionId);
      if (existingSub.status === 'active') {
        throw new Error('Artist already has an active subscription');
      }
    }

    const customerId = await this.getOrCreateStripeCustomer(artistId, email, name);

    const config = SUBSCRIPTION_CONFIG[tier];
    
    const product = await stripe.products.create({
      name: config.name,
      metadata: { tier }
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: config.priceMonthly,
      currency: 'usd',
      recurring: { interval: 'month' }
    });

    const subscription: any = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        artistId,
        tier
      }
    });

    const latestInvoice: any = subscription.latest_invoice;
    const paymentIntent: any = latestInvoice.payment_intent;

    await storage.updateArtist(artistId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionTier: tier,
      subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000) as any
    });

    return {
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret!
    };
  }

  async upgradeSubscription(artistId: string, newTier: 'pro' | 'elite'): Promise<void> {
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    if (!artist.stripeSubscriptionId) {
      throw new Error('No active subscription to upgrade');
    }

    const subscription = await stripe.subscriptions.retrieve(artist.stripeSubscriptionId);
    
    const config = SUBSCRIPTION_CONFIG[newTier];
    
    const product = await stripe.products.create({
      name: config.name,
      metadata: { tier: newTier }
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: config.priceMonthly,
      currency: 'usd',
      recurring: { interval: 'month' }
    });

    await stripe.subscriptions.update(artist.stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: price.id,
      }],
      proration_behavior: 'create_prorations',
      metadata: {
        tier: newTier
      }
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
        const subscription: any = event.data.object;
        const artistId = subscription.metadata.artistId;
        const tier = subscription.metadata.tier as SubscriptionTier;

        await storage.updateArtist(artistId, {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionTier: tier,
          subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000) as any
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const artistId = subscription.metadata.artistId;

        await storage.updateArtist(artistId, {
          subscriptionStatus: 'canceled',
          subscriptionTier: 'free'
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice: any = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const artistId = subscription.metadata.artistId;

          await storage.updateArtist(artistId, {
            subscriptionStatus: 'active',
            subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000) as any
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice: any = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const artistId = subscription.metadata.artistId;

          await storage.updateArtist(artistId, {
            subscriptionStatus: 'past_due'
          });
        }
        break;
      }
    }
  }

  async getSubscriptionDetails(artistId: string) {
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      throw new Error('Artist not found');
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
    const tier = subscription.metadata.tier as SubscriptionTier;
    const config = tier === 'pro' ? SUBSCRIPTION_CONFIG.pro : SUBSCRIPTION_CONFIG.elite;

    return {
      tier: artist.subscriptionTier || tier,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      features: config.features,
      priceMonthly: config.priceMonthly / 100
    };
  }
}

export const subscriptionService = new SubscriptionService();
