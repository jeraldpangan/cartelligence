import { DeliveryService } from './delivery.service';
import { ErrorCode } from '@shared/errors';
import {
  MAX_SLOT_BOOKINGS,
  MAX_RESCHEDULES,
  DELIVERY_SLOT_START_HOUR,
  DELIVERY_SLOT_END_HOUR,
  DELIVERY_SLOT_DURATION_HOURS,
  DELIVERY_SLOT_DAYS,
} from '@shared/validation';

// Mock database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  connect: jest.fn(),
  end: jest.fn(),
} as any;

// Mock the database module import
jest.mock('../config/database', () => ({
  getDatabasePool: () => mockPool,
}));

describe('DeliveryService', () => {
  let service: DeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeliveryService(mockPool);
  });

  describe('getAvailableSlots', () => {
    it('should return available slots for the next 3 days', async () => {
      // Mock: slots already exist
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '7' }] }; // Slots already exist
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('current_bookings < max_bookings')) {
          return {
            rows: [
              {
                id: 'slot-1',
                slot_date: new Date('2024-06-01'),
                start_time: '08:00:00',
                end_time: '10:00:00',
                current_bookings: 5,
                max_bookings: 20,
              },
              {
                id: 'slot-2',
                slot_date: new Date('2024-06-01'),
                start_time: '10:00:00',
                end_time: '12:00:00',
                current_bookings: 0,
                max_bookings: 20,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const slots = await service.getAvailableSlots();

      expect(slots).toHaveLength(2);
      expect(slots[0].id).toBe('slot-1');
      expect(slots[0].startTime).toBe('08:00:00');
      expect(slots[0].endTime).toBe('10:00:00');
      expect(slots[0].isAvailable).toBe(true);
      expect(slots[1].startTime).toBe('10:00:00');
    });

    it('should create slots lazily if they do not exist', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '0' }] }; // No slots exist
        }
        if (sql.includes('INSERT INTO delivery_slot')) {
          return { rows: [] };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('current_bookings < max_bookings')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await service.getAvailableSlots();

      // Should have called INSERT for each slot across DELIVERY_SLOT_DAYS days
      const insertCalls = mockQuery.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO delivery_slot'),
      );
      const expectedSlotsPerDay = Math.floor(
        (DELIVERY_SLOT_END_HOUR - DELIVERY_SLOT_START_HOUR) / DELIVERY_SLOT_DURATION_HOURS,
      ) + 1; // +1 because start at 8, end at 21, so 8,10,12,14,16,18 = 6... but 19 start is valid too = 7
      // Actually: start hours from 8 to (21-2)=19, step 2: 8,10,12,14,16,18 = 6 slots
      // Wait: the loop goes h += 2 from 8 to 19 inclusive: 8,10,12,14,16,18 = 6 slots
      expect(insertCalls.length).toBe(6 * DELIVERY_SLOT_DAYS);
    });

    it('should only return slots with current_bookings < max_bookings', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '7' }] };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('current_bookings < max_bookings')) {
          return {
            rows: [
              {
                id: 'slot-1',
                slot_date: new Date('2024-06-01'),
                start_time: '08:00:00',
                end_time: '10:00:00',
                current_bookings: 19,
                max_bookings: 20,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const slots = await service.getAvailableSlots();
      expect(slots).toHaveLength(1);
      expect(slots[0].currentBookings).toBe(19);
      expect(slots[0].isAvailable).toBe(true);
    });

    it('should return slots for a specific date when provided', async () => {
      const specificDate = new Date('2024-06-15');

      mockQuery.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ count: '7' }] };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('current_bookings < max_bookings')) {
          // Verify only the specific date is queried
          expect(params![0]).toHaveLength(1);
          return { rows: [] };
        }
        return { rows: [] };
      });

      const slots = await service.getAvailableSlots(specificDate);
      expect(slots).toHaveLength(0);
    });
  });

  describe('reserveSlot', () => {
    const orderId = 'order-123';
    const slotId = 'slot-456';

    it('should reserve a slot successfully', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: slotId,
              slot_date: '2024-06-01',
              start_time: '08:00:00',
              end_time: '10:00:00',
              current_bookings: 5,
              max_bookings: 20,
            }],
          };
        }
        if (sql.includes('UPDATE delivery_slot') && sql.includes('current_bookings + 1')) {
          return { rows: [{ id: slotId }] };
        }
        if (sql.includes('UPDATE "order"')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.reserveSlot(orderId, slotId)).resolves.toBeUndefined();
    });

    it('should throw 404 when slot not found', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.reserveSlot(orderId, slotId)).rejects.toMatchObject({
        statusCode: 404,
        code: ErrorCode.NotFound,
      });
    });

    it('should throw 409 when slot is fully booked', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: slotId,
              slot_date: '2024-06-01',
              start_time: '08:00:00',
              end_time: '10:00:00',
              current_bookings: 20,
              max_bookings: 20,
            }],
          };
        }
        // getNextAvailableSlot query
        if (sql.includes('slot_date >') && sql.includes('current_bookings < max_bookings')) {
          return {
            rows: [{
              id: 'slot-next',
              slot_date: new Date('2024-06-02'),
              start_time: '08:00:00',
              end_time: '10:00:00',
              current_bookings: 0,
              max_bookings: 20,
            }],
          };
        }
        return { rows: [] };
      });

      await expect(service.reserveSlot(orderId, slotId)).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCode.Conflict,
      });
    });

    it('should handle race condition when slot becomes full during reservation', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: slotId,
              slot_date: '2024-06-01',
              start_time: '08:00:00',
              end_time: '10:00:00',
              current_bookings: 19,
              max_bookings: 20,
            }],
          };
        }
        // Atomic update fails (someone else took the last spot)
        if (sql.includes('UPDATE delivery_slot') && sql.includes('current_bookings + 1')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.reserveSlot(orderId, slotId)).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCode.Conflict,
      });
    });

    it('should suggest next available slot when current is full', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: slotId,
              slot_date: '2024-06-01',
              start_time: '18:00:00',
              end_time: '20:00:00',
              current_bookings: 20,
              max_bookings: 20,
            }],
          };
        }
        if (sql.includes('slot_date >') && sql.includes('current_bookings < max_bookings')) {
          return {
            rows: [{
              id: 'slot-next',
              slot_date: new Date('2024-06-02'),
              start_time: '08:00:00',
              end_time: '10:00:00',
              current_bookings: 0,
              max_bookings: 20,
            }],
          };
        }
        return { rows: [] };
      });

      try {
        await service.reserveSlot(orderId, slotId);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.message).toContain('Next available slot');
      }
    });
  });

  describe('reschedule', () => {
    const orderId = 'order-123';
    const newSlotId = 'slot-new';
    const oldSlotId = 'slot-old';

    // Future delivery time (well ahead of now)
    const futureDelivery = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    it('should reschedule successfully when constraints are met', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 0,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'confirmed',
            }],
          };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: newSlotId,
              slot_date: '2024-06-02',
              start_time: '10:00:00',
              end_time: '12:00:00',
              current_bookings: 5,
              max_bookings: 20,
            }],
          };
        }
        if (sql.includes('UPDATE delivery_slot') && sql.includes('GREATEST')) {
          return { rows: [] }; // Release old slot
        }
        if (sql.includes('UPDATE delivery_slot') && sql.includes('current_bookings + 1')) {
          return { rows: [{ id: newSlotId }] }; // Reserve new slot
        }
        if (sql.includes('UPDATE "order"')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.reschedule(orderId, newSlotId)).resolves.toBeUndefined();
    });

    it('should throw 404 when order not found', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.reschedule(orderId, newSlotId)).rejects.toMatchObject({
        statusCode: 404,
        code: ErrorCode.NotFound,
      });
    });

    it('should throw 400 when max reschedules (2) reached', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: MAX_RESCHEDULES,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'confirmed',
            }],
          };
        }
        return { rows: [] };
      });

      try {
        await service.reschedule(orderId, newSlotId);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe(ErrorCode.ValidationError);
        expect(err.message).toContain(`${MAX_RESCHEDULES}`);
      }
    });

    it('should throw 400 when less than 2 hours before scheduled delivery', async () => {
      // Delivery is in 1 hour (less than RESCHEDULE_MIN_HOURS_BEFORE)
      const soonDelivery = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 0,
              scheduled_delivery_start: soonDelivery,
              delivery_slot_id: oldSlotId,
              status: 'confirmed',
            }],
          };
        }
        return { rows: [] };
      });

      try {
        await service.reschedule(orderId, newSlotId);
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe(ErrorCode.ValidationError);
        expect(err.message).toContain('2 hours');
      }
    });

    it('should throw 400 when order is delivered', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 0,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'delivered',
            }],
          };
        }
        return { rows: [] };
      });

      await expect(service.reschedule(orderId, newSlotId)).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should throw 400 when order is cancelled', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 0,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'cancelled',
            }],
          };
        }
        return { rows: [] };
      });

      await expect(service.reschedule(orderId, newSlotId)).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCode.ValidationError,
      });
    });

    it('should throw 409 when new slot is fully booked', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 0,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'confirmed',
            }],
          };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: newSlotId,
              slot_date: '2024-06-02',
              start_time: '10:00:00',
              end_time: '12:00:00',
              current_bookings: 20,
              max_bookings: 20,
            }],
          };
        }
        return { rows: [] };
      });

      await expect(service.reschedule(orderId, newSlotId)).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCode.Conflict,
      });
    });

    it('should throw 404 when new slot not found', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 0,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'confirmed',
            }],
          };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.reschedule(orderId, newSlotId)).rejects.toMatchObject({
        statusCode: 404,
        code: ErrorCode.NotFound,
      });
    });

    it('should release old slot and reserve new slot on reschedule', async () => {
      const calls: string[] = [];

      mockQuery.mockImplementation((sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM "order"') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: orderId,
              reschedule_count: 1,
              scheduled_delivery_start: futureDelivery,
              delivery_slot_id: oldSlotId,
              status: 'being_prepared',
            }],
          };
        }
        if (sql.includes('FROM delivery_slot') && sql.includes('WHERE id')) {
          return {
            rows: [{
              id: newSlotId,
              slot_date: '2024-06-02',
              start_time: '14:00:00',
              end_time: '16:00:00',
              current_bookings: 10,
              max_bookings: 20,
            }],
          };
        }
        if (sql.includes('UPDATE delivery_slot') && sql.includes('GREATEST')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE delivery_slot') && sql.includes('current_bookings + 1')) {
          return { rows: [{ id: newSlotId }] };
        }
        if (sql.includes('UPDATE "order"')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await service.reschedule(orderId, newSlotId);

      // Verify old slot was released (GREATEST(0, current_bookings - 1))
      const releaseCall = calls.find((c) => c.includes('GREATEST'));
      expect(releaseCall).toBeDefined();

      // Verify new slot was reserved
      const reserveCall = calls.find((c) => c.includes('current_bookings + 1'));
      expect(reserveCall).toBeDefined();

      // Verify order was updated with reschedule_count + 1
      const orderUpdateCall = calls.find(
        (c) => c.includes('UPDATE "order"') && c.includes('reschedule_count'),
      );
      expect(orderUpdateCall).toBeDefined();
    });
  });

  describe('getNextAvailableSlot', () => {
    it('should return the next available slot after a given date', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('slot_date >') && sql.includes('LIMIT 1')) {
          return {
            rows: [{
              id: 'slot-next',
              slot_date: new Date('2024-06-03'),
              start_time: '08:00:00',
              end_time: '10:00:00',
              current_bookings: 0,
              max_bookings: 20,
            }],
          };
        }
        return { rows: [] };
      });

      const slot = await service.getNextAvailableSlot(new Date('2024-06-02'));
      expect(slot).not.toBeNull();
      expect(slot!.startTime).toBe('08:00:00');
    });

    it('should return null when no slots are available', async () => {
      mockQuery.mockImplementation(() => ({ rows: [] }));

      const slot = await service.getNextAvailableSlot(new Date('2024-06-02'));
      expect(slot).toBeNull();
    });
  });

  describe('isDayFullyBooked', () => {
    it('should return true when all slots are booked', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('current_bookings < max_bookings')) {
          return { rows: [{ available_count: '0' }] };
        }
        return { rows: [] };
      });

      const result = await service.isDayFullyBooked(new Date('2024-06-01'));
      expect(result).toBe(true);
    });

    it('should return false when some slots are available', async () => {
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('current_bookings < max_bookings')) {
          return { rows: [{ available_count: '3' }] };
        }
        return { rows: [] };
      });

      const result = await service.isDayFullyBooked(new Date('2024-06-01'));
      expect(result).toBe(false);
    });
  });
});
