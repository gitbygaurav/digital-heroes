import Stripe from "stripe";
import type {
  CheckoutSessionResult,
  CreateCheckoutSessionParams,
  PaymentProvider,
  VerifiedWebhookEvent,
} from "@/lib/payments/provider";

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }
  return new Stripe(secretKey);
}

/**
 * Stripe Checkout + Webhook adapter implementing PaymentProvider (Decision D3).
 * Note: For Stripe Checkout, unit_amount is already GST/VAT-inclusive per Decision D1.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";

  async createCheckoutSession(
    params: CreateCheckoutSessionParams
  ): Promise<CheckoutSessionResult> {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: params.customerEmail,
      client_reference_id: params.orderId,
      metadata: {
        order_id: params.orderId,
        order_number: params.orderNumber,
      },
      line_items: params.lineItems.map((item) => ({
        price_data: {
          currency: params.currency.toLowerCase(),
          product_data: {
            name: item.name,
            description: item.description,
          },
          unit_amount: item.unitAmountMinor,
        },
        quantity: item.quantity,
      })),
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    if (!session.url) {
      throw new Error("Stripe Checkout Session did not return a redirect URL.");
    }

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  }

  async verifyWebhook(
    rawBody: string,
    signatureHeader: string
  ): Promise<VerifiedWebhookEvent> {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable.");
    }

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      webhookSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        type: "checkout.completed",
        sessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
        orderId: session.metadata?.order_id ?? session.client_reference_id ?? undefined,
      };
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        type: "checkout.expired",
        sessionId: session.id,
        orderId: session.metadata?.order_id ?? session.client_reference_id ?? undefined,
      };
    }

    return { type: "ignored" };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return new StripePaymentProvider();
}
