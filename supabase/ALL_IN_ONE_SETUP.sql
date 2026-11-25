-- === supabase\migrations\0001_foundation_identity.sql ===
-- ============================================================================
-- Phase 1: Foundation â€” Identity, Accounts, Settings, Audit Log & RLS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. accounts (individual now, corporate/multi-account ready)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  type       text NOT NULL DEFAULT 'individual' CHECK (type IN ('individual', 'corporate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  full_name  text,
  phone      text,
  company    text,
  role       text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_account_id ON public.profiles(account_id);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current authenticated user is admin (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Prevent non-admin users from changing their own role (Decision D16)
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- Auto-create individual account + customer profile on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_full_name  text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.accounts (name, type)
  VALUES (v_full_name, 'individual')
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (id, email, full_name, phone, company, role, account_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'company',
    'customer',
    v_account_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- RLS policies for accounts
DROP POLICY IF EXISTS "Users can view own account" ON public.accounts;
CREATE POLICY "Users can view own account"
  ON public.accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.account_id = accounts.id
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage accounts" ON public.accounts;
CREATE POLICY "Admins manage accounts"
  ON public.accounts FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. settings (key/value configuration: currency, tax, company details)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  is_public   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read public settings" ON public.settings;
CREATE POLICY "Public can read public settings"
  ON public.settings FOR SELECT
  USING (is_public = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage settings" ON public.settings;
CREATE POLICY "Admins manage settings"
  ON public.settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  uuid,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.audit_log;
CREATE POLICY "Admins read audit log"
  ON public.audit_log FOR SELECT
  USING (public.is_admin());


-- === supabase\migrations\0002_catalogue_pricing.sql ===
-- ============================================================================
-- Phase 2: Parameter-Driven Catalogue, Pricing Rules & Gallery
-- ============================================================================

-- 1. divisions (6 product families)
CREATE TABLE IF NOT EXISTS public.divisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  hero_image  text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_divisions_updated_at ON public.divisions;
CREATE TRIGGER trg_divisions_updated_at
  BEFORE UPDATE ON public.divisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active divisions" ON public.divisions;
CREATE POLICY "Public can read active divisions"
  ON public.divisions FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage divisions" ON public.divisions;
CREATE POLICY "Admins manage divisions"
  ON public.divisions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. products (parameter-driven: one product models many variants)
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id     uuid NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  product_type    text NOT NULL CHECK (
    product_type IN ('Sticker', 'RaceNumber', 'MtbBoard', 'Stamp', 'Trophy', 'LaserCut')
  ),
  base_unit_price int NOT NULL DEFAULT 0 CHECK (base_unit_price >= 0), -- integer minor units
  setup_fee       int NOT NULL DEFAULT 0 CHECK (setup_fee >= 0),       -- integer minor units
  min_qty         int NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  max_qty         int NOT NULL DEFAULT 10000 CHECK (max_qty >= min_qty),
  bleed_mm        numeric(6,2) NOT NULL DEFAULT 3.0,
  output_dpi      int NOT NULL DEFAULT 300 CHECK (output_dpi >= 72),
  config_schema   jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_division ON public.products(division_id);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active products" ON public.products;
CREATE POLICY "Public can read active products"
  ON public.products FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
  ON public.products FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. product_parameters
CREATE TABLE IF NOT EXISTS public.product_parameters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  type          text NOT NULL CHECK (type IN ('number_range', 'select', 'boolean', 'text')),
  min_val       numeric(10,2),
  max_val       numeric(10,2),
  step_val      numeric(10,2),
  default_value text,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, key)
);

CREATE INDEX IF NOT EXISTS idx_product_parameters_product ON public.product_parameters(product_id);

DROP TRIGGER IF EXISTS trg_product_parameters_updated_at ON public.product_parameters;
CREATE TRIGGER trg_product_parameters_updated_at
  BEFORE UPDATE ON public.product_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_parameters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read parameters of active products" ON public.product_parameters;
CREATE POLICY "Public can read parameters of active products"
  ON public.product_parameters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_parameters.product_id AND p.is_active = true
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage product parameters" ON public.product_parameters;
CREATE POLICY "Admins manage product parameters"
  ON public.product_parameters FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. product_parameter_options
CREATE TABLE IF NOT EXISTS public.product_parameter_options (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id     uuid NOT NULL REFERENCES public.product_parameters(id) ON DELETE CASCADE,
  value            text NOT NULL,
  label            text NOT NULL,
  price_multiplier numeric(8,4) NOT NULL DEFAULT 1.0000,
  price_add        int NOT NULL DEFAULT 0, -- integer minor units
  sort_order       int NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parameter_id, value)
);

CREATE INDEX IF NOT EXISTS idx_param_options_param ON public.product_parameter_options(parameter_id);

DROP TRIGGER IF EXISTS trg_product_parameter_options_updated_at ON public.product_parameter_options;
CREATE TRIGGER trg_product_parameter_options_updated_at
  BEFORE UPDATE ON public.product_parameter_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_parameter_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active parameter options" ON public.product_parameter_options;
CREATE POLICY "Public can read active parameter options"
  ON public.product_parameter_options FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage parameter options" ON public.product_parameter_options;
CREATE POLICY "Admins manage parameter options"
  ON public.product_parameter_options FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. size_rules (dynamic sizing, not pre-listed SKUs)
CREATE TABLE IF NOT EXISTS public.size_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  min_width_mm      numeric(8,2) NOT NULL DEFAULT 20,
  max_width_mm      numeric(8,2) NOT NULL DEFAULT 500,
  min_height_mm     numeric(8,2) NOT NULL DEFAULT 20,
  max_height_mm     numeric(8,2) NOT NULL DEFAULT 500,
  default_width_mm  numeric(8,2) NOT NULL DEFAULT 100,
  default_height_mm numeric(8,2) NOT NULL DEFAULT 60,
  allowed_shapes    text[] NOT NULL DEFAULT ARRAY['rect']::text[],
  area_rate_per_cm2 int NOT NULL DEFAULT 0 CHECK (area_rate_per_cm2 >= 0), -- integer minor units
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_size_rules_updated_at ON public.size_rules;
CREATE TRIGGER trg_size_rules_updated_at
  BEFORE UPDATE ON public.size_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.size_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read size rules" ON public.size_rules;
CREATE POLICY "Public can read size rules"
  ON public.size_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = size_rules.product_id AND p.is_active = true
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage size rules" ON public.size_rules;
CREATE POLICY "Admins manage size rules"
  ON public.size_rules FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. volume_discount_tiers (product_id NULL = global fallback)
CREATE TABLE IF NOT EXISTS public.volume_discount_tiers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid REFERENCES public.products(id) ON DELETE CASCADE,
  min_qty          int NOT NULL CHECK (min_qty >= 1),
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 90),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_tiers_product ON public.volume_discount_tiers(product_id, min_qty);

DROP TRIGGER IF EXISTS trg_volume_discount_tiers_updated_at ON public.volume_discount_tiers;
CREATE TRIGGER trg_volume_discount_tiers_updated_at
  BEFORE UPDATE ON public.volume_discount_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.volume_discount_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read discount tiers" ON public.volume_discount_tiers;
CREATE POLICY "Public can read discount tiers"
  ON public.volume_discount_tiers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage discount tiers" ON public.volume_discount_tiers;
CREATE POLICY "Admins manage discount tiers"
  ON public.volume_discount_tiers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. gallery_items (live work examples, filterable by division)
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
  title       text NOT NULL,
  image_url   text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_items_division ON public.gallery_items(division_id);

DROP TRIGGER IF EXISTS trg_gallery_items_updated_at ON public.gallery_items;
CREATE TRIGGER trg_gallery_items_updated_at
  BEFORE UPDATE ON public.gallery_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active gallery items" ON public.gallery_items;
CREATE POLICY "Public can read active gallery items"
  ON public.gallery_items FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage gallery items" ON public.gallery_items;
CREATE POLICY "Admins manage gallery items"
  ON public.gallery_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- === supabase\migrations\0003_cart_orders_invoices.sql ===
-- ============================================================================
-- Phase 3: Cart, Quotes, Orders, Invoices & Email Log
-- ============================================================================

-- Sequential human-readable order & invoice numbers
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;

-- 1. carts & cart_items (multi-item cart before payment, Decision D11)
CREATE TABLE IF NOT EXISTS public.carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_carts_updated_at ON public.carts;
CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own cart" ON public.carts;
CREATE POLICY "Owner manages own cart"
  ON public.carts FOR ALL
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  design_id  uuid,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity   int NOT NULL CHECK (quantity >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON public.cart_items(cart_id);

DROP TRIGGER IF EXISTS trg_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own cart items" ON public.cart_items;
CREATE POLICY "Owner manages own cart items"
  ON public.cart_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND c.owner_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id AND c.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- 2. quotes (saved priced configuration draft, Decision D4)
CREATE TABLE IF NOT EXISTS public.quotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_breakdown    jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  converted_order_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_quotes_updated_at ON public.quotes;
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads/inserts own quotes" ON public.quotes;
CREATE POLICY "Owner reads/inserts own quotes"
  ON public.quotes FOR SELECT
  USING (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Owner inserts own quotes" ON public.quotes;
CREATE POLICY "Owner inserts own quotes"
  ON public.quotes FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage quotes" ON public.quotes;
CREATE POLICY "Admins manage quotes"
  ON public.quotes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. orders
CREATE TABLE IF NOT EXISTS public.orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          text NOT NULL UNIQUE DEFAULT ('DH-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  owner_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  account_id            uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'quote' CHECK (
    status IN ('quote', 'order', 'artwork', 'proof', 'production', 'completed', 'cancelled')
  ),
  subtotal              int NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total        int NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total             int NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total                 int NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency              text NOT NULL DEFAULT 'INR',
  tax_rate              numeric(5,2) NOT NULL DEFAULT 18.00,
  tax_inclusive         boolean NOT NULL DEFAULT true,
  payment_status        text NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'paid', 'failed', 'refunded')
  ),
  stripe_session_id     text UNIQUE,
  stripe_payment_intent text,
  proof_approved        boolean NOT NULL DEFAULT false,
  files_unlocked        boolean GENERATED ALWAYS AS (proof_approved) STORED,
  reorder_of            uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes                 text,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_owner ON public.orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own orders" ON public.orders;
CREATE POLICY "Owner reads own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Owner inserts own orders" ON public.orders;
CREATE POLICY "Owner inserts own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;
CREATE POLICY "Admins manage all orders"
  ON public.orders FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  design_id        uuid,
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity         int NOT NULL CHECK (quantity >= 1),
  unit_price       int NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total       int NOT NULL CHECK (line_total >= 0),
  csv_job_id       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON public.order_items;
CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own order items" ON public.order_items;
CREATE POLICY "Owner reads own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Owner inserts own order items" ON public.order_items;
CREATE POLICY "Owner inserts own order items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
CREATE POLICY "Admins manage order items"
  ON public.order_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. order_status_history
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own order status history" ON public.order_status_history;
CREATE POLICY "Owner reads own order status history"
  ON public.order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage order status history" ON public.order_status_history;
CREATE POLICY "Admins manage order status history"
  ON public.order_status_history FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  pdf_path       text NOT NULL DEFAULT '',
  issued_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own invoices" ON public.invoices;
CREATE POLICY "Owner reads own invoices"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = invoices.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. email_log
CREATE TABLE IF NOT EXISTS public.email_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email   text NOT NULL,
  template   text NOT NULL,
  order_id   uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status     text NOT NULL DEFAULT 'sent',
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read email log" ON public.email_log;
CREATE POLICY "Admins read email log"
  ON public.email_log FOR SELECT
  USING (public.is_admin());

-- Storage bucket for invoices (private, owner read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;


-- === supabase\migrations\0004_designer_templates_uploads.sql ===
-- ============================================================================
-- Phase 4: Templates, Print Areas, Placeholders, Fonts, Designs & Uploads
-- ============================================================================

-- 1. fonts
CREATE TABLE IF NOT EXISTS public.fonts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family     text NOT NULL UNIQUE,
  file_path  text NOT NULL DEFAULT '',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fonts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active fonts" ON public.fonts;
CREATE POLICY "Public can read active fonts"
  ON public.fonts FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage fonts" ON public.fonts;
CREATE POLICY "Admins manage fonts"
  ON public.fonts FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. templates
CREATE TABLE IF NOT EXISTS public.templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name        text NOT NULL,
  width_mm    numeric(8,2) NOT NULL,
  height_mm   numeric(8,2) NOT NULL,
  bleed_mm    numeric(6,2) NOT NULL DEFAULT 3.0,
  preview_url text,
  scene_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_product ON public.templates(product_id);

DROP TRIGGER IF EXISTS trg_templates_updated_at ON public.templates;
CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active templates" ON public.templates;
CREATE POLICY "Public can read active templates"
  ON public.templates FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage templates" ON public.templates;
CREATE POLICY "Admins manage templates"
  ON public.templates FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. print_areas
CREATE TABLE IF NOT EXISTS public.print_areas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  name           text NOT NULL,
  x_mm           numeric(8,2) NOT NULL DEFAULT 0,
  y_mm           numeric(8,2) NOT NULL DEFAULT 0,
  width_mm       numeric(8,2) NOT NULL,
  height_mm      numeric(8,2) NOT NULL,
  shape          text NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'ellipse', 'path')),
  path_data      text,
  safe_margin_mm numeric(6,2) NOT NULL DEFAULT 3.0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_areas_template ON public.print_areas(template_id);

