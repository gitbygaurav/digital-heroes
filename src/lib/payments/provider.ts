/**
 * Swappable PaymentProvider interface (Decision D3).
 * Stripe Checkout + webhooks is the primary implementation;
 * Razorpay is provided as a documented stub.
 */

export interface CheckoutLineItem {
  name: string;
  description?: string;
  unitAmountMinor: number; // integer minor units (paise/pence)
  quantity: number;
}

export interface CreateCheckoutSessionParams {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  currency: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
}

export interface VerifiedWebhookEvent {
  type: "checkout.completed" | "checkout.expired" | "payment.failed" | "ignored";
  sessionId?: string;
  paymentIntentId?: string;
  orderId?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(
    params: CreateCheckoutSessionParams
  ): Promise<CheckoutSessionResult>;
  verifyWebhook(
    rawBody: string,
    signatureHeader: string
  ): Promise<VerifiedWebhookEvent>;
}
