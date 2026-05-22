-- Migration: 005_create_cart
-- Description: Create CART table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE cart (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT cart_user_id_fk FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
  CONSTRAINT cart_user_id_unique UNIQUE (user_id)
);

-- Index for cart retrieval by user
CREATE INDEX idx_cart_user_id ON cart (user_id);