ALTER TABLE public.print_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read print areas" ON public.print_areas;
CREATE POLICY "Public can read print areas"
  ON public.print_areas FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage print areas" ON public.print_areas;
CREATE POLICY "Admins manage print areas"
  ON public.print_areas FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. template_placeholders
CREATE TABLE IF NOT EXISTS public.template_placeholders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  print_area_id uuid NOT NULL REFERENCES public.print_areas(id) ON DELETE CASCADE,
  key           text NOT NULL,
  type          text NOT NULL CHECK (type IN ('text', 'image')),
  x_mm          numeric(8,2) NOT NULL,
  y_mm          numeric(8,2) NOT NULL,
  width_mm      numeric(8,2) NOT NULL,
  height_mm     numeric(8,2) NOT NULL,
  font_family   text NOT NULL DEFAULT 'Inter',
  default_text  text DEFAULT '',
  fit_mode      text NOT NULL DEFAULT 'shrink_to_fit' CHECK (fit_mode IN ('shrink_to_fit', 'none')),
  min_font_pt   numeric(6,2) NOT NULL DEFAULT 8,
  max_font_pt   numeric(6,2) NOT NULL DEFAULT 72,
  min_tracking  numeric(6,2) NOT NULL DEFAULT -60,
  max_tracking  numeric(6,2) NOT NULL DEFAULT 0,
  align         text NOT NULL DEFAULT 'center',
  colour        text NOT NULL DEFAULT '#0B0B1A',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placeholders_template ON public.template_placeholders(template_id);

