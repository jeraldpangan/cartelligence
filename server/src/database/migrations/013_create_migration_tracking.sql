-- Migration: 013_create_migration_tracking
-- Description: Create migration tracking table to record applied migrations
-- Requirements: 10.1

CREATE TABLE IF NOT EXISTS schema_migration (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
