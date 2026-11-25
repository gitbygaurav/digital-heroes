# Digital Heroes — Database Schema Documentation

> **Database:** Supabase (PostgreSQL)  
> **Conventions:** All tables have `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, and **Row Level Security (RLS) enabled**. All monetary amounts are stored as **integer minor units** (paise / pence).

---

## Phase 1 — Identity, Settings & Audit

### `accounts`
Supports individual customers now and corporate/multi-account ordering in the future.
- `id` (`uuid`, PK)
- `name` (`text`, not null)
- `type` (`text`, check `in ('individual', 'corporate')`, default `'individual'`)
- `created_at`, `updated_at` (`timestamptz`)
- **RLS:** Users can read their own linked account; admins have full access.

### `profiles`
Extends `auth.users`.
- `id` (`uuid`, PK, FK → `auth.users.id` ON DELETE CASCADE)
- `email` (`text`, not null)
- `full_name` (`text`)
- `phone` (`text`)
- `company` (`text`)
- `role` (`text`, check `in ('customer', 'admin')`, not null, default `'customer'`)
- `account_id` (`uuid`, nullable FK → `accounts.id`)
- `created_at`, `updated_at` (`timestamptz`)
- **Security:** A `BEFORE UPDATE` trigger prevents non-admin users from modifying `role` (Decision D16). Signup trigger (`handle_new_user`) always creates `role = 'customer'` and provisions an individual `accounts` row.
- **RLS:** User can read/update own row; admin can read/update all rows.

### `settings`
Key/value platform configuration (currency, tax label/rate/inclusive flag, company details, accounting flags).
- `key` (`text`, unique, not null)
- `value` (`jsonb`, not null)
- `description` (`text`)
- **RLS:** Public read for safe keys (`pricing_config`, `company_public`), admin full access.

### `audit_log`
Immutable operational audit trail.
- `actor_id` (`uuid`, nullable FK → `profiles.id`)
- `action` (`text`, not null)
- `entity` (`text`, not null)
- `entity_id` (`uuid`)
- `meta` (`jsonb`, default `'{}'::jsonb`)
- **RLS:** Admin read only; server-side inserts via service role.

---

## Phase 2 — Parameter-Driven Catalogue, Pricing & Gallery

### `divisions`
Six production families (`labels-stickers`, `race-event-numbers`, `mtb-boards`, `stamps`, `trophies`, `laser-cut-work`).
- `slug` (`text`, unique), `name` (`text`), `description` (`text`), `hero_image` (`text`), `sort_order` (`int`), `is_active` (`boolean`).
- **RLS:** Public read (`is_active = true`), admin write.

### `products`
Parameter-driven products (one product models many variants; never one SKU per size).
- `division_id` (`uuid`, FK → `divisions.id`), `slug` (`text`, unique), `name` (`text`), `product_type` (`Sticker` \| `RaceNumber` \| `MtbBoard` \| `Stamp` \| `Trophy` \| `LaserCut`), `base_unit_price` (`int`), `setup_fee` (`int`), `min_qty` (`int`), `max_qty` (`int`), `bleed_mm` (`numeric`), `output_dpi` (`int`), `config_schema` (`jsonb`), `is_active` (`boolean`).
- **RLS:** Public read (`is_active = true`), admin write.

### `product_parameters` & `product_parameter_options`
- `product_parameters`: `product_id`, `key`, `label`, `type` (`number_range` \| `select` \| `boolean` \| `text`), `min_val`, `max_val`, `step_val`, `default_value`, `sort_order`.
- `product_parameter_options`: `parameter_id`, `value`, `label`, `price_multiplier`, `price_add` (`int`), `is_active`.
- **RLS:** Public read (active), admin write.

### `size_rules`
Dynamic millimetre bounds (`min_width_mm`, `max_width_mm`, `min_height_mm`, `max_height_mm`, `default_width_mm`, `default_height_mm`, `allowed_shapes` `text[]`, `area_rate_per_cm2` `int`).

### `volume_discount_tiers`
- `product_id` (`uuid`, nullable = global fallback), `min_qty` (`int`), `discount_percent` (`numeric`).

### `gallery_items`
- `division_id` (`uuid`, FK → `divisions.id`), `title`, `image_url`, `description`, `sort_order`, `is_active`.

---

## Phase 3 — Cart, Quotes, Orders, Invoices & Email Log

### `carts` & `cart_items`
- `carts`: `owner_id` (unique FK → `profiles.id`), `account_id`.
- `cart_items`: `cart_id`, `product_id`, `design_id` (nullable), `config` (`jsonb`), `quantity`.
- **RLS:** Owner manages own cart and items; admin full access.

### `quotes`
- Saved priced configuration drafts (`owner_id`, `product_id`, `config`, `price_breakdown`, `expires_at`, `converted_order_id`).

### `orders`, `order_items` & `order_status_history`
- `orders`: sequential `order_number` (`DH-000001`), `owner_id`, `account_id`, `status` (`quote` \| `order` \| `artwork` \| `proof` \| `production` \| `completed` \| `cancelled`), `subtotal`, `discount_total`, `tax_total`, `total` (integer minor units), `currency`, `tax_rate`, `tax_inclusive`, `payment_status`, `stripe_session_id`, `stripe_payment_intent`, `proof_approved`, `files_unlocked` (generated from `proof_approved`), `reorder_of`, `notes`, `archived_at`.
- `order_items`: `order_id`, `product_id`, `design_id`, `config`, `quantity`, `unit_price`, `discount_percent`, `line_total`, `csv_job_id`.
- `order_status_history`: `order_id`, `from_status`, `to_status`, `changed_by`, `note`.

### `invoices` & `email_log`
- `invoices`: `order_id` (unique), sequential `invoice_number` (`INV-000001`), `pdf_path`, `issued_at`.
- `email_log`: `to_email`, `template`, `order_id`, `status`, `error`.

---

## Phase 4 — Templates, Designer & Uploads

### `fonts`, `templates`, `print_areas`, `template_placeholders`
- `fonts`: bundled/stored font families (`Space Grotesk`, `Inter`, `JetBrains Mono`).
- `templates`: linked to `products`, with `width_mm`, `height_mm`, `bleed_mm`, `scene_json`.
- `print_areas`: `template_id`, `x_mm`, `y_mm`, `width_mm`, `height_mm`, `shape` (`rect` \| `ellipse` \| `path`), `safe_margin_mm`.
- `template_placeholders`: `key`, `type` (`text` \| `image`), `fit_mode` (`shrink_to_fit` \| `none`), `min_font_pt`, `max_font_pt`, `min_tracking`, `max_tracking`, `align`, `colour`.

### `designs` & `uploads`
- `designs`: `owner_id`, `account_id`, `product_id`, `template_id`, `name`, `config`, `scene_json`, `source` (`designer` \| `upload`), `is_approved`, `approved_at`, `last_used_at`.
- `uploads`: `owner_id`, `design_id`, `storage_path`, `file_name`, `mime`, `size_bytes`, `status` (`pending` \| `ok` \| `needs_review` \| `rejected`).
- **Storage:** Private `uploads` bucket (owner read/write own folder).

---

## Phase 5 — Versioned Proofs, Approval Logs & Change Requests

### `proofs`, `proof_approvals` & `change_requests`
- `proofs`: `order_item_id`, `version` (`1, 2, 3...`), `file_path`, `scene_snapshot` (`jsonb`), `status` (`pending` \| `approved` \| `changes_requested` \| `superseded`), `created_by`, unique `(order_item_id, version)`.
- `proof_approvals`: immutable audit log (`proof_id`, `approved_by`, `approved_at`, `ip`, `user_agent`).
- `change_requests`: `proof_id`, `requested_by`, `message`, `status` (`open` \| `resolved`), `resolved_by`.
- **Storage:** Private `proofs` bucket (owner read).
- **Approval Gate:** `/api/print-files/[orderId]` enforces `order.proof_approved = true` server-side (HTTP 403 before approval).

---

## Phase 6 — Print Files & CSV Variable-Data Jobs

### `print_files` & `csv_jobs`
- `print_files`: `order_item_id`, `proof_id`, `kind` (`pdf` \| `png` \| `csv_row` \| `zip`), `storage_path`, `file_name` (`OrderID_ProductType_Date_Output[_0001].ext`), `width_px`, `height_px`, `dpi`, `bleed_mm`, `row_index`.
- `csv_jobs`: `order_item_id`, `source_path`, `total_rows`, `processed_rows`, `status` (`queued` \| `running` \| `done` \| `failed`), `error_report` (`jsonb`), `zip_path`.
- **RLS & Storage:** Strict admin-only access on `print_files`, `csv_jobs`, and `print-files` storage bucket (§5.9).
