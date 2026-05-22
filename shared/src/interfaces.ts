import { OrderStatus, ProductCategory, UserRole } from './enums';

/**
 * Registered user profile data.
 */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  deliveryAddress: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/**
 * A grocery product in the catalog.
 */
export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  unit: string;
  stockQuantity: number;
  description: string;
  nutritionalInfo: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A single item within a shopping cart.
 */
export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/**
 * The user's shopping cart with calculated totals.
 */
export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  costBreakdown: CostBreakdown;
  createdAt: string;
  updatedAt: string;
}

/**
 * Breakdown of costs for a cart or order.
 */
export interface CostBreakdown {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
}

/**
 * An item within a confirmed order (snapshot at time of purchase).
 */
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceAtPurchase: number;
  subtotal: number;
}

/**
 * A confirmed order with delivery and payment details.
 */
export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  deliveryAddress: string;
  scheduledDeliveryStart: string;
  scheduledDeliveryEnd: string;
  estimatedArrival: string | null;
  rescheduleCount: number;
  promoCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * An available delivery time slot.
 */
export interface DeliverySlot {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  currentBookings: number;
  maxBookings: number;
  isAvailable: boolean;
}

/**
 * JWT token pair returned on successful authentication.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generic paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
