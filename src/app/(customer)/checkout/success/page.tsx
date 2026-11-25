import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2 } from "lucide-react";

async function SuccessContent({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border-ink bg-paper-elevated p-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-accent-deep" />
      <h1 className="mt-4 font-display text-3xl font-bold text-ink">
        Payment Confirmed
      </h1>
      {order && (
        <p className="mt-2 font-mono text-sm font-semibold text-copper">
          Order {order}
        </p>
      )}
      <p className="mt-3 text-sm text-muted-ink">
        Your order is now in the Digital Heroes production pipeline and your
        GST-inclusive invoice has been generated.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  return (
    <Suspense fallback={<div className="py-12 text-center font-mono text-xs">Loading...</div>}>
      <SuccessContent searchParams={searchParams} />
    </Suspense>
  );
}
