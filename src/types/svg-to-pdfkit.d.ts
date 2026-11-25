declare module "svg-to-pdfkit" {
  import type PDFDocument from "pdfkit";

  export interface SVGtoPDFOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    useCSS?: boolean;
    assumePt?: boolean;
  }

  export default function SVGtoPDF(
    doc: InstanceType<typeof PDFDocument>,
    svg: string | SVGElement,
    x?: number,
    y?: number,
    options?: SVGtoPDFOptions
  ): void;
}
