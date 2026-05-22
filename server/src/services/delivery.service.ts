import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';
import { DeliverySlot } from '@shared/interfaces';
import {
  MAX_SLOT_BOOKINGS,
  MAX_RESCHEDULES,
  RESCHEDULE_MIN_HOURS_BEFORE,
  DELIVERY_SLOT_DURATION_HOURS,
  DELIVERY_SLOT_START_HOUR,
  DELIVERY_SLOT_END_HOUR,
  DELIVERY_SLOT_DAYS,
} from '@shared/validation';
import { ErrorCode } from '@shared/errors';
import { AppError } from '../middleware/errorHandler';

/** Reservation timeout in minutes */
const RESERVATION_TIMEOUT_MINUTES = 15;

/**
 * Generates the valid start hours for delivery slots.
 * 2-hour windows from DELIVERY_SLOT_START_HOUR up to (DELIVERY_SLOT_END_HOUR - DELIVERY_SLOT_DURATION_HOURS).
 * e.g., 8, 10, 12, 14, 16, 18 with end hour 21 → last start at 19.
 */
function getSlotStartHours(): number[] {
  const hours: number[] = [];
  const lastStartHour = DELIVERY_SLOT_END_HOUR - DELIVERY_SLOT_DURATION_HOURS;
  for (let h = DELIVERY_SLOT_START_HOUR; h <= lastStartHour; h += DELIVERY_SLOT_DURATION_HOURS) {
    hours.push(h);
  }
  return hours;
}

/**
 * Formats an hour number to a time string (e.g., 8 → "08:00:00").
 */
