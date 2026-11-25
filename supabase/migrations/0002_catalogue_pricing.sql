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

CREATE TRIGGER trg_divisions_updated_at
  BEFORE UPDATE ON public.divisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active divisions"
  ON public.divisions FOR SELECT
  USING (is_active = true OR public.is_admin());

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

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active products"
  ON public.products FOR SELECT
  USING (is_active = true OR public.is_admin());

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

CREATE TRIGGER trg_product_parameters_updated_at
  BEFORE UPDATE ON public.product_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read parameters of active products"
  ON public.product_parameters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_parameters.product_id AND p.is_active = true
    )
    OR public.is_admin()
  );

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

CREATE TRIGGER trg_product_parameter_options_updated_at
  BEFORE UPDATE ON public.product_parameter_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_parameter_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active parameter options"
  ON public.product_parameter_options FOR SELECT
  USING (is_active = true OR public.is_admin());

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

CREATE TRIGGER trg_size_rules_updated_at
  BEFORE UPDATE ON public.size_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.size_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read size rules"
  ON public.size_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = size_rules.product_id AND p.is_active = true
    )
    OR public.is_admin()
  );

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

CREATE TRIGGER trg_volume_discount_tiers_updated_at
  BEFORE UPDATE ON public.volume_discount_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.volume_discount_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read discount tiers"
  ON public.volume_discount_tiers FOR SELECT
  USING (true);

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

CREATE TRIGGER trg_gallery_items_updated_at
  BEFORE UPDATE ON public.gallery_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active gallery items"
  ON public.gallery_items FOR SELECT
  USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins manage gallery items"
  ON public.gallery_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
