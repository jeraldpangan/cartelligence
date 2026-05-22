# Implementation Plan: Cartelligence Grocery App

## Overview

This plan implements the Cartelligence AI-powered grocery e-commerce platform as a monorepo with `client/` (Angular 16+) and `server/` (Node.js) directories. The implementation proceeds from foundational infrastructure through core services, then integrates frontend components, real-time features, and finally wires everything together with end-to-end validation.

## Tasks

- [x] 1. Set up project structure, database schema, and shared interfaces
  - [x] 1.1 Initialize monorepo with client/ and server/ directories
    - Initialize Node.js project in `server/` with TypeScript, Express, Socket.IO, pg (PostgreSQL), ioredis, bcrypt, jsonwebtoken, fast-check, and Jest
    - Initialize Angular 16+ project in `client/` with Angular Material, Socket.IO client
    - Configure monochrome Angular Material theme (black, white, grayscale palette)
    - Set up ESLint, Prettier, and shared tsconfig paths
    - _Requirements: 8.1, 8.5, 10.2, 10.3_

  - [x] 1.2 Create PostgreSQL database schema and migrations
    - Create migration files for all entities: USER_PROFILE, PRODUCT, CART, CART_ITEM, ORDER, ORDER_ITEM, DELIVERY_SLOT, RECOMMENDATION_DISMISSAL, PURCHASE_HISTORY, PASSWORD_RESET_TOKEN
    - Implement all constraints from the Data Models section (enums, ranges, unique keys, foreign keys)
    - Add indexes for email lookups, product category, product name search, order status, and delivery slot date
    - Seed script with sample products across all 7 categories
    - _Requirements: 10.1, 10.4, 10.5_

  - [x] 1.3 Define shared TypeScript interfaces and types
    - Create DTOs for registration, login, cart operations, orders, delivery slots
    - Define enums for product categories, order statuses
    - Define error response format interface matching design spec
    - Create shared validation schemas (email, password, name, address, quantity constraints)
    - _Requirements: 1.1, 10.8_

  - [x] 1.4 Set up API server with middleware and error handling
    - Configure Express server with versioned routes (`/api/v1/`)
    - Implement global error handling middleware with structured error responses
    - Implement request validation middleware using shared schemas
    - Set up TLS configuration and CORS
    - Configure Redis connection for caching
    - _Requirements: 10.2, 10.5, 10.6_

