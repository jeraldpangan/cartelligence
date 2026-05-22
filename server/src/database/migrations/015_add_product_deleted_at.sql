-- Migration: 015_add_product_deleted_at
-- Description: Add deleted_at column to product table for soft-delete support
-- Requirements: 2.4

-- Add deleted_at column for soft-delete (NULL means active, non-NULL means deleted)
ALTER TABLE product ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Partial index for efficient queries on non-deleted products
CREATE INDEX idx_product_not_deleted ON product (seller_id) WHERE deleted_at IS NULL;
