-- Migration: 016_add_algorithms
-- Description: Add seller_reliability to user_profile, create user_survey, add fake detection columns to product_review
-- Requirements: A. Recommendation Algorithm, B. Fake Review Detection Algorithm, C. Review Summarization Algorithm

-- Add seller reliability rating to user profiles
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS seller_reliability DECIMAL(3, 2) DEFAULT 4.5 CHECK (seller_reliability BETWEEN 1.0 AND 5.0);

-- Create user_survey table to record preferences
CREATE TABLE IF NOT EXISTS user_survey (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES user_profile(id) ON DELETE CASCADE,
  budget DECIMAL(10, 2) NOT NULL CHECK (budget >= 0),
  preferred_categories product_category[] NOT NULL,
  browsing_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add fake detection and verified status columns to product_review
ALTER TABLE product_review ADD COLUMN IF NOT EXISTS is_fake BOOLEAN DEFAULT FALSE;
ALTER TABLE product_review ADD COLUMN IF NOT EXISTS fake_probability DECIMAL(5, 4) DEFAULT 0.0;
ALTER TABLE product_review ADD COLUMN IF NOT EXISTS image_verified BOOLEAN DEFAULT FALSE;

-- Create index for survey lookups
CREATE INDEX IF NOT EXISTS idx_user_survey_user ON user_survey (user_id);
