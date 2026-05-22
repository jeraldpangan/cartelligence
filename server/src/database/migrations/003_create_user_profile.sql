-- Migration: 003_create_user_profile
-- Description: Create USER_PROFILE table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE user_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  delivery_address TEXT NOT NULL,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT user_profile_email_unique UNIQUE (email),
  CONSTRAINT user_profile_full_name_length CHECK (char_length(full_name) BETWEEN 1 AND 100),
  CONSTRAINT user_profile_delivery_address_length CHECK (char_length(delivery_address) BETWEEN 10 AND 250),
  CONSTRAINT user_profile_failed_login_attempts_non_negative CHECK (failed_login_attempts >= 0)
);

-- Unique index for login lookups
CREATE UNIQUE INDEX idx_user_profile_email ON user_profile (email);
