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
