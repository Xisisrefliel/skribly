import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { d1Service } from '../services/d1.js';

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN || '',
  server: process.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production',
});

const router: RouterType = Router();

router.post('/billing/checkout', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const productId = process.env.POLAR_PRODUCT_ID;
    const successUrl = process.env.POLAR_SUCCESS_URL;

    if (!process.env.POLAR_ACCESS_TOKEN || !productId || !successUrl) {
      res.status(500).json({
        error: 'Billing configuration missing',
        message: 'POLAR_ACCESS_TOKEN, POLAR_PRODUCT_ID, or POLAR_SUCCESS_URL is not set',
      });
      return;
    }

    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl,
      externalCustomerId: userId,
      customerEmail: req.user?.email,
      customerName: req.user?.name,
      metadata: {
        userId,
      },
    });

    res.json({ url: checkout.url });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      error: 'Failed to create checkout',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/billing/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const subscription = await d1Service.getSubscriptionByUser(userId);
    const isActive = await d1Service.isSubscriptionActive(userId);
    const transcriptionCount = await d1Service.getTranscriptionCountByUser(userId);
    const freeLimit = 3;

    res.json({
      isActive,
      status: subscription?.status || null,
      currentPeriodEnd: subscription?.current_period_end || null,
      cancelAtPeriodEnd: subscription ? Boolean(subscription.cancel_at_period_end) : false,
      transcriptionCount,
      freeLimit,
      hasFreeTierAvailable: !isActive && transcriptionCount < freeLimit,
    });
  } catch (error) {
    console.error('Get billing status error:', error);
    res.status(500).json({
      error: 'Failed to fetch billing status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/billing/portal', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const returnUrl = process.env.POLAR_PORTAL_RETURN_URL || 'https://notism.one/';

    if (!process.env.POLAR_ACCESS_TOKEN) {
      res.status(500).json({
        error: 'Billing configuration missing',
        message: 'POLAR_ACCESS_TOKEN is not set',
      });
      return;
    }

    const session = await polar.customerSessions.create({
      externalCustomerId: userId,
      returnUrl,
    });

    res.json({ url: session.customerPortalUrl });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({
      error: 'Failed to create customer portal session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export async function handleBillingWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    const headers = {
      'webhook-id': req.header('webhook-id') || '',
      'webhook-timestamp': req.header('webhook-timestamp') || '',
      'webhook-signature': req.header('webhook-signature') || '',
    };

    const event = validateEvent(rawBody, headers, webhookSecret);

    switch (event.type) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.active':
      case 'subscription.canceled':
      case 'subscription.uncanceled':
      case 'subscription.revoked': {
        const subscription = event.data;
        const userId = subscription.customer.externalId || String(subscription.metadata?.userId || '');

        if (!userId) {
          res.status(400).json({ error: 'Missing user mapping for subscription' });
          return;
        }

        await d1Service.upsertSubscription({
          userId,
          subscriptionId: subscription.id,
          customerId: subscription.customerId,
          productId: subscription.productId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        });
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (error instanceof WebhookVerificationError) {
      res.status(400).json({ error: 'Invalid webhook signature', message });
      return;
    }

    console.error('Webhook handling error:', error);
    res.status(400).json({ error: 'Webhook handling failed', message });
  }
}

export { router as billingRouter };
