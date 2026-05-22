# Requirements Document

## Introduction

This document defines the requirements for the Seller & Buyer Panels feature of the Cartelligence grocery platform. The feature introduces role-based access control, splitting the platform into distinct Seller and Buyer experiences. Sellers gain a dedicated dashboard for product management (CRUD with image uploads, stock management) and order management with real-time status updates. Buyers gain the ability to leave product reviews (star rating and text comment) on items they have purchased and received.

## Glossary

- **Platform**: The Cartelligence grocery web application comprising an Angular frontend and Node.js/Express backend
- **Seller**: A registered user with the 'seller' role who can manage product listings and fulfill orders
- **Buyer**: A registered user with the 'buyer' role who can browse products, place orders, and submit reviews
- **Role_Guard**: A frontend Angular route guard that checks the authenticated user's role before allowing navigation
- **Role_Middleware**: A backend Express middleware that verifies the user's role from the JWT before allowing API access
- **Product**: A grocery item listed for sale on the platform, owned by a specific Seller
- **Product_Image**: A photo associated with a Product, stored on disk with metadata in the database
- **Product_Review**: A rating (1–5 stars) and text comment submitted by a Buyer for a Product they have purchased
- **Review_Summary**: An aggregation of all reviews for a Product including average rating, total count, and rating distribution
- **Order_Status**: The current state of an order in the fulfillment pipeline: confirmed, being_prepared, out_for_delivery, delivered, or cancelled
- **JWT**: JSON Web Token used for authentication, containing user ID, email, and role claims
- **Upload_Service**: The backend service responsible for validating and storing product image files

## Requirements

### Requirement 1: Role-Based Access Control

**User Story:** As a platform administrator, I want users to be assigned distinct roles (seller or buyer), so that each role has access only to the features relevant to their responsibilities.

#### Acceptance Criteria

1. WHEN a user registers on the Platform, THE Platform SHALL assign the 'buyer' role by default
2. WHEN an administrator promotes a user to seller, THE Platform SHALL update the user's role to 'seller' and invalidate any existing JWT tokens for that user
3. THE JWT SHALL include the user's role as a claim in the token payload at the time of issuance
4. IF a request to a protected endpoint contains no token, an expired token, or a malformed token, THEN THE Platform SHALL reject the request with HTTP 401 and a response body indicating the authentication failure reason
5. WHEN a Buyer attempts to access a seller-only API endpoint, THE Role_Middleware SHALL reject the request with HTTP 403 and a response body indicating the required role is seller
6. WHEN a Seller attempts to access a buyer-only API endpoint, THE Role_Middleware SHALL reject the request with HTTP 403 and a response body indicating the required role is buyer
7. WHEN an authenticated user with the correct role accesses a role-protected endpoint, THE Role_Middleware SHALL allow the request to proceed

### Requirement 2: Seller Product Management

**User Story:** As a Seller, I want to create, view, edit, and delete my product listings, so that I can manage my inventory on the platform.

#### Acceptance Criteria

1. WHEN a Seller creates a new Product, THE Platform SHALL store the Product with the Seller's user ID as the seller_id and set is_available to true by default
2. WHEN a Seller requests their product listings, THE Platform SHALL return only Products where seller_id matches the Seller's user ID, paginated at 20 products per page, excluding soft-deleted Products
3. WHEN a Seller updates a Product, THE Platform SHALL verify that the Product's seller_id matches the requesting Seller's user ID before allowing the update
4. WHEN a Seller deletes a Product, THE Platform SHALL verify ownership and perform a soft-delete by marking the Product as deleted so that it no longer appears in any product listings or search results, while retaining the record for existing order history references
5. WHEN a Seller toggles a Product's availability, THE Platform SHALL update the is_available flag for that Product
6. WHEN a Product is created or updated, THE Platform SHALL validate that the name is 1–255 characters, category is one of the valid enum values (produce, dairy, meat, beverages, snacks, household, personal_care), unit_price is between 0.01 and 9,999,999.99 with at most 2 decimal places, unit is 1–50 characters, and stock_quantity is a non-negative integer not exceeding 999,999
7. WHEN a Seller attempts to modify a Product owned by another Seller, THE Platform SHALL reject the request with HTTP 403
8. IF Product creation or update validation fails, THEN THE Platform SHALL reject the request and return an error response identifying which fields failed validation, without persisting any changes
9. IF a Seller attempts to update or delete a soft-deleted Product, THEN THE Platform SHALL reject the request with an error indicating the Product no longer exists

