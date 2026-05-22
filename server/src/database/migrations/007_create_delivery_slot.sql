-- Migration: 007_create_delivery_slot
-- Description: Create DELIVERY_SLOT table with constraints
-- Requirements: 10.1, 10.4

CREATE TABLE delivery_slot (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  current_bookings INTEGER NOT NULL DEFAULT 0,
  max_bookings INTEGER NOT NULL DEFAULT 20,

  CONSTRAINT delivery_slot_max_bookings_default CHECK (max_bookings = 20),
  CONSTRAINT delivery_slot_current_bookings_range CHECK (current_bookings BETWEEN 0 AND max_bookings),
  CONSTRAINT delivery_slot_start_time_range CHECK (start_time >= '08:00:00' AND start_time <= '19:00:00'),
  CONSTRAINT delivery_slot_end_time_after_start CHECK (end_time > start_time),
  CONSTRAINT delivery_slot_two_hour_window CHECK (end_time = start_time + INTERVAL '2 hours'),
  CONSTRAINT delivery_slot_unique_date_time UNIQUE (slot_date, start_time)
);

-- Composite index for availability checks
CREATE INDEX idx_delivery_slot_date_bookings ON delivery_slot (slot_date, current_bookings);
