-- Migration: 014_add_seller_buyer_panels
-- Description: Add role enum, role column to user_profile, seller_id to product, and create product_image and product_review tables
-- Requirements: 1.1, 2.1, 3.4, 5.6

-- Create user_role enum type
CREATE TYPE user_role AS ENUM ('buyer', 'seller');

-- Add role column to user_profile with default 'buyer'
ALTER TABLE user_profile ADD COLUMN role user_role NOT NULL DEFAULT 'buyer';

-- Add seller_id column to product table with FK to user_profile(id)
ALTER TABLE product ADD COLUMN seller_id UUID REFERENCES user_profile(id) ON DELETE CASCADE;

-- Create index on product(seller_id) for seller product lookups
CREATE INDEX idx_product_seller ON product (seller_id);

-- Create product_image table
CREATE TABLE product_image (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT product_image_sort_order_non_negative CHECK (sort_order >= 0)
);

-- Index for efficient image retrieval ordered by sort_order
CREATE INDEX idx_product_image_product ON product_image (product_id, sort_order);

-- Create product_review table
CREATE TABLE product_review (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT product_review_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT product_review_comment_length CHECK (char_length(comment) BETWEEN 10 AND 500),
  CONSTRAINT product_review_unique_per_user UNIQUE (product_id, user_id)
);

-- Index for fetching reviews by product sorted by date (newest first)
CREATE INDEX idx_product_review_product ON product_review (product_id, created_at DESC);

-- Index for fetching reviews by user
CREATE INDEX idx_product_review_user ON product_review (user_id);