- [ ] 2. Implement authentication system
  - [x] 2.1 Implement AuthService with registration and login
    - Implement `register()`: validate input, check duplicate email, hash password with bcrypt (cost factor 12), create USER_PROFILE
    - Implement `login()`: authenticate credentials, check lockout status, generate JWT access token (30-min expiry) and refresh token
    - Implement `handleFailedLogin()`: increment failure count, lock account after 3 consecutive failures for 15 minutes, send lockout email
    - Implement `refreshToken()`: validate refresh token, issue new access token
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_

  - [x] 2.2 Implement password reset flow
    - Implement `requestPasswordReset()`: generate token (15-min expiry), send reset email
    - Implement `confirmPasswordReset()`: validate token, update password hash
    - Ensure reset tokens are single-use
    - _Requirements: 1.4_

  - [x] 2.3 Create Auth API route handlers
    - POST `/api/v1/auth/register` — registration endpoint
    - POST `/api/v1/auth/login` — login endpoint
    - POST `/api/v1/auth/logout` — invalidate refresh token
    - POST `/api/v1/auth/password-reset/request` — request reset
    - POST `/api/v1/auth/password-reset/confirm` — confirm reset
    - POST `/api/v1/auth/token/refresh` — refresh access token
    - Implement JWT authentication middleware for protected routes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.2_

  - [ ]* 2.4 Write property test for registration validation (Property 1)
    - **Property 1: Registration validation correctness**
    - Generate random registration payloads (emails, passwords 0–100 chars, names 0–200 chars, addresses 0–300 chars)
    - Assert acceptance if and only if all fields meet validation rules
    - Assert rejected payloads identify exactly which fields failed
    - **Validates: Requirements 1.1, 1.7**

  - [ ]* 2.5 Write unit tests for auth service
    - Test successful registration with valid inputs
    - Test duplicate email rejection
    - Test login with valid/invalid credentials
    - Test account lockout at exactly 3 failures
    - Test lockout expiry after 15 minutes
    - Test password reset token generation and expiry
    - Test JWT token refresh flow
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Implement Product Catalog service and API
  - [x] 3.1 Implement Product Catalog service
    - Implement `getCategories()`: return 7 grocery categories
    - Implement `getProductsByCategory(categoryId, page)`: paginated (20/page), only available products
    - Implement `searchProducts(query, page)`: text search (2–100 chars), paginated (20/page), case-insensitive name match
    - Implement `getProductById(id)`: single product detail
    - Cache product data in Redis for sub-200ms response times
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Create Products API route handlers
    - GET `/api/v1/products/categories` — list categories
    - GET `/api/v1/products/categories/:id/products` — products by category (paginated)
    - GET `/api/v1/products/search?q=` — search products
    - GET `/api/v1/products/:id` — product detail
    - Format all prices in PHP with 2 decimal places
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 10.2_

  - [ ]* 3.3 Write property tests for product catalog (Properties 2, 3)
    - **Property 2: Category filtering and pagination**
    - Generate random product lists and category selections; assert results contain only matching category products, max 20 per page, only available products
    - **Property 3: Search results correctness**
    - Generate random product names and search queries (2–100 chars); assert all results contain query text (case-insensitive), max 20 results
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 3.4 Write unit tests for product catalog
    - Test category listing returns all 7 categories
    - Test pagination returns max 20 products
    - Test search with min/max length queries
    - Test empty results message for no matches
    - Test out-of-stock products marked unavailable
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Smart Cart and Cost Calculator services
  - [x] 5.1 Implement SmartCartService
    - Implement `addItem()`: validate stock availability, enforce 50-item limit, reject if stock exceeded (return max available), add to cart
    - Implement `removeItem()`: remove item, trigger recalculation
    - Implement `updateQuantity()`: validate 1–99 range, remove if quantity ≤ 0, update and recalculate
    - Implement `getCart()`: return full cart with all items and calculated totals
    - Cache cart state in Redis for sub-500ms operations
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.9_

  - [x] 5.2 Implement CostCalculatorService
    - Implement `calculateTotal()`: compute subtotal as sum of round_half_up(unit_price × quantity, 2) for each item, constrained to 0.00–9,999,999.99 PHP
    - Implement `applyDiscount()`: grand_total = max(0, subtotal + delivery_fee - discount)
    - Implement `formatCurrency()`: format as "₱X,XXX.XX" with exactly 2 decimal places
    - Handle promo code validation and discount application
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 5.3 Create Cart API route handlers
    - GET `/api/v1/cart/` — get current cart contents with totals
    - POST `/api/v1/cart/items` — add item to cart
    - PATCH `/api/v1/cart/items/:id` — update item quantity
    - DELETE `/api/v1/cart/items/:id` — remove item from cart
    - All responses include full cost breakdown (subtotal, delivery fee, discount, grand total)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.2, 10.2_

  - [ ]* 5.4 Write property tests for cart and cost calculator (Properties 4, 5, 6, 7, 8)
    - **Property 4: Currency formatting invariant**
    - Generate random decimal numbers; assert formatted output has "₱" prefix and exactly 2 decimal places
    - **Property 5: Out-of-stock cart prevention**
    - Generate random products with stock=0; assert add operations are rejected and cart unchanged
    - **Property 6: Cart total calculation invariant**
    - Generate random sequences of cart operations; assert subtotal equals sum of round_half_up(price × qty, 2), within 0.00–9,999,999.99
    - **Property 7: Grand total formula invariant**
    - Generate random subtotals, delivery fees, discounts; assert grand_total = max(0, subtotal + fee - discount)
    - **Property 8: Recommendation count bounds** (cart-based portion)
    - Generate random carts with 3+ items; assert 0–5 recommendations returned
    - **Validates: Requirements 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

  - [ ]* 5.5 Write unit tests for cart and cost calculator
    - Test adding item to cart updates total within constraints
    - Test adding 51st distinct item is rejected
    - Test quantity set to 0 removes item
    - Test negative quantity removes item
    - Test stock exceeded returns max available quantity
    - Test empty cart shows 0.00 for all totals
    - Test discount exceeding total sets grand total to 0.00
    - Test currency formatting edge cases
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.9, 5.1, 5.6, 5.7_

