import { describe, expect, it } from "vitest";
import { generateInvoicePdfBuffer } from "@/lib/invoices/generate";
import { addToCartSchema } from "@/types/orders";

describe("Checkout & Invoice generation", () => {
  it("generates a valid PDF buffer starting with %PDF-", async () => {
    const buffer = await generateInvoicePdfBuffer({
      invoiceNumber: "INV-001001",
      orderNumber: "DH-001001",
      issuedAt: "2026-11-25T00:00:00Z",
      customerName: "Aarav Sharma",
      customerEmail: "customer1@demo.test",
      companyName: "TrailBlaze Events",
      currencySymbol: "₹",
      taxLabel: "GST",
      taxRatePercent: 18,
      taxInclusive: true,
      subtotal: 108750,
      taxTotal: 16589,
      total: 108750,
      items: [
        {
          name: "Custom Die-Cut Stickers",
          specs: "100×100 mm · rect",
          quantity: 50,
          lineTotal: 108750,
        },
      ],
    });

    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("validates addToCartSchema without trusting client prices", () => {
    const parsed = addToCartSchema.safeParse({
      product_id: "22222222-2222-2222-2222-222222222201",
      config: {
        width_mm: 75,
        height_mm: 75,
        shape: "rect",
        quantity: 100,
        selectedOptions: { material: "white_vinyl", finish: "matte" },
      },
      total: 1, // must be stripped by Zod
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("total" in parsed.data).toBe(false);
    }
  });
});
