# Digital Heroes — Web-to-Print Platform

Custom, subscription-free, transactional web-to-print platform for a 6-division print house:
1. **Labels & Stickers**
2. **Race & Event Numbers**
3. **MTB Boards**
4. **Stamps**
5. **Trophies**
6. **Laser-Cut Work**

## Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript (`strict: true`), Framer Motion
- **Designer:** Fabric.js v6 (client) + normalized Scene JSON in millimetres
- **Server Print Engine:** `@resvg/resvg-js` (PNG at target DPI), `pdfkit` + `svg-to-pdfkit` (vector PDF with bleed), `papaparse` (CSV validation), `archiver` (ZIP packaging)
- **Backend & DB:** Supabase (PostgreSQL, Auth, Storage, Row Level Security)
- **Payments & Email:** Stripe Checkout + idempotent webhooks (`PaymentProvider` interface), Resend
- **Testing:** Vitest

## Setup & Deployment Steps
1. **Create a new Supabase project** (do not reuse an existing personal project).
2. **Apply SQL migrations** in `supabase/migrations/` in numeric order (`0001` → `0006`):
   - `0001_foundation_identity.sql`
   - `0002_catalogue_pricing.sql`
   - `0003_cart_orders_invoices.sql`
   - `0004_designer_templates_uploads.sql`
   - `0005_proofs_approval_gate.sql`
   - `0006_print_files_csv_jobs.sql`
3. **Run seed scripts** in order:
   - `supabase/seed.sql` (settings + demo admin & customers)
   - `supabase/seed_catalogue.sql` (6 divisions, parameter-driven products, discount tiers)
   - `supabase/seed_orders_demo.sql` (sample orders across all pipeline stages + proof v1→v2 history)
4. **Configure environment variables:** Copy `.env.example` to `.env.local` and fill in your Supabase, Stripe, and Resend keys. Never commit `.env.local`.
5. **Run locally:**
   ```bash
   npm install
   npm run dev
   ```
6. **Deploy to a new Vercel account:** Connect the repository, add all `.env.example` variables in Vercel Project Settings, and set `NEXT_PUBLIC_SITE_URL` to your live Vercel URL.

## Demo Credentials (from `supabase/seed.sql`)
- **Admin:** `admin@demo.test` / `DemoAdmin#2026`
- **Customer 1:** `customer1@demo.test` / `DemoCust1#2026`
- **Customer 2:** `customer2@demo.test` / `DemoCust2#2026`

## Automated Verification
```bash
npm run lint
npm test
npm run build
```

## Documentation
- [Database Schema](docs/SCHEMA.md)
- [Decision Log](docs/DECISIONS.md) (D1–D16 + Phase 1–9 notes; includes D9 note on "Scope / configuration of saved designs")
- [Sample Race Numbers CSV](public/samples/race-numbers-sample.csv)
