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

CREATE TRIGGER trg_proofs_updated_at
  BEFORE UPDATE ON public.proofs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.proofs ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER trg_change_requests_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Owner inserts own change request"
  ON public.change_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Admins manage change requests"
  ON public.change_requests FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Storage bucket: proofs (private, owner read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO NOTHING;