function formatTime(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00:00`;
}

/**
 * DeliveryService
 *
 * Manages delivery time slot availability, reservation, and rescheduling.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
export class DeliveryService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Returns available delivery slots for the next DELIVERY_SLOT_DAYS days
   * starting from the given date (or today if not specified).
   *
   * Slots are 2-hour windows between 8:00 AM and 9:00 PM PST,
   * with a maximum of 20 orders per slot.
   *
   * If a specific date is provided, returns slots only for that date.
   * If no date is provided, returns slots for the next 3 days.
   *
   * Creates slots in the database if they don't exist yet (lazy generation).
   *
   * @param date - Optional specific date to get slots for. If null, returns next 3 days.
   * @returns Array of available delivery slots
   */
  async getAvailableSlots(date?: Date | null): Promise<DeliverySlot[]> {
    const dates = this.getSlotDates(date);

    // Ensure slots exist for all requested dates
    await this.ensureSlotsExist(dates);

    // Query available slots (current_bookings < max_bookings)
    const result = await this.pool.query(
      `SELECT id, slot_date, start_time, end_time, current_bookings, max_bookings
       FROM delivery_slot
       WHERE slot_date = ANY($1)
         AND current_bookings < max_bookings
       ORDER BY slot_date ASC, start_time ASC`,
      [dates.map((d) => d.toISOString().split('T')[0])],
    );

    return result.rows.map((row) => this.mapRowToDeliverySlot(row));
  }

  /**
   * Reserves a delivery slot for an order.
   * Increments current_bookings. The reservation times out after 15 minutes
   * if the order is not confirmed (handled by a separate cleanup process).
   *
   * @param orderId - The order UUID
   * @param slotId - The delivery slot UUID to reserve
   * @throws AppError 404 if slot not found
   * @throws AppError 409 if slot is fully booked
   */
  async reserveSlot(orderId: string, slotId: string): Promise<void> {
    // Get the slot and check availability
    const slotResult = await this.pool.query(
      `SELECT id, slot_date, start_time, end_time, current_bookings, max_bookings
       FROM delivery_slot
       WHERE id = $1`,
      [slotId],
    );

    if (slotResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Delivery slot not found');
    }

    const slot = slotResult.rows[0];

    if (slot.current_bookings >= slot.max_bookings) {
      // Slot is full — suggest next available
      const nextAvailable = await this.getNextAvailableSlot(slot.slot_date);
      const suggestion = nextAvailable
        ? ` Next available slot: ${nextAvailable.slotDate} ${nextAvailable.startTime}–${nextAvailable.endTime}`
        : ' No available slots found in the next 3 days.';

      throw new AppError(
        409,
        ErrorCode.Conflict,
        `Delivery slot is fully booked.${suggestion}`,
        [{ field: 'slotId', message: 'This slot has reached maximum capacity' }],
      );
    }

    // Atomically increment bookings (with re-check to prevent race conditions)
    const updateResult = await this.pool.query(
      `UPDATE delivery_slot
       SET current_bookings = current_bookings + 1
       WHERE id = $1 AND current_bookings < max_bookings
       RETURNING id`,
      [slotId],
    );

    if (updateResult.rows.length === 0) {
      throw new AppError(
        409,
        ErrorCode.Conflict,
        'Delivery slot became fully booked. Please select another slot.',
        [{ field: 'slotId', message: 'Slot is no longer available' }],
      );
    }

    // Associate the slot with the order and set scheduled delivery times
    const startTimestamp = this.buildTimestamp(slot.slot_date, slot.start_time);
    const endTimestamp = this.buildTimestamp(slot.slot_date, slot.end_time);

    await this.pool.query(
      `UPDATE "order"
       SET delivery_slot_id = $1,
           scheduled_delivery_start = $2,
           scheduled_delivery_end = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [slotId, startTimestamp, endTimestamp, orderId],
    );

    // Schedule reservation timeout (15 minutes)
    // In production, this would be handled by a job queue or cron.
    // For now, we record the reservation time on the order for cleanup.
    await this.pool.query(
      `UPDATE "order"
       SET updated_at = NOW()
       WHERE id = $1`,
      [orderId],
    );
  }

  /**
   * Reschedules an order's delivery to a new slot.
   *
   * Constraints:
   * - Maximum 2 reschedules per order
   * - Must be at least 2 hours before the currently scheduled delivery time
   *
   * @param orderId - The order UUID
   * @param newSlotId - The new delivery slot UUID
   * @throws AppError 400 if max reschedules reached
   * @throws AppError 400 if reschedule window has passed
   * @throws AppError 404 if order or slot not found
   * @throws AppError 409 if new slot is fully booked
   */
  async reschedule(orderId: string, newSlotId: string): Promise<void> {
    // Get the order
    const orderResult = await this.pool.query(
      `SELECT id, reschedule_count, scheduled_delivery_start, delivery_slot_id, status
       FROM "order"
       WHERE id = $1`,
      [orderId],
    );

    if (orderResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'Order not found');
    }

    const order = orderResult.rows[0];

    // Check if order is in a reschedulable state
    if (order.status === 'delivered' || order.status === 'cancelled') {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        'Cannot reschedule a delivered or cancelled order',
        [{ field: 'orderId', message: 'Order is not in a reschedulable state' }],
      );
    }

    // Check max reschedules
    if (order.reschedule_count >= MAX_RESCHEDULES) {
      throw new AppError(
        400,
        ErrorCode.ValidationError,
        `Maximum of ${MAX_RESCHEDULES} reschedules allowed per order`,
        [{ field: 'orderId', message: `Order has already been rescheduled ${MAX_RESCHEDULES} times` }],
      );
    }

    // Check minimum advance notice (2 hours before scheduled delivery)
    if (order.scheduled_delivery_start) {
      const scheduledTime = new Date(order.scheduled_delivery_start);
      const now = new Date();
      const hoursUntilDelivery = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilDelivery < RESCHEDULE_MIN_HOURS_BEFORE) {
        throw new AppError(
          400,
          ErrorCode.ValidationError,
          `Reschedule must be requested at least ${RESCHEDULE_MIN_HOURS_BEFORE} hours before the scheduled delivery time`,
          [{ field: 'orderId', message: 'Reschedule window has passed' }],
        );
      }
    }

    // Verify the new slot exists and is available
    const newSlotResult = await this.pool.query(
      `SELECT id, slot_date, start_time, end_time, current_bookings, max_bookings
       FROM delivery_slot
       WHERE id = $1`,
      [newSlotId],
    );

    if (newSlotResult.rows.length === 0) {
      throw new AppError(404, ErrorCode.NotFound, 'New delivery slot not found');
    }

    const newSlot = newSlotResult.rows[0];

    if (newSlot.current_bookings >= newSlot.max_bookings) {
      throw new AppError(
        409,
        ErrorCode.Conflict,
        'New delivery slot is fully booked. Please select another slot.',
        [{ field: 'newSlotId', message: 'Selected slot has reached maximum capacity' }],
      );
    }

    // Release the old slot (decrement bookings)
    if (order.delivery_slot_id) {
      await this.pool.query(
        `UPDATE delivery_slot
         SET current_bookings = GREATEST(0, current_bookings - 1)
         WHERE id = $1`,
        [order.delivery_slot_id],
      );
    }

    // Reserve the new slot (atomically increment)
    const updateSlotResult = await this.pool.query(
      `UPDATE delivery_slot
       SET current_bookings = current_bookings + 1
       WHERE id = $1 AND current_bookings < max_bookings
       RETURNING id`,
      [newSlotId],
    );

    if (updateSlotResult.rows.length === 0) {
      // Rollback old slot release
      if (order.delivery_slot_id) {
        await this.pool.query(
          `UPDATE delivery_slot
           SET current_bookings = current_bookings + 1
           WHERE id = $1`,
          [order.delivery_slot_id],
        );
      }
      throw new AppError(
        409,
        ErrorCode.Conflict,
        'New delivery slot became fully booked. Please select another slot.',
        [{ field: 'newSlotId', message: 'Slot is no longer available' }],
      );
    }

    // Update the order with new slot and increment reschedule count
    const newStartTimestamp = this.buildTimestamp(newSlot.slot_date, newSlot.start_time);
    const newEndTimestamp = this.buildTimestamp(newSlot.slot_date, newSlot.end_time);

    await this.pool.query(
      `UPDATE "order"
       SET delivery_slot_id = $1,
           scheduled_delivery_start = $2,
           scheduled_delivery_end = $3,
           reschedule_count = reschedule_count + 1,
           updated_at = NOW()
       WHERE id = $4`,
      [newSlotId, newStartTimestamp, newEndTimestamp, orderId],
    );
  }

  /**
   * Finds the next available slot after a given date when all slots for that date are booked.
   *
   * @param afterDate - The date after which to search
   * @returns The next available slot, or null if none found
   */
  async getNextAvailableSlot(afterDate: Date | string): Promise<DeliverySlot | null> {
    const dateStr = afterDate instanceof Date
      ? afterDate.toISOString().split('T')[0]
      : String(afterDate);

    const result = await this.pool.query(
      `SELECT id, slot_date, start_time, end_time, current_bookings, max_bookings
       FROM delivery_slot
       WHERE slot_date > $1
         AND current_bookings < max_bookings
       ORDER BY slot_date ASC, start_time ASC
       LIMIT 1`,
      [dateStr],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDeliverySlot(result.rows[0]);
  }

  /**
   * Checks if all slots for a given date are fully booked.
   *
   * @param date - The date to check
   * @returns true if all slots are booked, false otherwise
   */
  async isDayFullyBooked(date: Date): Promise<boolean> {
    const dateStr = date.toISOString().split('T')[0];

    const result = await this.pool.query(
      `SELECT COUNT(*) as available_count
       FROM delivery_slot
       WHERE slot_date = $1
         AND current_bookings < max_bookings`,
      [dateStr],
    );

    return parseInt(result.rows[0].available_count, 10) === 0;
  }

  /**
   * Generates the list of dates for which to show delivery slots.
   * If a specific date is provided, returns just that date.
   * Otherwise, returns the next DELIVERY_SLOT_DAYS days starting from today.
   */
  private getSlotDates(date?: Date | null): Date[] {
    if (date) {
      return [date];
    }

    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < DELIVERY_SLOT_DAYS; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }

    return dates;
  }

  /**
   * Ensures delivery slots exist in the database for the given dates.
   * Creates them if they don't exist (lazy slot generation).
   */
  private async ensureSlotsExist(dates: Date[]): Promise<void> {
    const startHours = getSlotStartHours();

    for (const date of dates) {
      const dateStr = date.toISOString().split('T')[0];

      // Check if slots already exist for this date
      const existingResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM delivery_slot WHERE slot_date = $1',
        [dateStr],
      );

      const existingCount = parseInt(existingResult.rows[0].count, 10);

      if (existingCount >= startHours.length) {
        continue; // Slots already exist for this date
      }

      // Create missing slots
      for (const hour of startHours) {
        const startTime = formatTime(hour);
        const endTime = formatTime(hour + DELIVERY_SLOT_DURATION_HOURS);

        await this.pool.query(
          `INSERT INTO delivery_slot (slot_date, start_time, end_time, current_bookings, max_bookings)
           VALUES ($1, $2, $3, 0, $4)
           ON CONFLICT (slot_date, start_time) DO NOTHING`,
          [dateStr, startTime, endTime, MAX_SLOT_BOOKINGS],
        );
      }
    }
  }

  /**
   * Builds a full timestamp from a date and time value.
   */
  private buildTimestamp(slotDate: Date | string, time: string): string {
    const dateStr = slotDate instanceof Date
      ? slotDate.toISOString().split('T')[0]
      : String(slotDate);
    return `${dateStr}T${time}+08:00`; // PST (Philippine Standard Time = UTC+8)
  }

  /**
   * Maps a database row to a DeliverySlot interface.
   */
  private mapRowToDeliverySlot(row: Record<string, unknown>): DeliverySlot {
    const slotDate = row.slot_date instanceof Date
      ? row.slot_date.toISOString().split('T')[0]
      : String(row.slot_date);

    const currentBookings = Number(row.current_bookings);
    const maxBookings = Number(row.max_bookings);

    return {
      id: String(row.id),
      slotDate,
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      currentBookings,
      maxBookings,
      isAvailable: currentBookings < maxBookings,
    };
  }
}
