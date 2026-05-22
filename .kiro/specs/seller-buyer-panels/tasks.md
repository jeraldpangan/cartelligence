# Implementation Plan: Seller & Buyer Panels

## Overview

This plan implements role-based access control, seller product management (CRUD with image uploads), seller order management with real-time WebSocket notifications, and buyer product reviews for the Cartelligence platform. Tasks are ordered by dependency: database schema first, then backend services/middleware, then frontend components, with integration wiring at the end.

## Tasks

- [x] 1. Database schema changes and role infrastructure
  - [x] 1.1 Create database migration for role enum, schema alterations, and new tables
    - Create the `user_role` enum type (`buyer`, `seller`)
    - Add `role` column to `user_profile` table with default `'buyer'`
    - Add `seller_id` column to `product` table with FK to `user_profile(id)`
    - Create `product_image` table with sort_order constraint and indexes
    - Create `product_review` table with rating range, comment length, and unique constraints plus indexes
    - Create index `idx_product_seller` on `product(seller_id)`
    - _Requirements: 1.1, 2.1, 3.4, 5.6_

  - [x] 1.2 Extend the User model and auth payload with role field
    - Add `role` field to the User interface/type
    - Update the `AuthPayload` interface to include `role: UserRole`
    - Update JWT token generation in the auth service to include the user's role claim
    - Update JWT token verification to extract and attach the role to `req.user`
    - _Requirements: 1.3, 1.1_

- [x] 2. Backend role middleware and authorization
  - [x] 2.1 Implement `requireRole()` Express middleware
    - Create `requireRole(...roles: UserRole[]): RequestHandler` function
    - If `req.user.role` is not in the allowed roles array, throw AppError(403) with message indicating required role
    - If role matches, call `next()` to proceed
    - _Requirements: 1.5, 1.6, 1.7_

  - [ ]* 2.2 Write property test for role-based access enforcement
    - **Property 1: Role-Based Access Enforcement**
    - **Validates: Requirements 1.4, 1.5, 1.6**

  - [ ]* 2.3 Write unit tests for requireRole middleware
    - Test allow access for matching role
    - Test deny with 403 for non-matching role
    - Test multiple allowed roles
    - _Requirements: 1.5, 1.6, 1.7_

- [x] 3. Backend seller product service
  - [x] 3.1 Implement the Upload Service for image processing
    - Create `UploadService` class with `processImages(files)` method
    - Configure Multer for local disk storage with UUID-based filenames
    - Validate file MIME type (JPEG, PNG, WebP only) from file header
    - Validate file size (≤ 5MB per file)
    - Implement `cleanupFiles()` for rollback on failure
    - Return array of `{ url, filename }` for each processed file
    - _Requirements: 3.1, 3.2, 3.4, 3.7_

  - [x] 3.2 Implement the Seller Product Service (CRUD operations)
    - Create `SellerService` class with `createProduct()`, `getSellerProducts()`, `updateProduct()`, `deleteProduct()`, `toggleAvailability()` methods
    - `createProduct()`: insert product with `seller_id`, process images, insert `product_image` records, invalidate cache
    - `getSellerProducts()`: paginated query (20/page) filtered by `seller_id`, excluding soft-deleted
    - `updateProduct()`: verify ownership, validate fields, update record, invalidate cache
    - `deleteProduct()`: verify ownership, soft-delete (mark as deleted), invalidate cache
    - `toggleAvailability()`: verify ownership, flip `is_available` flag
    - Validate product fields: name (1–255 chars), category (valid enum), unit_price (0.01–9999999.99, 2 decimals), unit (1–50 chars), stock_quantity (non-negative int ≤ 999999)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.3, 3.5, 3.6_

  - [ ]* 3.3 Write property test for product ownership invariant
    - **Property 2: Product Ownership Invariant**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7**

  - [ ]* 3.4 Write property test for image upload constraints
    - **Property 3: Image Upload Constraints**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 3.5 Write property test for product image ordering
    - **Property 10: Product Image Ordering**
    - **Validates: Requirements 3.5, 3.6**

- [x] 4. Backend seller product routes
  - [x] 4.1 Create seller product API routes and controller
    - `GET /api/v1/seller/products` — list seller's products (paginated)
    - `GET /api/v1/seller/products/:id` — get product detail (ownership verified)
    - `POST /api/v1/seller/products` — create product (multipart/form-data with Multer)
    - `PUT /api/v1/seller/products/:id` — update product
    - `DELETE /api/v1/seller/products/:id` — soft-delete product
    - `PATCH /api/v1/seller/products/:id/availability` — toggle availability
    - Apply `authenticate()` and `requireRole('seller')` middleware to all routes
    - Wire validation middleware for request body/params
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.8_