### Requirement 3: Product Image Upload

**User Story:** As a Seller, I want to upload photos for my products, so that Buyers can see what they are purchasing.

#### Acceptance Criteria

1. WHEN a Seller uploads images for a Product, THE Upload_Service SHALL accept only files in JPEG, PNG, or WebP format and SHALL reject any file whose content type does not match one of these formats with an error message indicating the accepted formats
2. WHEN a Seller uploads an image file exceeding 5MB, THE Upload_Service SHALL reject the file with an error message indicating the maximum allowed size of 5MB
3. WHEN a Seller attempts to upload images that would cause the total image count for a single Product to exceed 5 (including previously uploaded images), THE Upload_Service SHALL reject the upload with an error message indicating the maximum of 5 images per product and the current count
4. WHEN images are successfully uploaded, THE Platform SHALL store each file with a UUID-based filename and create corresponding product_image records linking to the Product
5. WHEN a Product's first image is uploaded, THE Platform SHALL set that image's is_primary field to true; WHEN a Product already has a primary image, THE Platform SHALL preserve the existing primary designation unless the Seller explicitly changes it
6. WHEN a Product has multiple images, THE Platform SHALL assign unique sort_order values forming a contiguous sequence starting from 0, where newly uploaded images receive sort_order values appended after existing images
7. IF an image upload fails during processing, THEN THE Platform SHALL roll back the entire transaction so that no partial product or image records are created and any files written to storage during the failed operation are deleted
8. WHEN a Seller uploads images for a Product, THE Upload_Service SHALL require at least 1 image file in the request and SHALL reject an empty upload request with an error message indicating that at least 1 image is required

### Requirement 4: Seller Order Management

**User Story:** As a Seller, I want to view and manage orders that contain my products, so that I can fulfill customer purchases.

#### Acceptance Criteria

1. WHEN a Seller queries their orders, THE Platform SHALL return a paginated list (maximum 20 orders per page) containing only orders that include at least one Product owned by that Seller
2. WHEN a Seller queries orders, THE Platform SHALL NOT include orders that contain exclusively other sellers' products
3. WHEN a Seller updates an order status, THE Platform SHALL verify the order contains at least one Product owned by that Seller before allowing the update
4. IF a Seller attempts to update the status of an order that does not contain any Product owned by that Seller, THEN THE Platform SHALL reject the request with HTTP 403
5. WHEN a Seller updates an order status, THE Platform SHALL validate that the transition follows the allowed state machine: confirmed → being_prepared or cancelled, being_prepared → out_for_delivery or cancelled, out_for_delivery → delivered
6. IF an invalid status transition is attempted, THEN THE Platform SHALL reject the request with HTTP 400 and a message indicating the invalid transition
7. IF a Seller attempts to transition an order in a terminal state (delivered or cancelled), THEN THE Platform SHALL reject the request with HTTP 400
8. WHEN an order status is successfully updated, THE Platform SHALL emit a WebSocket event to notify the Buyer within 5 seconds of the update

### Requirement 5: Buyer Product Reviews

**User Story:** As a Buyer, I want to leave reviews on products I have purchased, so that I can share my experience and help other buyers make informed decisions.

#### Acceptance Criteria

1. WHEN a Buyer submits a review, THE Platform SHALL verify that the Buyer has at least one delivered order containing the reviewed Product
2. IF the Buyer has no delivered order containing the reviewed Product, THEN THE Platform SHALL reject the review submission with HTTP 403 and an error message indicating purchase verification failed
3. IF the Buyer has already submitted a review for the same Product, THEN THE Platform SHALL reject the review submission with HTTP 409 and an error message indicating a duplicate review
4. WHEN a Buyer submits a review, THE Platform SHALL validate that the rating is an integer between 1 and 5 inclusive and that the comment is between 10 and 500 characters (inclusive, after trimming leading and trailing whitespace)
5. IF the rating or comment fails validation, THEN THE Platform SHALL reject the review submission with HTTP 400 and an error response identifying which fields failed validation
6. WHEN a valid review is submitted, THE Platform SHALL create a product_review record, invalidate the product's review summary cache, and return HTTP 201 with the created review containing id, productId, userId, rating, comment, and createdAt
7. IF the specified productId does not reference an existing Product, THEN THE Platform SHALL reject the review submission with HTTP 404 and an error message indicating the product was not found

