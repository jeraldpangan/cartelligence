-- Migration: 002_create_enums
-- Description: Create custom enum types for product categories and order statuses
-- Requirements: 10.1

CREATE TYPE product_category AS ENUM (
  'produce',
  'dairy',
  'meat',
  'beverages',
  'snacks',
  'household',
  'personal_care'
);

CREATE TYPE order_status AS ENUM (
  'confirmed',
  'being_prepared',
  'out_for_delivery',
  'delivered',
  'cancelled'
);
