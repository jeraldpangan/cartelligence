-- Seed: 001_seed_products
-- Description: Seed sample products across all 7 categories
-- Categories: produce, dairy, meat, beverages, snacks, household, personal_care

-- ============================================================
-- PRODUCE (Fresh fruits and vegetables)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Banana (Lakatan)', 'produce', 65.00, 'per kg', 150, 'Fresh Lakatan bananas from Mindanao', TRUE),
('Tomato', 'produce', 80.00, 'per kg', 100, 'Ripe red tomatoes, locally grown', TRUE),
('Onion (Red)', 'produce', 120.00, 'per kg', 80, 'Fresh red onions', TRUE),
('Garlic', 'produce', 200.00, 'per kg', 60, 'Fresh garlic bulbs', TRUE),
('Kangkong', 'produce', 25.00, 'per bundle', 200, 'Fresh water spinach', TRUE),
('Calamansi', 'produce', 50.00, 'per kg', 120, 'Fresh Philippine lime', TRUE),
('Potato', 'produce', 90.00, 'per kg', 90, 'Fresh potatoes for cooking', TRUE);

-- ============================================================
-- DAIRY (Milk, cheese, eggs)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Fresh Milk (1L)', 'dairy', 95.00, 'per liter', 80, 'Full cream fresh milk', TRUE),
('Eggs (Large, 12pcs)', 'dairy', 108.00, 'per dozen', 100, 'Large fresh eggs, 12 pieces', TRUE),
('Cheese (Eden, 165g)', 'dairy', 62.00, 'per pack', 60, 'Eden cheese block 165g', TRUE),
('Butter (Anchor, 227g)', 'dairy', 185.00, 'per pack', 40, 'Anchor unsalted butter', TRUE),
('Yogurt (Plain, 125g)', 'dairy', 45.00, 'per cup', 70, 'Plain yogurt, no sugar added', TRUE),
('Condensed Milk (300ml)', 'dairy', 48.00, 'per can', 90, 'Sweetened condensed milk', TRUE);

-- ============================================================
-- MEAT (Fresh and frozen meats)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Chicken Breast (Boneless)', 'meat', 220.00, 'per kg', 50, 'Fresh boneless chicken breast', TRUE),
('Pork Belly (Liempo)', 'meat', 320.00, 'per kg', 40, 'Fresh pork belly sliced', TRUE),
('Ground Beef', 'meat', 350.00, 'per kg', 35, 'Fresh lean ground beef', TRUE),
('Bangus (Milkfish)', 'meat', 180.00, 'per kg', 45, 'Fresh milkfish, cleaned', TRUE),
('Hotdog (Tender Juicy, 1kg)', 'meat', 195.00, 'per pack', 60, 'Purefoods Tender Juicy hotdogs', TRUE),
('Tilapia', 'meat', 140.00, 'per kg', 55, 'Fresh tilapia, whole', TRUE);

-- ============================================================
-- BEVERAGES (Drinks and refreshments)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Coca-Cola (1.5L)', 'beverages', 72.00, 'per bottle', 100, 'Coca-Cola regular 1.5 liter', TRUE),
('Bottled Water (500ml, 24pcs)', 'beverages', 180.00, 'per case', 80, 'Purified drinking water, 24 bottles', TRUE),
('Nescafe 3-in-1 (30 sachets)', 'beverages', 285.00, 'per box', 70, 'Nescafe Original 3-in-1 coffee mix', TRUE),
('C2 Green Tea (1L)', 'beverages', 35.00, 'per bottle', 120, 'C2 green tea apple flavor', TRUE),
('Milo (300g)', 'beverages', 165.00, 'per pack', 60, 'Milo chocolate malt drink powder', TRUE),
('Minute Maid Orange (1L)', 'beverages', 68.00, 'per carton', 50, 'Minute Maid pulpy orange juice', TRUE);

-- ============================================================
-- SNACKS (Chips, crackers, sweets)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Piattos Cheese (85g)', 'snacks', 38.00, 'per pack', 150, 'Piattos cheese flavored chips', TRUE),
('SkyFlakes Crackers (25g x 10)', 'snacks', 52.00, 'per pack', 120, 'SkyFlakes saltine crackers', TRUE),
('Chippy Barbecue (110g)', 'snacks', 32.00, 'per pack', 130, 'Chippy barbecue corn chips', TRUE),
('Oreo Cookies (133g)', 'snacks', 45.00, 'per pack', 90, 'Oreo chocolate sandwich cookies', TRUE),
('Boy Bawang Garlic (100g)', 'snacks', 28.00, 'per pack', 140, 'Boy Bawang garlic flavored corn nuts', TRUE),
('Rebisco Crackers (10pcs)', 'snacks', 35.00, 'per pack', 100, 'Rebisco sandwich crackers', TRUE);

-- ============================================================
-- HOUSEHOLD (Cleaning and home supplies)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Joy Dishwashing Liquid (495ml)', 'household', 85.00, 'per bottle', 80, 'Joy antibacterial dishwashing liquid', TRUE),
('Ariel Powder Detergent (1kg)', 'household', 165.00, 'per pack', 60, 'Ariel color and style powder detergent', TRUE),
('Domex Toilet Cleaner (500ml)', 'household', 95.00, 'per bottle', 50, 'Domex multi-action toilet cleaner', TRUE),
('Glad Trash Bags (Medium, 20pcs)', 'household', 78.00, 'per pack', 70, 'Glad medium trash bags', TRUE),
('Mr. Clean All-Purpose (500ml)', 'household', 110.00, 'per bottle', 45, 'Mr. Clean antibacterial cleaner', TRUE),
('Scotch-Brite Sponge (3pcs)', 'household', 55.00, 'per pack', 90, 'Scotch-Brite scrub sponge', TRUE);

-- ============================================================
-- PERSONAL CARE (Hygiene and grooming)
-- ============================================================
INSERT INTO product (name, category, unit_price, unit, stock_quantity, description, is_available) VALUES
('Safeguard Soap (135g)', 'personal_care', 48.00, 'per bar', 100, 'Safeguard antibacterial soap', TRUE),
('Head & Shoulders Shampoo (180ml)', 'personal_care', 145.00, 'per bottle', 70, 'Head & Shoulders cool menthol shampoo', TRUE),
('Colgate Toothpaste (150g)', 'personal_care', 95.00, 'per tube', 80, 'Colgate triple action toothpaste', TRUE),
('Rexona Deodorant (50ml)', 'personal_care', 125.00, 'per roll-on', 60, 'Rexona motion sense deodorant', TRUE),
('Palmolive Shampoo (180ml)', 'personal_care', 98.00, 'per bottle', 65, 'Palmolive naturals shampoo', TRUE),
('Whisper Pads (8pcs)', 'personal_care', 75.00, 'per pack', 55, 'Whisper ultra thin sanitary pads', TRUE);
