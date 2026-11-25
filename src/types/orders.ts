import { z } from "zod";
import { priceConfigInputSchema } from "@/types/catalogue";

export type OrderStatus =
  | "quote"
  | "order"
  | "artwork"
  | "proof"
  | "production"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface CartItemRecord {
  id: string;
  cart_id: string;
  product_id: string;
  design_id: string | null;
  config: z.infer<typeof priceConfigInputSchema>;
  quantity: number;
  created_at: string;
}

export interface OrderRecord {
  id: string;
  order_number: string;
  owner_id: string;
  account_id: string | null;
  status: OrderStatus;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  currency: string;
  tax_rate: number;
  tax_inclusive: boolean;
  payment_status: PaymentStatus;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  proof_approved: boolean;
  files_unlocked: boolean;
  reorder_of: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  product_id: string;
  design_id: string | null;
  config: z.infer<typeof priceConfigInputSchema>;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  line_total: number;
  csv_job_id: string | null;
}

export interface InvoiceRecord {
  id: string;
  order_id: string;
  invoice_number: string;
  pdf_path: string;
  issued_at: string;
}

export const addToCartSchema = z.object({
  product_id: z.string().uuid().or(z.string().min(1)),
  design_id: z.string().uuid().nullable().optional(),
  config: priceConfigInputSchema,
});

export const checkoutRequestSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});