ALTER TABLE public.template_placeholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read template placeholders" ON public.template_placeholders;
CREATE POLICY "Public can read template placeholders"
  ON public.template_placeholders FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage template placeholders" ON public.template_placeholders;
CREATE POLICY "Admins manage template placeholders"
  ON public.template_placeholders FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. designs (customer saved artwork & configurations)
CREATE TABLE IF NOT EXISTS public.designs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  template_id   uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  name          text NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  scene_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  source        text NOT NULL DEFAULT 'designer' CHECK (source IN ('designer', 'upload')),
  thumbnail_url text,
  is_approved   boolean NOT NULL DEFAULT false,
  approved_at   timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_designs_owner ON public.designs(owner_id);

DROP TRIGGER IF EXISTS trg_designs_updated_at ON public.designs;
CREATE TRIGGER trg_designs_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads/inserts/updates own designs" ON public.designs;
CREATE POLICY "Owner reads/inserts/updates own designs"
  ON public.designs FOR ALL
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

-- 6. uploads (finished artwork uploads: PDF, SVG, AI, PNG)
CREATE TABLE IF NOT EXISTS public.uploads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  design_id    uuid REFERENCES public.designs(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  mime         text NOT NULL,
  size_bytes   bigint NOT NULL CHECK (size_bytes > 0),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'needs_review', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner ON public.uploads(owner_id);

ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own uploads" ON public.uploads;
CREATE POLICY "Owner manages own uploads"
  ON public.uploads FOR ALL
  USING (auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

-- Storage bucket: uploads (private, owner read/write own folder)
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Seed default fonts
INSERT INTO public.fonts (family, file_path, is_active) VALUES
  ('Space Grotesk', 'bundled:SpaceGrotesk', true),
  ('Inter', 'bundled:Inter', true),
  ('JetBrains Mono', 'bundled:JetBrainsMono', true)
ON CONFLICT (family) DO NOTHING;


-- === supabase\migrations\0005_proofs_approval_gate.sql ===
-- ============================================================================
-- Phase 5: Versioned Proofs, Approval Logs & Change Requests
-- ============================================================================

-- 1. proofs
CREATE TABLE IF NOT EXISTS public.proofs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  version        int NOT NULL CHECK (version >= 1),
  file_path      text NOT NULL DEFAULT '',
  scene_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'changes_requested', 'superseded')
  ),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, version)
);

