-- Migration: 010_create_recommendation_dismissal
-- Description: Create RECOMMENDATION_DISMISSAL table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE recommendation_dismissal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  CONSTRAINT recommendation_dismissal_user_id_fk FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
  CONSTRAINT recommendation_dismissal_product_id_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
  CONSTRAINT recommendation_dismissal_expires_after_dismissed CHECK (expires_at > dismissed_at)
);

-- Composite index for filtering active recommendations
CREATE INDEX idx_recommendation_dismissal_user_dismissed ON recommendation_dismissal (user_id, dismissed_at);
