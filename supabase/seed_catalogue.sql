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
