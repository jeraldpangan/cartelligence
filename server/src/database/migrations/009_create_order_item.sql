-- Migration: 009_create_order_item
-- Description: Create ORDER_ITEM table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE order_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_at_purchase DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,

  CONSTRAINT order_item_order_id_fk FOREIGN KEY (order_id) REFERENCES "order"(id) ON DELETE CASCADE,
  CONSTRAINT order_item_product_id_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
  CONSTRAINT order_item_quantity_positive CHECK (quantity >= 1),
  CONSTRAINT order_item_unit_price_non_negative CHECK (unit_price_at_purchase >= 0),
  CONSTRAINT order_item_subtotal_non_negative CHECK (subtotal >= 0)
);