CREATE INDEX IF NOT EXISTS idx_proofs_order_item ON public.proofs(order_item_id);

DROP TRIGGER IF EXISTS trg_proofs_updated_at ON public.proofs;
CREATE TRIGGER trg_proofs_updated_at
  BEFORE UPDATE ON public.proofs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own proofs" ON public.proofs;
CREATE POLICY "Owner reads own proofs"
  ON public.proofs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = proofs.order_item_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins manage proofs" ON public.proofs;
CREATE POLICY "Admins manage proofs"
  ON public.proofs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. proof_approvals (immutable approval audit log)
CREATE TABLE IF NOT EXISTS public.proof_approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id    uuid NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  approved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proof_approvals_proof ON public.proof_approvals(proof_id);

ALTER TABLE public.proof_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own proof approvals" ON public.proof_approvals;
CREATE POLICY "Owner reads own proof approvals"
  ON public.proof_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proofs p
      JOIN public.order_items oi ON oi.id = p.order_item_id
      JOIN public.orders o ON o.id = oi.order_id
      WHERE p.id = proof_approvals.proof_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Owner inserts own proof approval" ON public.proof_approvals;
CREATE POLICY "Owner inserts own proof approval"
  ON public.proof_approvals FOR INSERT
  WITH CHECK (
    auth.uid() = approved_by AND EXISTS (
      SELECT 1 FROM public.proofs p
      JOIN public.order_items oi ON oi.id = p.order_item_id
      JOIN public.orders o ON o.id = oi.order_id
      WHERE p.id = proof_approvals.proof_id AND o.owner_id = auth.uid()
    )
  );

-- 3. change_requests
CREATE TABLE IF NOT EXISTS public.change_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id     uuid NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_proof ON public.change_requests(proof_id);

