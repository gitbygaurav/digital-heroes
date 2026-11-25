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

CREATE TRIGGER trg_csv_jobs_updated_at
  BEFORE UPDATE ON public.csv_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.csv_jobs ENABLE ROW LEVEL SECURITY;

-- Strict §5.9 RLS: no customer access to print_files / csv_jobs
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

CREATE TRIGGER trg_print_files_updated_at
  BEFORE UPDATE ON public.print_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.print_files ENABLE ROW LEVEL SECURITY;

-- Strict §5.9 RLS: admin only
CREATE POLICY "Admins manage print_files"
  ON public.print_files FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Storage bucket: print-files (private, admin only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('print-files', 'print-files', false)
ON CONFLICT (id) DO NOTHING;
