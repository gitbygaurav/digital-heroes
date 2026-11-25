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
      "currency_symbol": "₹",
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
