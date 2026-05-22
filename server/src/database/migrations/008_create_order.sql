-- Migration: 008_create_order
-- Description: Create ORDER table with constraints and indexes
-- Requirements: 10.1, 10.4

CREATE TABLE "order" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  order_number VARCHAR(50) NOT NULL,
  status order_status NOT NULL DEFAULT 'confirmed',
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  grand_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  delivery_address TEXT NOT NULL,
  scheduled_delivery_start TIMESTAMP WITH TIME ZONE,
  scheduled_delivery_end TIMESTAMP WITH TIME ZONE,
  estimated_arrival TIMESTAMP WITH TIME ZONE,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  promo_code VARCHAR(20),
  delivery_slot_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT order_user_id_fk FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
  CONSTRAINT order_delivery_slot_id_fk FOREIGN KEY (delivery_slot_id) REFERENCES delivery_slot(id) ON DELETE SET NULL,
  CONSTRAINT order_number_unique UNIQUE (order_number),
  CONSTRAINT order_grand_total_range CHECK (grand_total BETWEEN 0.00 AND 9999999.99),
  CONSTRAINT order_subtotal_non_negative CHECK (subtotal >= 0.00),
  CONSTRAINT order_delivery_fee_non_negative CHECK (delivery_fee >= 0.00),
  CONSTRAINT order_discount_non_negative CHECK (discount >= 0.00),
  CONSTRAINT order_reschedule_count_range CHECK (reschedule_count BETWEEN 0 AND 2)
);

-- Composite index for order history (user + created_at descending)
CREATE INDEX idx_order_user_created ON "order" (user_id, created_at DESC);

-- Index for order status queries
CREATE INDEX idx_order_status ON "order" (status);
