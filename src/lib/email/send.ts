import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/pricing/engine";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  template: string;
  orderId?: string;
}

async function sendAndLogEmail(params: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Digital Heroes <noreply@digitalheroes.co.in>";
  let status = "sent";
  let errorMsg: string | null = null;

  if (!apiKey) {
    status = "skipped_no_api_key";
  } else {
    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        status = "failed";
        errorMsg = error.message;
      }
    } catch (err) {
      status = "failed";
      errorMsg = err instanceof Error ? err.message : "Unknown email error";
    }
  }

  try {
    const admin = createAdminClient();
    await admin.from("email_log").insert({
      to_email: params.to,
      template: params.template,
      order_id: params.orderId ?? null,
      status,
      error: errorMsg,
    });
  } catch {
    // Non-fatal if email_log insert fails in local mode
  }
}

export async function sendOrderConfirmationEmail(params: {
  to: string;
  customerName: string;
  orderNumber: string;
  orderId: string;
  totalMinor: number;
  currencySymbol: string;
}) {
  const formattedTotal = formatMoney(params.totalMinor, params.currencySymbol);
  await sendAndLogEmail({
    to: params.to,
    subject: `Order Confirmed — ${params.orderNumber}`,
    template: "order_confirmation",
    orderId: params.orderId,
    html: `
      <div style="font-family: sans-serif; color: #0B0B1A; max-width: 560px;">
        <h2>Order ${params.orderNumber} Confirmed</h2>
        <p>Hi ${params.customerName},</p>
        <p>Thank you for your order with <strong>Digital Heroes Print House</strong>.</p>
        <p><strong>Total Paid (GST-inclusive):</strong> ${formattedTotal}</p>
        <p>Next step: submit or approve your artwork proof inside your Customer Dashboard.</p>
      </div>
    `,
  });
}

export async function sendOrderStatusEmail(params: {
  to: string;
  orderNumber: string;
  orderId: string;
  newStatus: string;
  note?: string;
}) {
  await sendAndLogEmail({
    to: params.to,
    subject: `Order ${params.orderNumber} updated: ${params.newStatus.toUpperCase()}`,
    template: "order_status_update",
    orderId: params.orderId,
    html: `
      <div style="font-family: sans-serif; color: #0B0B1A; max-width: 560px;">
        <h2>Order ${params.orderNumber} Status Update</h2>
        <p>Your order has moved to: <strong>${params.newStatus.toUpperCase()}</strong></p>
        ${params.note ? `<p>Note: ${params.note}</p>` : ""}
      </div>
    `,
  });
}

export async function sendProofNotificationEmail(params: {
  to: string;
  orderNumber: string;
  orderId: string;
  version: number;
  event: "proof_ready" | "changes_requested" | "proof_approved";
  message?: string;
}) {
  const titles: Record<typeof params.event, string> = {
    proof_ready: `Proof v${params.version} Ready for Review — ${params.orderNumber}`,
    changes_requested: `Revision Requested on Proof v${params.version} — ${params.orderNumber}`,
    proof_approved: `Proof v${params.version} Approved — ${params.orderNumber}`,
  };

  await sendAndLogEmail({
    to: params.to,
    subject: titles[params.event],
    template: params.event,
    orderId: params.orderId,
    html: `
      <div style="font-family: sans-serif; color: #0B0B1A; max-width: 560px;">
        <h2>${titles[params.event]}</h2>
        <p>Order: <strong>${params.orderNumber}</strong> · Proof Version: <strong>v${params.version}</strong></p>
        ${params.message ? `<p>Message: ${params.message}</p>` : ""}
      </div>
    `,
  });
}
