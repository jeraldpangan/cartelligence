-- Migration: 001_create_extensions
-- Description: Enable required PostgreSQL extensions
-- Requirements: 10.1, 10.4

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