DROP TRIGGER IF EXISTS trg_change_requests_updated_at ON public.change_requests;
CREATE TRIGGER trg_change_requests_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads/inserts own change requests" ON public.change_requests;
CREATE POLICY "Owner reads/inserts own change requests"
  ON public.change_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proofs p
      JOIN public.order_items oi ON oi.id = p.order_item_id
      JOIN public.orders o ON o.id = oi.order_id
      WHERE p.id = change_requests.proof_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Owner inserts own change request" ON public.change_requests;
CREATE POLICY "Owner inserts own change request"
  ON public.change_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

DROP POLICY IF EXISTS "Admins manage change requests" ON public.change_requests;
CREATE POLICY "Admins manage change requests"
  ON public.change_requests FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Storage bucket: proofs (private, owner read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO NOTHING;


-- === supabase\migrations\0006_print_files_csv_jobs.sql ===
-- ============================================================================
-- Phase 6: Print Files & Chunked CSV Variable-Data Jobs
-- ============================================================================

-- 1. csv_jobs (chunked processing per Decision D15)
CREATE TABLE IF NOT EXISTS public.csv_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  source_path    text NOT NULL DEFAULT '',
  total_rows     int NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  processed_rows int NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  status         text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'done', 'failed')
  ),
  error_report   jsonb NOT NULL DEFAULT '[]'::jsonb,
  zip_path       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_jobs_order_item ON public.csv_jobs(order_item_id);

DROP TRIGGER IF EXISTS trg_csv_jobs_updated_at ON public.csv_jobs;
CREATE TRIGGER trg_csv_jobs_updated_at
  BEFORE UPDATE ON public.csv_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.csv_jobs ENABLE ROW LEVEL SECURITY;

-- Strict Â§5.9 RLS: no customer access to print_files / csv_jobs
DROP POLICY IF EXISTS "Admins manage csv_jobs" ON public.csv_jobs;
CREATE POLICY "Admins manage csv_jobs"
  ON public.csv_jobs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. print_files
CREATE TABLE IF NOT EXISTS public.print_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  proof_id      uuid REFERENCES public.proofs(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('pdf', 'png', 'csv_row', 'zip')),
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  width_px      int,
  height_px     int,
  dpi           int NOT NULL DEFAULT 300,
  bleed_mm      numeric(6,2) NOT NULL DEFAULT 3.0,
  row_index     int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_files_order_item ON public.print_files(order_item_id);

DROP TRIGGER IF EXISTS trg_print_files_updated_at ON public.print_files;
CREATE TRIGGER trg_print_files_updated_at
  BEFORE UPDATE ON public.print_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.print_files ENABLE ROW LEVEL SECURITY;

-- Strict Â§5.9 RLS: admin only
DROP POLICY IF EXISTS "Admins manage print_files" ON public.print_files;
CREATE POLICY "Admins manage print_files"
  ON public.print_files FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Storage bucket: print-files (private, admin only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('print-files', 'print-files', false)
ON CONFLICT (id) DO NOTHING;


-- === supabase\seed.sql ===
-- ============================================================================
-- Seed Data: Phase 1 (Settings + Demo Users)
-- ============================================================================
-- Demo Credentials (for testing & grading only):
--   Admin:      admin@demo.test     / DemoAdmin#2026
--   Customer 1: customer1@demo.test / DemoCust1#2026
--   Customer 2: customer2@demo.test / DemoCust2#2026
-- ============================================================================

INSERT INTO public.settings (key, value, description, is_public)
VALUES
  (
    'pricing_config',
    '{
      "currency": "INR",
      "currency_symbol": "â‚¹",
      "tax_label": "GST",
      "tax_rate_percent": 18,
      "tax_inclusive": true,
      "min_order_value_minor": 0
    }'::jsonb,
    'Global currency & VAT/GST inclusive tax settings (Decisions D1, D2)',
    true
  ),
  (
    'company_details',
    '{
      "name": "Digital Heroes Print House",
      "email": "hello@digitalheroes.co.in",
      "gstin": "29AABCD1234E1Z5",
      "address": "Bengaluru, Karnataka, India"
    }'::jsonb,
    'Company metadata for invoices and storefront',
    true
  ),
  (
    'workflow_flags',
    '{
      "require_reapproval_on_reorder": false,
      "enable_xero_api": false
    }'::jsonb,
    'Operational feature flags',
    false
  )
ON CONFLICT (key) DO NOTHING;

-- Note: auth.users rows are typically created via Supabase Auth Admin API or Dashboard.
-- If running directly in local Postgres / Supabase SQL editor, the block below
-- provisions the 3 demo users idempotently and promotes admin@demo.test to admin.

