-- Migration: 011_create_purchase_history
-- Description: Create PURCHASE_HISTORY table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE purchase_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  purchase_count INTEGER NOT NULL DEFAULT 1,
  last_purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT purchase_history_user_id_fk FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
  CONSTRAINT purchase_history_product_id_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
  CONSTRAINT purchase_history_purchase_count_positive CHECK (purchase_count >= 1),
  CONSTRAINT purchase_history_unique_user_product UNIQUE (user_id, product_id)
);

-- Composite index for recommendation queries
CREATE INDEX idx_purchase_history_user_purchased ON purchase_history (user_id, last_purchased_at DESC);