### Requirement 6: Review Summary and Display

**User Story:** As a Buyer, I want to see product ratings and reviews, so that I can make informed purchasing decisions.

#### Acceptance Criteria

1. WHEN a product's review summary is requested, THE Platform SHALL return the total number of reviews, the average rating rounded to 1 decimal place using round-half-up, and the rating distribution across levels 1 through 5
2. IF a Product has no reviews, THEN THE Platform SHALL return an average rating of 0, total reviews of 0, and a rating distribution of zero for each level
3. THE Review_Summary's totalReviews SHALL equal the count of product_review records for that Product
4. THE Review_Summary's ratingDistribution for each level SHALL equal the count of reviews with that specific rating value
5. WHEN reviews are displayed for a Product, THE Platform SHALL present them in a paginated list of 10 reviews per page, sorted by creation date descending, where each review entry includes the reviewer's full name, the rating value, the comment text, and the creation date
6. IF a review summary is requested for a Product that does not exist, THEN THE Platform SHALL reject the request with HTTP 404

### Requirement 7: Frontend Role-Based Routing

**User Story:** As a platform user, I want to be directed to the appropriate panel based on my role, so that I only see features relevant to me.

#### Acceptance Criteria

1. WHEN a user with role 'seller' navigates to the seller panel routes, THE Role_Guard SHALL allow access and render the requested seller panel view
2. WHEN a user with role 'buyer' navigates to seller panel routes, THE Role_Guard SHALL deny access and redirect the user to the buyer panel default route
3. WHEN a user with role 'buyer' navigates to buyer panel routes, THE Role_Guard SHALL allow access and render the requested buyer panel view
4. WHEN a user with role 'seller' navigates to buyer panel routes, THE Role_Guard SHALL deny access and redirect the user to the seller panel default route
5. WHEN a user successfully authenticates, THE Platform SHALL redirect the user to their role-specific default route: the buyer panel default route for users with role 'buyer', or the seller panel default route for users with role 'seller'
6. THE Platform SHALL lazy-load the seller panel module as a separate bundle that is not included in the initial bundle served to users with role 'buyer'
7. IF the Role_Guard cannot determine the user's role from the stored authentication token, THEN THE Role_Guard SHALL deny access and redirect the user to the login route

### Requirement 8: Cache Consistency

**User Story:** As a platform operator, I want cached data to remain consistent with the database, so that users always see up-to-date information.

#### Acceptance Criteria

1. WHEN a Seller creates, updates, or deletes a Product, THE Platform SHALL invalidate the Redis cache entries for that product's detail, the category listing containing that product, and any search results that included that product, before the write operation is acknowledged to the client
2. WHEN a Buyer creates or deletes a review, THE Platform SHALL invalidate the Redis cache entry for that product's review summary before the write operation is acknowledged to the client
3. IF cache invalidation fails after a successful database write, THEN THE Platform SHALL log the failure and apply a time-to-live of no more than 60 seconds on the affected cache entries so that stale data self-expires
4. IF the Redis cache is unavailable (connection refused, connection timeout exceeding 2 seconds, or Redis returning errors), THEN THE Platform SHALL continue operating by querying the database directly without returning an error to the user
5. WHILE the Redis cache is unavailable, THE Platform SHALL log each fallback occurrence and attempt to reconnect to Redis on subsequent requests

### Requirement 9: Real-Time Notifications

**User Story:** As a Buyer, I want to receive real-time updates when my order status changes, so that I can track my delivery without refreshing the page.

#### Acceptance Criteria

1. WHEN a Seller updates an order status, THE Platform SHALL emit a WebSocket event containing the order ID, new status, and timestamp to the subscribed Buyer within 5 seconds of the status change
2. IF the Buyer's WebSocket connection is disconnected and one or more status updates occur, THEN THE Platform SHALL deliver all missed status updates for the Buyer's active orders in chronological order when the Buyer reconnects within 24 hours
3. THE Platform SHALL authenticate WebSocket connections using the same JWT mechanism as REST API requests
4. IF a Buyer attempts to establish a WebSocket connection with an invalid or expired JWT, THEN THE Platform SHALL reject the connection and return an error indicating authentication failure
