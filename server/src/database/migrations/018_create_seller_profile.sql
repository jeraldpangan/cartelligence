-- Migration: 018_create_seller_profile
-- Description: Create seller_profile table to establish the seller side flow
-- Requirements: 1.1

CREATE TABLE seller_profile (
  user_id UUID PRIMARY KEY REFERENCES user_profile(id) ON DELETE CASCADE,
  store_name VARCHAR(100) NOT NULL UNIQUE,
  store_description TEXT,
  store_logo_url VARCHAR(500),
  business_registration VARCHAR(100),
  support_phone VARCHAR(20),
  
  reliability_score DECIMAL(3, 2) NOT NULL DEFAULT 5.00,
  total_sales INTEGER NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT seller_profile_store_name_length CHECK (char_length(store_name) BETWEEN 3 AND 100),
  CONSTRAINT seller_profile_reliability_range CHECK (reliability_score BETWEEN 1.00 AND 5.00)
);

CREATE INDEX idx_seller_profile_store_name ON seller_profile (store_name);
