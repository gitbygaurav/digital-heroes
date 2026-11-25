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

CREATE POLICY "Public can read active fonts"
  ON public.fonts FOR SELECT
  USING (is_active = true OR public.is_admin());

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

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active templates"
  ON public.templates FOR SELECT
  USING (is_active = true OR public.is_admin());

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

CREATE POLICY "Public can read print areas"
  ON public.print_areas FOR SELECT
  USING (true);

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

CREATE POLICY "Public can read template placeholders"
  ON public.template_placeholders FOR SELECT
  USING (true);

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

CREATE TRIGGER trg_designs_updated_at
  BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

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
