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

CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads/inserts own quotes"
  ON public.quotes FOR SELECT
  USING (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Owner inserts own quotes"
  ON public.quotes FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

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

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Owner inserts own orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = owner_id OR public.is_admin());

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

CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "Owner inserts own order items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

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

CREATE POLICY "Owner reads own order status history"
  ON public.order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

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

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own invoices"
  ON public.invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = invoices.order_id AND o.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

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

CREATE POLICY "Admins read email log"
  ON public.email_log FOR SELECT
  USING (public.is_admin());

-- Storage bucket for invoices (private, owner read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;