- [x] 6. Implement Recommendation Engine
  - [x] 6.1 Implement RecommendationService
    - Implement `getPersonalized()`: up to 10 items from purchase history (requires ≥1 order)
    - Implement `getCartBased()`: up to 5 co-purchased items using item co-occurrence (requires ≥3 cart items)
    - Implement `getRelated()`: up to 5 items by category affinity and purchase correlation
    - Implement `getReorderReminders()`: products in ≥2 of last 5 orders (requires ≥3 orders)
    - Implement `dismissRecommendation()`: exclude product for 30 days
    - Implement `getFallback()`: top 10 selling products for new users or engine failure
    - Handle engine unavailability gracefully (return null with status message)
    - _Requirements: 3.5, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.2 Create Recommendations API route handlers
    - GET `/api/v1/recommendations/personalized` — personalized list (up to 10)
    - GET `/api/v1/recommendations/cart-based` — cart-based suggestions (up to 5)
    - GET `/api/v1/recommendations/product/:id/related` — related products (up to 5)
    - POST `/api/v1/recommendations/dismiss/:productId` — dismiss for 30 days
    - _Requirements: 3.5, 4.1, 4.2, 4.3, 4.5, 10.2_

  - [ ]* 6.3 Write property tests for recommendations (Properties 9, 10, 11, 12)
    - **Property 9: Personalized recommendation cap**
    - Generate random users with ≥1 order; assert 0–10 personalized recommendations returned
    - **Property 10: Reorder identification correctness**
    - Generate random order histories (≥3 orders); assert reorder list contains only products in ≥2 of last 5 orders
    - **Property 11: Dismissed recommendation exclusion**
    - Generate random dismissals with timestamps; assert dismissed products excluded for 30 days
    - **Property 8 (continued): Recommendation count bounds**
    - Generate random carts with varying item counts; assert cart-based recommendations only when ≥3 items, max 5 returned
    - **Validates: Requirements 3.5, 4.1, 4.2, 4.5**

  - [ ]* 6.4 Write unit tests for recommendation engine
    - Test personalized recommendations for user with 1 order
    - Test reorder reminders for user with 3+ orders
    - Test cart-based recommendations only trigger at 3+ items
    - Test dismissed product excluded for 30 days
    - Test fallback to top-selling for new users
    - Test engine unavailability returns graceful fallback
    - _Requirements: 3.5, 3.8, 4.1, 4.2, 4.5, 4.6, 4.7_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Order and Delivery services
  - [x] 8.1 Implement OrderService
    - Implement `initiateCheckout()`: validate non-empty cart, verify stock for all items, return checkout summary (items, total, address, payment options)
    - Implement `confirmOrder()`: re-verify stock, process payment (support credit/debit card and digital wallet), generate order number, send confirmation email
    - Implement `getActiveOrders()`: return up to 20 active orders
    - Handle payment failures with retry logic (up to 3 attempts)
    - Prevent checkout with empty cart
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 8.2 Implement DeliveryService
    - Implement `getAvailableSlots()`: 2-hour windows between 8:00 AM–9:00 PM PST, next 3 days, max 20 orders/slot
    - Implement `reserveSlot()`: 15-minute reservation timeout
    - Implement `reschedule()`: max 2 reschedules, minimum 2-hour advance notice
    - Handle fully booked days (suggest next available)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 8.3 Create Orders and Delivery API route handlers
    - POST `/api/v1/orders/checkout` — initiate checkout
    - POST `/api/v1/orders/confirm` — confirm and process payment
    - GET `/api/v1/orders/` — list user's orders (paginated)
    - GET `/api/v1/orders/:id` — order detail
    - GET `/api/v1/orders/active` — active orders (up to 20)
    - GET `/api/v1/delivery/slots?date=` — available slots for date
    - POST `/api/v1/delivery/orders/:id/reschedule` — reschedule delivery
    - _Requirements: 7.1, 7.2, 9.1, 9.5, 10.2_

  - [ ]* 8.4 Write property tests for orders and delivery (Properties 12, 13, 14, 15, 16)
    - **Property 12: Active orders pagination**
    - Generate random order lists with mixed statuses; assert max 20 returned, all non-delivered
    - **Property 13: Stock verification at checkout**
    - Generate random carts and stock levels; assert order rejected when any item exceeds stock, unavailable items identified
    - **Property 14: Delivery slot generation rules**
    - Generate random dates; assert all slots are 2-hour windows, start times 08:00–19:00 PST, max 20 bookings per slot, spans 3 days
    - **Property 15: Reschedule rule enforcement**
    - Generate random orders with reschedule counts and times; assert accepted iff count < 2 AND ≥2 hours before delivery
    - **Property 16: Write request schema validation**
    - Generate random payloads with invalid fields; assert rejected with field-level errors, no data persisted
    - **Validates: Requirements 6.4, 7.7, 9.1, 9.3, 9.5, 9.6, 10.8**

  - [ ]* 8.5 Write unit tests for order and delivery services
    - Test empty cart checkout prevention
    - Test payment failure retry (max 3 attempts)
    - Test stock verification rejects unavailable items
    - Test delivery slot generation for 3 days
    - Test slot reservation expires after 15 minutes
    - Test reschedule rejected when < 2 hours before delivery
    - Test reschedule rejected after 2 reschedules
    - Test all slots booked suggests next available day
    - _Requirements: 7.4, 7.6, 7.7, 9.2, 9.4, 9.5, 9.6_

