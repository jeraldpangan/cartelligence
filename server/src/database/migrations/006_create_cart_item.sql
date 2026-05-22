-- Migration: 006_create_cart_item
-- Description: Create CART_ITEM table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE cart_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT cart_item_cart_id_fk FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
  CONSTRAINT cart_item_product_id_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
  CONSTRAINT cart_item_quantity_range CHECK (quantity BETWEEN 1 AND 99),
  CONSTRAINT cart_item_unique_product_per_cart UNIQUE (cart_id, product_id)
);