- [x] 5. Checkpoint - Verify seller product backend
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Backend seller order service and WebSocket notifications
  - [x] 6.1 Implement the Seller Order Service
    - Create `getSellerOrders(sellerId, page)`: paginated query (20/page) returning orders containing at least one product owned by the seller
    - Create `getOrderDetail(sellerId, orderId)`: verify order contains seller's product, return full order detail
    - Create `updateOrderStatus(sellerId, orderId, newStatus)`: verify ownership, validate state transition, update DB, emit WebSocket event
    - Define valid transitions map: confirmed → {being_prepared, cancelled}, being_prepared → {out_for_delivery, cancelled}, out_for_delivery → {delivered}, delivered → {}, cancelled → {}
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.2 Implement WebSocket server for real-time order notifications
    - Set up Socket.IO server with JWT authentication on connection
    - Create room-based subscription: buyers join `user:{userId}` room on connect
    - Emit `order:status` event with `{ orderId, status, updatedAt }` on status change
    - Store missed events for disconnected buyers and deliver on reconnect (within 24 hours)
    - Reject connections with invalid/expired JWT
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 4.8_

  - [x] 6.3 Create seller order API routes and controller
    - `GET /api/v1/seller/orders` — list seller's orders (paginated)
    - `GET /api/v1/seller/orders/:id` — get order detail
    - `PATCH /api/v1/seller/orders/:id/status` — update order status
    - Apply `authenticate()` and `requireRole('seller')` middleware
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [ ]* 6.4 Write property test for order status transition validity
    - **Property 8: Order Status Transition Validity**
    - **Validates: Requirements 4.4, 4.5**

  - [ ]* 6.5 Write property test for seller order visibility
    - **Property 9: Seller Order Visibility**
    - **Validates: Requirements 4.1, 4.2**

- [ ] 7. Backend review service
  - [x] 7.1 Implement the Review Service
    - Create `createReview(userId, dto)`: verify purchase (delivered order with product), check no duplicate, insert review, invalidate cache, return created review
    - Create `getProductReviews(productId, page)`: paginated (10/page), sorted by `created_at DESC`, include reviewer name
    - Create `getProductReviewSummary(productId)`: return `{ averageRating, totalReviews, ratingDistribution }` with Redis caching
    - Create `deleteReview(userId, reviewId)`: verify ownership, delete, invalidate cache
    - Average rating rounded to 1 decimal place (round-half-up)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.2 Create review API routes and controller
    - `POST /api/v1/reviews` — submit review (requireRole('buyer'))
    - `GET /api/v1/reviews/product/:productId` — get reviews for product (public)
    - `GET /api/v1/reviews/product/:productId/summary` — get review summary (public)
    - `DELETE /api/v1/reviews/:id` — delete own review (requireRole('buyer'))
    - Apply appropriate authentication and role middleware
    - _Requirements: 5.1, 5.4, 6.1, 6.5_

  - [ ]* 7.3 Write property test for review purchase verification
    - **Property 4: Review Purchase Verification**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 7.4 Write property test for review uniqueness
    - **Property 5: Review Uniqueness**
    - **Validates: Requirement 5.3**

  - [ ]* 7.5 Write property test for review rating and comment validation
    - **Property 6: Review Rating and Comment Validation**
    - **Validates: Requirements 5.4, 5.5**

  - [ ]* 7.6 Write property test for review summary accuracy
    - **Property 7: Review Summary Accuracy**
    - **Validates: Requirements 6.1, 6.3, 6.4**

- [ ] 8. Backend cache invalidation service
  - [x] 8.1 Implement Redis cache invalidation logic
    - Create cache invalidation helper for product mutations (create/update/delete): invalidate product detail, category listing, and search result cache keys
    - Create cache invalidation helper for review mutations (create/delete): invalidate product review summary cache key
    - Implement graceful degradation: if Redis is unavailable, log and continue with DB-direct queries
    - Implement fallback TTL (≤ 60 seconds) on cache entries when invalidation fails after successful DB write
    - Log all cache fallback occurrences
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 8.2 Write property test for cache invalidation on mutation
    - **Property 12: Cache Invalidation on Mutation**
    - **Validates: Requirements 8.1, 8.2**

- [x] 9. Checkpoint - Verify all backend services
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Frontend role guard and routing infrastructure
  - [x] 10.1 Implement the Angular role guard and update auth service
    - Create `roleGuard(requiredRole: string)` functional guard
    - Check user's role from decoded JWT in auth service
    - If role matches, allow navigation; if not, redirect to the user's role-specific default route
    - If role cannot be determined (no token or invalid token), redirect to login
    - Update auth service to expose `getUserRole()` method from stored token
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [x] 10.2 Configure lazy-loaded seller module routes and buyer panel routes
    - Create seller panel route configuration with lazy-loaded module (`loadChildren`)
    - Apply `authGuard` and `roleGuard('seller')` to seller routes
    - Create buyer panel route configuration with `roleGuard('buyer')`
    - Update post-login redirect logic to route users to their role-specific default route
    - _Requirements: 7.5, 7.6_

  - [ ]* 10.3 Write property test for role claim in JWT
    - **Property 11: Role Claim in JWT**
    - **Validates: Requirement 1.2**