- [x] 9. Implement real-time tracking with WebSocket
  - [x] 9.1 Implement CartTrackerService and WebSocket server
    - Set up Socket.IO server on `/ws/tracking` namespace
    - Implement `updateStatus()`: push order status changes (confirmed, being_prepared, out_for_delivery, delivered) via WebSocket within 5 seconds
    - Implement `calculateETA()`: return estimated arrival or null if unavailable
    - Implement `handleDelayNotification()`: notify if >15 minutes past ETA
    - Implement ETA update broadcast every 60 seconds for orders in "out_for_delivery" status
    - Handle client subscribe/unsubscribe events
    - Implement reconnection with exponential backoff (1s, 2s, 4s, max 30s)
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_

  - [x] 9.2 Implement notification service
    - Push order status change notifications within 5 seconds
    - Push delay notifications when >15 minutes past ETA
    - Push ETA unavailability messages with retry every 60 seconds
    - _Requirements: 6.2, 6.5, 6.7_

  - [ ]* 9.3 Write unit tests for tracking service
    - Test status update pushes via WebSocket
    - Test ETA updates every 60 seconds during delivery
    - Test delay notification when >15 min past ETA
    - Test graceful handling when ETA unavailable
    - Test offline indicator shows last known status with staleness time
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Angular frontend - Auth and Catalog modules
  - [x] 11.1 Implement Auth module components
    - Create LoginComponent with email/password form, validation, lockout messaging
    - Create RegisterComponent with real-time field validation (email, password strength, name, address)
    - Create PasswordResetComponent for reset request and new password form
    - Implement AuthService (Angular) for JWT storage, refresh token logic, HTTP interceptor for auth headers
    - Implement route guards for protected pages
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.5_

  - [x] 11.2 Implement Catalog module components
    - Create CategoryListComponent displaying 7 categories in responsive grid
    - Create ProductListComponent with paginated product grid (20/page), stock status indicators
    - Create ProductDetailComponent with related recommendations display
    - Create SearchBarComponent with debounced input (min 2 chars, max 100 chars)
    - Display all prices in "₱X,XXX.XX" format
    - Handle empty results with "no products found" message
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1, 8.5_

  - [x] 11.3 Implement Layout module and responsive design
    - Create HeaderComponent with navigation, cart icon with item count badge
    - Create FooterComponent with links and tagline "Click.Cart. Delivered."
    - Create LandingPageComponent with tagline display and login/register CTAs
    - Implement responsive breakpoints: mobile (320–767px), tablet (768–1023px), desktop (1024–1920px)
    - Ensure minimum contrast ratio 4.5:1 for normal text, 3:1 for large text
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

