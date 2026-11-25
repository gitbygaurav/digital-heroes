import type {
  CheckoutSessionResult,
  PaymentProvider,
  VerifiedWebhookEvent,
} from "@/lib/payments/provider";

/**
 * Documented Razorpay stub implementing PaymentProvider (Decision D3).
 * Allows swapping Stripe -> Razorpay for Indian accounts without changing checkout callers.
 */
export class RazorpayPaymentProviderStub implements PaymentProvider {
  readonly name = "razorpay";

  async createCheckoutSession(): Promise<CheckoutSessionResult> {
    throw new Error(
      "RazorpayPaymentProviderStub is a documented placeholder. Configure STRIPE_SECRET_KEY or implement Razorpay Orders API."
    );
  }

  async verifyWebhook(): Promise<VerifiedWebhookEvent> {
    throw new Error("Razorpay webhook verification not yet enabled.");
  }
}