- [ ] 11. Frontend seller dashboard and product management
  - [x] 11.1 Create the Seller Dashboard component
    - Create `SellerDashboardComponent` showing total products, pending orders, recent activity
    - Add quick navigation links to product management and order management
    - Create seller service for API calls to `/api/v1/seller/products` and `/api/v1/seller/orders`
    - _Requirements: 2.2, 4.1_

  - [x] 11.2 Create the Product Management list component
    - Create `ProductManagementComponent` with paginated product list (20/page)
    - Display product name, category, price, stock, availability status
    - Add action buttons: edit, delete, toggle availability
    - Implement pagination controls
    - _Requirements: 2.2, 2.5_

  - [x] 11.3 Create the Product Form component (create/edit with image upload)
    - Create `ProductFormComponent` with reactive form: name, description, category (dropdown), price, unit, quantity
    - Implement multi-image upload with drag-and-drop, preview, and primary image selection
    - Add image reordering capability
    - Implement real-time form validation with error messages
    - Handle both create (POST) and edit (PUT) modes
    - Enforce max 5 images, 5MB per file, JPEG/PNG/WebP only on client side
    - _Requirements: 2.1, 2.6, 2.8, 3.1, 3.2, 3.3, 3.5, 3.6, 3.8_

  - [ ]* 11.4 Write unit tests for seller product components
    - Test product list pagination and display
    - Test product form validation
    - Test image upload constraints on frontend
    - _Requirements: 2.2, 2.6, 3.1, 3.2, 3.3_

- [ ] 12. Frontend seller order management
  - [x] 12.1 Create the Seller Order List and Order Detail components
    - Create `SellerOrderListComponent` with paginated order list (20/page)
    - Display order ID, buyer info, items, total, current status
    - Add status filter (confirmed, being_prepared, out_for_delivery, delivered)
    - Create `SellerOrderDetailComponent` showing full order details
    - Add status transition buttons with confirmation dialog
    - Disable invalid transitions based on current status
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7_

  - [ ]* 12.2 Write unit tests for seller order components
    - Test order list filtering and pagination
    - Test status transition button states
    - Test confirmation dialog behavior
    - _Requirements: 4.1, 4.5, 4.6_

- [ ] 13. Frontend buyer review components
  - [x] 13.1 Create the Product Review Form component
    - Create `ProductReviewFormComponent` with star rating input (1–5) and text comment input
    - Validate comment length (10–500 characters) with character counter
    - Show error if buyer hasn't purchased the product (handle 403 response)
    - Show error if duplicate review (handle 409 response)
    - Display success confirmation on submission
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 13.2 Create the Product Review List and Summary components
    - Create `ProductReviewListComponent` with paginated reviews (10/page), sorted newest first
    - Display reviewer name, star rating, comment text, and creation date
    - Create review summary display: average rating with star visualization, total count, rating distribution bar chart
    - Handle empty reviews state (no reviews yet)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 13.3 Write unit tests for buyer review components
    - Test star rating input interaction
    - Test comment validation
    - Test review list pagination
    - Test summary display with various data states
    - _Requirements: 5.4, 6.1, 6.5_

- [ ] 14. Frontend WebSocket integration for real-time notifications
  - [x] 14.1 Implement WebSocket client service for order status updates
    - Create `OrderNotificationService` using Socket.IO client
    - Connect with JWT authentication on user login
    - Listen for `order:status` events and update order state in real-time
    - Handle reconnection and delivery of missed events
    - Display toast/snackbar notification to buyer on status change
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 15. Integration wiring and final verification
  - [x] 15.1 Wire all components together and configure static file serving
    - Register all new routes in the Express app router
    - Configure Multer middleware on product creation/update routes
    - Set up static file serving for uploaded images with cache headers
    - Ensure Angular app routing integrates seller and buyer modules
    - Verify post-login redirect routes users to correct panel
    - _Requirements: 7.5, 7.6, 3.4_

  - [ ]* 15.2 Write integration tests for end-to-end flows
    - Test full product creation flow (upload → DB → cache invalidation)
    - Test review submission with purchase verification
    - Test order status update with WebSocket notification delivery
    - Test role-based route protection (frontend and backend)
    - _Requirements: 2.1, 4.8, 5.1, 9.1_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- Backend uses Jest for testing; frontend uses Vitest
- All image uploads use Multer with local disk storage (UUID filenames)
- Redis cache gracefully degrades to direct DB queries when unavailable

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "4.1"] },
    { "id": 6, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "7.2", "8.2"] },
    { "id": 8, "tasks": ["6.4", "6.5", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3"] },
    { "id": 11, "tasks": ["11.1", "11.2", "12.1", "13.1", "13.2"] },
    { "id": 12, "tasks": ["11.3"] },
    { "id": 13, "tasks": ["11.4", "12.2", "13.3", "14.1"] },
    { "id": 14, "tasks": ["15.1"] },
    { "id": 15, "tasks": ["15.2"] }
  ]
}
```