DO $$
DECLARE
  v_admin_id uuid := '00000000-0000-0000-0000-000000000001';
  v_cust1_id uuid := '00000000-0000-0000-0000-000000000002';
  v_cust2_id uuid := '00000000-0000-0000-0000-000000000003';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@demo.test') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@demo.test', crypt('DemoAdmin#2026', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Platform Admin","company":"Digital Heroes"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'customer1@demo.test') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_cust1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'customer1@demo.test', crypt('DemoCust1#2026', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Aarav Sharma","company":"TrailBlaze Events"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'customer2@demo.test') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_cust2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'customer2@demo.test', crypt('DemoCust2#2026', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Meera Patel","company":"Peak Craft Studio"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  END IF;

  -- Promote admin@demo.test via SQL (Decision D16)
  UPDATE public.profiles
  SET role = 'admin'
  WHERE email = 'admin@demo.test';
END $$;


-- === supabase\seed_catalogue.sql ===
-- ============================================================================
-- Seed Data: Phase 2 (6 Divisions, Parameter-Driven Products, Tiers, Gallery)
-- ============================================================================

INSERT INTO public.divisions (id, slug, name, description, sort_order, is_active) VALUES
  ('11111111-1111-1111-1111-111111111101', 'labels-stickers', 'Labels & Stickers', 'Die-cut vinyl and paper labels in custom millimetre dimensions with matte or gloss finishes.', 1, true),
  ('11111111-1111-1111-1111-111111111102', 'race-event-numbers', 'Race & Event Numbers', 'Tear-resistant Tyvek and heavyweight paper bibs with CSV variable-data merge and auto-fit typography.', 2, true),
  ('11111111-1111-1111-1111-111111111103', 'mtb-boards', 'MTB Boards', 'Corrugated plastic handlebar plates with rider number and name placeholders for bulk race jobs.', 3, true),
  ('11111111-1111-1111-1111-111111111104', 'stamps', 'Stamps', 'Self-inking precision stamps with multi-line shrink-to-fit text and selectable ink colours.', 4, true),
  ('11111111-1111-1111-1111-111111111105', 'trophies', 'Trophies', 'Custom engraved plaques, acrylic awards, and timber trophies with min/max font fitting.', 5, true),
  ('11111111-1111-1111-1111-111111111106', 'laser-cut-work', 'Laser-Cut Work', 'Precision laser-cut acrylic, plywood, and MDF components from your vector cut-path artwork.', 6, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (id, division_id, slug, name, description, product_type, base_unit_price, setup_fee, min_qty, max_qty, bleed_mm, output_dpi, is_active) VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'custom-die-cut-stickers', 'Custom Die-Cut Stickers', 'Weatherproof vinyl and matte paper stickers sized to the exact millimetre.', 'Sticker', 400, 15000, 25, 10000, 3.0, 300, true),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111102', 'race-bib-numbers', 'Race & Event Bib Numbers', 'Marathon, cycling, and triathlon bib numbers with CSV variable-data merge.', 'RaceNumber', 1200, 25000, 20, 20000, 3.0, 300, true),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111103', 'mtb-handlebar-boards', 'MTB Handlebar Boards', 'Rigid corrugated plastic handlebar boards with number & rider name placeholders.', 'MtbBoard', 2500, 30000, 10, 5000, 3.0, 300, true),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111104', 'self-inking-stamps', 'Self-Inking Stamps', 'Self-inking industrial rubber stamps with automatic text-line shrink-to-fit.', 'Stamp', 35000, 0, 1, 500, 1.0, 600, true),
  ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111105', 'custom-engraved-trophies', 'Custom Engraved Trophies', 'Engraved acrylic, wood, and plaque awards with constrained engraving zones.', 'Trophy', 85000, 20000, 1, 1000, 2.0, 300, true),
  ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111106', 'precision-laser-cut', 'Precision Laser-Cut Parts', 'Custom laser-cut acrylic, birch plywood, and MDF parts from vector cut-paths.', 'LaserCut', 15000, 35000, 1, 2000, 2.0, 300, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.size_rules (id, product_id, min_width_mm, max_width_mm, min_height_mm, max_height_mm, default_width_mm, default_height_mm, allowed_shapes, area_rate_per_cm2) VALUES
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 20, 300, 20, 300, 75, 75, ARRAY['rect','circle','oval'], 12),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202', 120, 320, 90, 250, 210, 150, ARRAY['rect'], 4),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222203', 140, 280, 120, 240, 200, 170, ARRAY['rect'], 8),
  ('33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222204', 20, 90, 12, 60, 58, 22, ARRAY['rect','circle'], 150),
  ('33333333-3333-3333-3333-333333333305', '22222222-2222-2222-2222-222222222205', 80, 300, 100, 350, 150, 200, ARRAY['rect'], 120),
  ('33333333-3333-3333-3333-333333333306', '22222222-2222-2222-2222-222222222206', 30, 900, 30, 600, 200, 150, ARRAY['rect','circle','oval'], 45)
ON CONFLICT (product_id) DO NOTHING;

