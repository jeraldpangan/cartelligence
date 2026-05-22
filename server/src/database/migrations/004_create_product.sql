-- Migration: 004_create_product
-- Description: Create PRODUCT table with constraints and indexes
-- Requirements: 10.1, 10.4

CREATE TABLE product (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category product_category NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  nutritional_info TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT product_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT product_stock_quantity_non_negative CHECK (stock_quantity >= 0)
);

-- Composite index for category browsing (category + availability)
CREATE INDEX idx_product_category_available ON product (category, is_available);

-- GIN index with pg_trgm for full-text search on product name
CREATE INDEX idx_product_name_trgm ON product USING GIN (name gin_trgm_ops);