- [x] 12. Implement Angular frontend - Cart, Order, and Tracking modules
  - [x] 12.1 Implement Cart module components
    - Create SmartCartComponent with item list, quantities, and totals display
    - Create CartItemComponent with quantity controls (1–99 range, remove on 0)
    - Create RecommendationPanelComponent showing up to 5 suggestions when cart has 3+ items
    - Create CostBreakdownComponent displaying subtotal, delivery fee, discount, grand total
    - Wire to Cart API with sub-500ms response handling
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 5.2, 5.3, 5.5_

  - [x] 12.2 Implement Order module components
    - Create CheckoutComponent with order summary, delivery slot selection, payment method choice
    - Create PaymentComponent with payment form and retry logic (up to 3 attempts)
    - Create OrderConfirmationComponent with success screen and order number
    - Create DeliverySchedulerComponent with time slot picker for next 3 days
    - Handle stock conflicts and payment failures with user-friendly messages
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 9.1, 9.2_

  - [x] 12.3 Implement Tracking module components
    - Create OrderTrackerComponent with real-time status display (confirmed → being_prepared → out_for_delivery → delivered)
    - Create OrderListComponent showing up to 20 active orders
    - Create ETADisplayComponent with countdown updating every 60 seconds
    - Create OfflineIndicatorComponent showing last-known status with staleness time when disconnected
    - Implement Socket.IO client connection with exponential backoff reconnection
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 13. Implement database resilience and write validation
  - [x] 13.1 Implement database connection resilience
    - Implement connection retry logic: 3 retries with 2-second intervals
    - Return 503 error response within 5 seconds if all retries fail
    - Implement query timeout at 5-second threshold
    - Ensure no partial writes on failure
    - _Requirements: 10.4, 10.6_

  - [x] 13.2 Implement write request validation middleware
    - Validate all required fields and data types against defined schemas before persisting
    - Reject invalid requests with error response identifying which fields failed
    - Ensure no data persisted for rejected requests
    - Apply to all POST, PUT, PATCH endpoints
    - _Requirements: 10.8_

  - [ ]* 13.3 Write property test for write request validation (Property 16)
    - **Property 16: Write request schema validation**
    - Generate random payloads with combinations of valid/invalid fields for each write endpoint
    - Assert invalid requests rejected with field-level error details
    - Assert no data persisted for rejected requests
    - **Validates: Requirements 10.8**

  - [ ]* 13.4 Write unit tests for database resilience
    - Test connection retry behavior (3 attempts, 2s interval)
    - Test 503 response after all retries exhausted
    - Test query timeout handling
    - Test no partial writes on failure
    - _Requirements: 10.6_

- [x] 14. Integration wiring and end-to-end validation
  - [x] 14.1 Wire all frontend modules to backend APIs
    - Connect Auth module to `/api/v1/auth` endpoints
    - Connect Catalog module to `/api/v1/products` endpoints
    - Connect Cart module to `/api/v1/cart` endpoints
    - Connect Recommendations to `/api/v1/recommendations` endpoints
    - Connect Orders to `/api/v1/orders` and `/api/v1/delivery` endpoints
    - Connect Tracking module to WebSocket `/ws/tracking`
    - Implement global HTTP error interceptor for structured error handling
    - _Requirements: 10.2, 10.3_

  - [x] 14.2 Implement email notification service integration
    - Send order confirmation email with order number, items, quantities, total, delivery slot, address within 60 seconds
    - Send account lockout notification email
    - Send password reset email with token link (15-min expiry)
    - _Requirements: 1.3, 1.4, 7.5_

  - [ ]* 14.3 Write integration tests
    - Test full registration → login → browse → add to cart → checkout flow
    - Test WebSocket order status update delivery within 5 seconds
    - Test payment gateway integration with mock
    - Test email delivery with mock SMTP
    - Test database query performance < 200ms for indexed queries
    - _Requirements: 1.2, 6.1, 7.2, 7.5, 10.4_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with minimum 100 iterations
- Unit tests validate specific examples and edge cases using Jest
- The monorepo structure keeps client/ and server/ co-located for easier development
- Redis caching is critical for meeting sub-500ms cart operation requirements
- WebSocket (Socket.IO) handles all real-time tracking and notification requirements
- All monetary values use decimal(10,2) with round-half-up and "₱" prefix formatting

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "3.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "3.2"] },
    { "id": 5, "tasks": ["2.4", "2.5", "3.3", "3.4"] },
    { "id": 6, "tasks": ["5.1", "5.2"] },
    { "id": 7, "tasks": ["5.3", "6.1"] },
    { "id": 8, "tasks": ["5.4", "5.5", "6.2"] },
    { "id": 9, "tasks": ["6.3", "6.4"] },
    { "id": 10, "tasks": ["8.1", "8.2"] },
    { "id": 11, "tasks": ["8.3", "9.1"] },
    { "id": 12, "tasks": ["8.4", "8.5", "9.2"] },
    { "id": 13, "tasks": ["9.3", "11.1", "11.2", "11.3"] },
    { "id": 14, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 15, "tasks": ["13.1", "13.2"] },
    { "id": 16, "tasks": ["13.3", "13.4"] },
    { "id": 17, "tasks": ["14.1", "14.2"] },
    { "id": 18, "tasks": ["14.3"] }
  ]
}
```
