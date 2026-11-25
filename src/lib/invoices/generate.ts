import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/pricing/engine";

export interface InvoicePdfInput {
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: string;
  customerName: string;
  customerEmail: string;
  companyName?: string | null;
  currencySymbol: string;
  taxLabel: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  subtotal: number;
  taxTotal: number;
  total: number;
  items: Array<{
    name: string;
    specs: string;
    quantity: number;
    lineTotal: number;
  }>;
}

/**
 * Generates a GST/VAT-inclusive PDF invoice buffer on the server using pdfkit.
 */
export async function generateInvoicePdfBuffer(
  input: InvoicePdfInput
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc
      .fontSize(20)
      .fillColor("#0B0B1A")
      .text("DIGITAL HEROES PRINT HOUSE", { align: "left" });
    doc
      .fontSize(10)
      .fillColor("#4F4F5E")
      .text("Precision Web-to-Print · Bengaluru, India")
      .moveDown(1);

    doc
      .fontSize(14)
      .fillColor("#0B0B1A")
      .text(`TAX INVOICE: ${input.invoiceNumber}`)
      .fontSize(10)
      .fillColor("#4F4F5E")
      .text(`Order: ${input.orderNumber}`)
      .text(`Issued: ${new Date(input.issuedAt).toLocaleDateString("en-IN")}`)
      .moveDown(1);

    // Bill To
    doc
      .fontSize(10)
      .fillColor("#0B0B1A")
      .text("Billed To:", { underline: true })
      .text(input.customerName)
      .text(input.customerEmail);
    if (input.companyName) {
      doc.text(input.companyName);
    }
    doc.moveDown(1.5);

    // Line items
    doc
      .fontSize(10)
      .fillColor("#0B0B1A")
      .text("Item", 48, doc.y, { continued: true, width: 260 })
      .text("Qty", 320, doc.y, { continued: true, width: 60 })
      .text("Amount", 400, doc.y, { align: "right" });
    doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).stroke("#D5CDBC");
    doc.moveDown(0.8);

    for (const item of input.items) {
      const startY = doc.y;
      doc
        .fontSize(10)
        .fillColor("#0B0B1A")
        .text(item.name, 48, startY, { width: 250 });
      doc
        .fontSize(8)
        .fillColor("#4F4F5E")
        .text(item.specs, 48, doc.y, { width: 250 });

      doc
        .fontSize(10)
        .fillColor("#0B0B1A")
        .text(String(item.quantity), 320, startY, { width: 60 })
        .text(
          formatMoney(item.lineTotal, input.currencySymbol),
          400,
          startY,
          { align: "right" }
        );
      doc.moveDown(1);
    }

    doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).stroke("#D5CDBC");
    doc.moveDown(1);

    // Totals
    doc
      .fontSize(10)
      .fillColor("#4F4F5E")
      .text(
        `Included ${input.taxLabel} (${input.taxRatePercent}%): ${formatMoney(
          input.taxTotal,
          input.currencySymbol
        )}`,
        { align: "right" }
      );
    doc
      .fontSize(13)
      .fillColor("#0B0B1A")
      .text(
        `Total Paid (${input.taxInclusive ? `${input.taxLabel}-inclusive` : "Total"}): ${formatMoney(
          input.total,
          input.currencySymbol
        )}`,
        { align: "right" }
      );

    doc.end();
  });
}