-- Parameters & Options
INSERT INTO public.product_parameters (id, product_id, key, label, type, default_value, sort_order) VALUES
  ('44444444-4444-4444-4444-444444444101', '22222222-2222-2222-2222-222222222201', 'material', 'Material', 'select', 'white_vinyl', 1),
  ('44444444-4444-4444-4444-444444444102', '22222222-2222-2222-2222-222222222201', 'finish', 'Finish', 'select', 'matte', 2),
  ('44444444-4444-4444-4444-444444444201', '22222222-2222-2222-2222-222222222202', 'material', 'Material', 'select', 'tyvek', 1),
  ('44444444-4444-4444-4444-444444444202', '22222222-2222-2222-2222-222222222202', 'orientation', 'Orientation', 'select', 'landscape', 2),
  ('44444444-4444-4444-4444-444444444301', '22222222-2222-2222-2222-222222222203', 'material', 'Board Stock', 'select', 'corrugated_3mm', 1),
  ('44444444-4444-4444-4444-444444444302', '22222222-2222-2222-2222-222222222203', 'orientation', 'Orientation', 'select', 'portrait', 2),
  ('44444444-4444-4444-4444-444444444401', '22222222-2222-2222-2222-222222222204', 'ink_colour', 'Ink Colour', 'select', 'black', 1),
  ('44444444-4444-4444-4444-444444444402', '22222222-2222-2222-2222-222222222204', 'mount', 'Mount Type', 'select', 'self_inking', 2),
  ('44444444-4444-4444-4444-444444444501', '22222222-2222-2222-2222-222222222205', 'trophy_type', 'Award Material', 'select', 'acrylic', 1),
  ('44444444-4444-4444-4444-444444444502', '22222222-2222-2222-2222-222222222205', 'base_finish', 'Base Finish', 'select', 'ebony', 2),
  ('44444444-4444-4444-4444-444444444601', '22222222-2222-2222-2222-222222222206', 'material', 'Sheet Material', 'select', 'acrylic', 1),
  ('44444444-4444-4444-4444-444444444602', '22222222-2222-2222-2222-222222222206', 'thickness', 'Thickness', 'select', '3mm', 2)
ON CONFLICT (product_id, key) DO NOTHING;

