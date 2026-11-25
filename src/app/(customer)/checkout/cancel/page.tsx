import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border-ink bg-paper-elevated p-8 text-center">
      <AlertCircle className="mx-auto h-12 w-12 text-copper" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">
        Checkout Cancelled
      </h1>
      <p className="mt-2 text-sm text-muted-ink">
        No charge was made. Your items remain safely in your cart.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/cart"
          className="rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
        >
          Return to Cart
        </Link>
      </div>
    </div>
  );
}
