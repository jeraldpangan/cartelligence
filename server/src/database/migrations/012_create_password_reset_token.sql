-- Migration: 012_create_password_reset_token
-- Description: Create PASSWORD_RESET_TOKEN table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE password_reset_token (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,

  CONSTRAINT password_reset_token_user_id_fk FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
  CONSTRAINT password_reset_token_unique UNIQUE (token)
);