INSERT INTO public.product_parameter_options (parameter_id, value, label, price_multiplier, price_add, sort_order) VALUES
  ('44444444-4444-4444-4444-444444444101', 'white_vinyl', 'White Vinyl', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444101', 'clear_vinyl', 'Clear Vinyl', 1.2000, 100, 2),
  ('44444444-4444-4444-4444-444444444101', 'matte_paper', 'Matte Paper', 0.8500, 0, 3),
  ('44444444-4444-4444-4444-444444444101', 'gloss_paper', 'Gloss Paper', 0.9000, 0, 4),
  ('44444444-4444-4444-4444-444444444102', 'matte', 'Matte Lamination', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444102', 'gloss', 'Gloss UV', 1.0800, 50, 2),
  ('44444444-4444-4444-4444-444444444201', 'tyvek', 'Tear-Proof Tyvek', 1.2500, 0, 1),
  ('44444444-4444-4444-4444-444444444201', 'waterproof_paper', '300gsm Coated Paper', 1.0000, 0, 2),
  ('44444444-4444-4444-4444-444444444202', 'landscape', 'Landscape', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444202', 'portrait', 'Portrait', 1.0000, 0, 2),
  ('44444444-4444-4444-4444-444444444301', 'corrugated_3mm', 'Corrugated Plastic 3mm', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444301', 'corrugated_5mm', 'Heavy Corrugated 5mm', 1.2500, 300, 2),
  ('44444444-4444-4444-4444-444444444302', 'portrait', 'Portrait', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444302', 'landscape', 'Landscape', 1.0000, 0, 2),
  ('44444444-4444-4444-4444-444444444401', 'black', 'Archival Black', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444401', 'blue', 'Royal Blue', 1.0000, 0, 2),
  ('44444444-4444-4444-4444-444444444401', 'red', 'Crimson Red', 1.0000, 2000, 3),
  ('44444444-4444-4444-4444-444444444402', 'self_inking', 'Self-Inking Housing', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444402', 'heavy_duty', 'Heavy-Duty Steel Frame', 1.4500, 5000, 2),
  ('44444444-4444-4444-4444-444444444501', 'acrylic', 'Optical Cast Acrylic', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444501', 'wood', 'Walnut Timber', 1.2000, 15000, 2),
  ('44444444-4444-4444-4444-444444444501', 'plaque', 'Brushed Metal Plaque', 1.3000, 20000, 3),
  ('44444444-4444-4444-4444-444444444502', 'ebony', 'Matte Ebony Base', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444502', 'brass', 'Brushed Brass Accent', 1.1000, 10000, 2),
  ('44444444-4444-4444-4444-444444444601', 'acrylic', 'Cast Acrylic', 1.2000, 0, 1),
  ('44444444-4444-4444-4444-444444444601', 'plywood', 'Birch Plywood', 1.0000, 0, 2),
  ('44444444-4444-4444-4444-444444444601', 'mdf', 'Precision MDF', 0.8500, 0, 3),
  ('44444444-4444-4444-4444-444444444602', '3mm', '3 mm', 1.0000, 0, 1),
  ('44444444-4444-4444-4444-444444444602', '5mm', '5 mm', 1.3500, 2500, 2),
  ('44444444-4444-4444-4444-444444444602', '8mm', '8 mm', 1.7500, 5000, 3)
ON CONFLICT (parameter_id, value) DO NOTHING;

-- Global Volume Discount Tiers (0% < 100, 10% >= 100, 15% >= 500)
INSERT INTO public.volume_discount_tiers (product_id, min_qty, discount_percent)
SELECT NULL, 100, 10.00
WHERE NOT EXISTS (SELECT 1 FROM public.volume_discount_tiers WHERE product_id IS NULL AND min_qty = 100);

INSERT INTO public.volume_discount_tiers (product_id, min_qty, discount_percent)
SELECT NULL, 500, 15.00
WHERE NOT EXISTS (SELECT 1 FROM public.volume_discount_tiers WHERE product_id IS NULL AND min_qty = 500);


-- === supabase\seed_orders_demo.sql ===
-- ============================================================================
-- Appendix A: Sample Orders Across Every Pipeline Stage + Proof v1->v2 History
-- Run after 0001..0006, seed.sql, and seed_catalogue.sql.
-- ============================================================================

DO $$
DECLARE
  v_cust1 uuid := '00000000-0000-0000-0000-000000000002';
  v_admin uuid := '00000000-0000-0000-0000-000000000001';
  v_prod_sticker uuid := '22222222-2222-2222-2222-222222222201';
  v_prod_race uuid := '22222222-2222-2222-2222-222222222202';
  v_ord_proof uuid := '99999999-9999-9999-9999-999999999004';
  v_ord_comp  uuid := '99999999-9999-9999-9999-999999999006';
  v_oi_proof  uuid := '88888888-8888-8888-8888-888888888004';
  v_proof_v1  uuid := '77777777-7777-7777-7777-777777777001';
  v_proof_v2  uuid := '77777777-7777-7777-7777-777777777002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_cust1) THEN
    RETURN;
  END IF;

  INSERT INTO public.orders (id, order_number, owner_id, status, subtotal, tax_total, total, payment_status, proof_approved, archived_at)
  VALUES
    ('99999999-9999-9999-9999-999999999001', 'DH-000901', v_cust1, 'quote',      54000,  8237,  54000,  'pending', false, NULL),
    ('99999999-9999-9999-9999-999999999002', 'DH-000902', v_cust1, 'order',      89000,  13576, 89000,  'paid',    false, NULL),
    ('99999999-9999-9999-9999-999999999003', 'DH-000903', v_cust1, 'artwork',    120000, 18305, 120000, 'paid',    false, NULL),
    (v_ord_proof,                            'DH-000904', v_cust1, 'proof',      185000, 28220, 185000, 'paid',    true,  NULL),
    ('99999999-9999-9999-9999-999999999005', 'DH-000905', v_cust1, 'production', 240000, 36610, 240000, 'paid',    true,  NULL),
    (v_ord_comp,                             'DH-000906', v_cust1, 'completed',  155000, 23644, 155000, 'paid',    true,  now())
  ON CONFLICT (order_number) DO NOTHING;

  INSERT INTO public.order_items (id, order_id, product_id, config, quantity, unit_price, discount_percent, line_total)
  VALUES
    (v_oi_proof, v_ord_proof, v_prod_race, '{"width_mm":210,"height_mm":150,"shape":"rect","quantity":100}'::jsonb, 100, 1600, 10, 185000),
    ('88888888-8888-8888-8888-888888888006', v_ord_comp, v_prod_sticker, '{"width_mm":75,"height_mm":75,"shape":"circle","quantity":200}'::jsonb, 200, 700, 10, 155000)
  ON CONFLICT (id) DO NOTHING;

  -- Proof v1 (changes_requested -> superseded) -> Proof v2 (approved)
  INSERT INTO public.proofs (id, order_item_id, version, file_path, status, created_by)
  VALUES
    (v_proof_v1, v_oi_proof, 1, 'proofs/DH-000904/v1.png', 'superseded', v_admin),
    (v_proof_v2, v_oi_proof, 2, 'proofs/DH-000904/v2.png', 'approved',   v_admin)
  ON CONFLICT (order_item_id, version) DO NOTHING;

  INSERT INTO public.change_requests (proof_id, requested_by, message, status, resolved_by)
  VALUES
    (v_proof_v1, v_cust1, 'Please enlarge bib number font size and shift rider name 3mm down.', 'resolved', v_admin)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.proof_approvals (proof_id, approved_by, ip, user_agent)
  VALUES
    (v_proof_v2, v_cust1, '127.0.0.1', 'Seed/Demo')
  ON CONFLICT DO NOTHING;
END $$;


NOTIFY pgrst, 'reload schema';


