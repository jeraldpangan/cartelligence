# Requirements Document

## Introduction

Cartelligence is an AI-powered grocery e-commerce platform designed for working professionals in Olongapo City. The platform enables users to shop for groceries effortlessly through an intelligent smart cart system that personalizes purchases and calculates total cost in real time. The system differentiates from general e-commerce platforms by focusing exclusively on groceries with time-saving features like live cart tracking and personalized recommendations. The technical stack uses Angular for the frontend, Node.js for the backend, and PostgreSQL for the database, with a monochrome (black and white) minimalist design aesthetic. Brand tagline: "Click.Cart. Delivered."

## Glossary

- **Smart_Cart**: The AI-powered shopping cart system that tracks items, calculates costs in real time, and provides personalized recommendations to users
- **Recommendation_Engine**: The AI subsystem that analyzes user purchase history, preferences, and behavior to suggest relevant grocery items
- **Cart_Tracker**: The subsystem responsible for displaying live updates of cart contents, item quantities, and running total cost to the user in real time
- **Product_Catalog**: The grocery inventory database containing all available products with pricing, categories, nutritional information, and stock levels
- **User_Profile**: The data model representing a registered working professional, including purchase history, dietary preferences, and shopping patterns
- **Order_Service**: The backend subsystem that processes confirmed cart contents into finalized orders for fulfillment
- **Cost_Calculator**: The subsystem that computes the running total of all items in the Smart_Cart, including applicable discounts and fees
- **Platform**: The complete Cartelligence grocery e-commerce system encompassing frontend, backend, and AI components

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a working professional in Olongapo City, I want to create an account and securely log in, so that I can access personalized grocery shopping features.

#### Acceptance Criteria

1. WHEN a new user submits registration details (email, password, full name, delivery address), THE Platform SHALL validate that the email follows standard email format, the password is between 8 and 64 characters containing at least one uppercase letter, one lowercase letter, one digit, and one special character, the full name is between 1 and 100 characters, and the delivery address is between 10 and 250 characters, and upon successful validation SHALL create a User_Profile and return a confirmation within 3 seconds
2. WHEN a registered user submits valid login credentials, THE Platform SHALL authenticate the user and establish a session that expires after 30 minutes of inactivity, within 2 seconds
3. IF a user submits invalid login credentials three consecutive times, THEN THE Platform SHALL lock the account for 15 minutes and notify the user via email
4. WHEN a user requests a password reset, THE Platform SHALL send a reset link to the registered email within 30 seconds, and the reset link SHALL expire after 15 minutes
5. THE Platform SHALL store all passwords using bcrypt hashing with a minimum cost factor of 10
6. IF a user submits registration details with an email that is already associated with an existing account, THEN THE Platform SHALL reject the registration and display an error message indicating the email is already in use
7. IF a user submits registration details that fail any validation rule, THEN THE Platform SHALL reject the registration and display an error message indicating which fields are invalid without creating a User_Profile

### Requirement 2: Product Catalog Browsing

**User Story:** As a working professional, I want to browse grocery products by category and search for specific items, so that I can find what I need quickly without wasting time.

#### Acceptance Criteria

1. WHEN a user opens the Product_Catalog, THE Platform SHALL display grocery categories (produce, dairy, meat, beverages, snacks, household, personal care) within 2 seconds
2. WHEN a user selects a category, THE Platform SHALL display up to 20 available products per page in that category with name, price, unit, and stock status within 2 seconds
3. WHEN a user enters a search query of at least 2 characters and at most 100 characters, THE Platform SHALL return up to 20 products whose name contains the query text, within 1 second
4. THE Product_Catalog SHALL display product prices in Philippine Peso (PHP) with two decimal places
5. WHILE a product is out of stock, THE Platform SHALL display that product as unavailable and prevent addition to the Smart_Cart
6. IF a category selection or search query returns no products, THEN THE Platform SHALL display a message indicating no products were found

### Requirement 3: AI-Powered Smart Cart

**User Story:** As a working professional, I want an intelligent shopping cart that helps me make purchase decisions, so that I can complete my grocery shopping faster and more efficiently.

#### Acceptance Criteria

1. WHEN a user adds an item to the Smart_Cart, THE Smart_Cart SHALL update the cart contents and recalculate the total cost within 500 milliseconds
2. WHEN a user removes an item from the Smart_Cart, THE Smart_Cart SHALL update the cart contents and recalculate the total cost within 500 milliseconds
3. WHEN a user modifies the quantity of an item in the Smart_Cart to a value between 1 and 99 inclusive, THE Cost_Calculator SHALL recalculate the total cost within 500 milliseconds
4. THE Smart_Cart SHALL display the item name, unit price, quantity, subtotal per item, and running grand total for all items in the cart, with all monetary values shown to exactly 2 decimal places
5. WHEN the Smart_Cart contains 3 or more items, THE Recommendation_Engine SHALL suggest up to 5 items that are frequently purchased together with the current cart contents, within 2 seconds of the cart reaching the 3-item threshold or being updated thereafter
6. IF a user adds an item that exceeds available stock, THEN THE Smart_Cart SHALL reject the addition and display the maximum available quantity
7. IF a user sets the quantity of an item to zero or attempts a negative value, THEN THE Smart_Cart SHALL remove that item from the cart and recalculate the total cost within 500 milliseconds
8. IF the Recommendation_Engine is unavailable or returns no suggestions, THEN THE Smart_Cart SHALL display a message indicating that recommendations are currently unavailable and SHALL continue to function for all cart operations without interruption
9. THE Smart_Cart SHALL support a maximum of 50 distinct items at any time

### Requirement 4: Personalized Purchase Recommendations

**User Story:** As a returning customer, I want personalized grocery recommendations based on my shopping history and preferences, so that I can discover relevant products and reorder favorites effortlessly.

#### Acceptance Criteria

1. WHEN a user with at least 1 previous order logs in, THE Recommendation_Engine SHALL generate a personalized product list of up to 10 items based on the User_Profile purchase history within 3 seconds
2. IF a user has completed at least 3 previous orders, THEN THE Recommendation_Engine SHALL identify products purchased in at least 2 of the last 5 orders and suggest reorder reminders for those products on the user's home screen
3. WHEN a user views a product detail page, THE Recommendation_Engine SHALL display up to 5 related products based on category affinity and purchase correlation
4. WHEN a user completes an order, THE Recommendation_Engine SHALL update its recommendations to reflect the new purchase data within 24 hours
5. WHEN a user dismisses a recommendation, THE Recommendation_Engine SHALL exclude that product from the user's recommendation list for at least 30 days
6. IF the Recommendation_Engine is unable to generate personalized recommendations, THEN THE Recommendation_Engine SHALL display a fallback list of up to 10 top-selling products from the store catalog
7. IF a user has no previous orders, THEN THE Recommendation_Engine SHALL display a list of up to 10 popular products based on overall store sales data

### Requirement 5: Real-Time Total Cost Calculation

**User Story:** As a budget-conscious professional, I want to see the exact total cost of my cart updated instantly as I add or remove items, so that I can manage my grocery spending in real time.

#### Acceptance Criteria

1. THE Cost_Calculator SHALL compute the cart subtotal as the sum of (unit price × quantity) for each item in the Smart_Cart, rounding each line item to two decimal places using round-half-up, with the subtotal constrained to the range 0.00 to 9,999,999.99 PHP
2. WHEN an item is added, removed, or its quantity is changed, THE Cost_Calculator SHALL update the displayed subtotal, delivery fee, and grand total within 500 milliseconds
3. THE Cost_Calculator SHALL display the subtotal, delivery fee, discount (if applied), and grand total as separate line items, where grand total equals subtotal plus delivery fee minus discount
4. WHEN a discount or promo code is applied, THE Cost_Calculator SHALL recalculate and display the updated grand total within 500 milliseconds, showing the discount amount as a separate line item
5. THE Cost_Calculator SHALL display all monetary values in Philippine Peso (PHP) formatted with two decimal places and the "₱" currency symbol prefix
6. IF the applied discount amount exceeds the subtotal plus delivery fee, THEN THE Cost_Calculator SHALL set the grand total to 0.00 PHP
7. WHEN all items are removed from the Smart_Cart, THE Cost_Calculator SHALL display 0.00 PHP for the subtotal and grand total

### Requirement 6: Live Cart Tracking

**User Story:** As a working professional, I want to track my cart status and order progress in real time, so that I can plan my schedule around delivery without repeatedly checking the app.

#### Acceptance Criteria

1. WHEN a user confirms an order, THE Cart_Tracker SHALL display the current order status (confirmed, being prepared, out for delivery, delivered) within 3 seconds of each status change occurring
2. WHEN the order status changes, THE Cart_Tracker SHALL push a notification to the user within 5 seconds of the status change
3. WHILE an order is in "out for delivery" status, THE Cart_Tracker SHALL display the estimated time of arrival updated every 60 seconds
4. WHEN a user opens the Cart_Tracker, THE Platform SHALL display up to 20 active orders with their current status within 2 seconds
5. IF a delivery is delayed beyond the estimated time by more than 15 minutes, THEN THE Cart_Tracker SHALL notify the user with an updated estimated time of arrival
6. IF the Cart_Tracker loses network connectivity while displaying order status, THEN THE Cart_Tracker SHALL display the last known status with a visible indicator showing the time since the last successful update
7. IF the estimated time of arrival cannot be determined while an order is in "out for delivery" status, THEN THE Cart_Tracker SHALL display a message indicating that the estimate is temporarily unavailable and retry the calculation every 60 seconds

### Requirement 7: Order Checkout and Payment

**User Story:** As a working professional, I want a fast and secure checkout process, so that I can complete my grocery purchase without unnecessary steps or delays.

#### Acceptance Criteria

1. WHEN a user initiates checkout, THE Order_Service SHALL present a summary of cart items, total cost, delivery address, and payment options within 2 seconds
2. WHEN a user confirms payment, THE Order_Service SHALL process the transaction and return a confirmation with order number within 5 seconds
3. THE Order_Service SHALL support at least two payment methods (credit/debit card and digital wallet)
4. IF a payment transaction fails, THEN THE Order_Service SHALL notify the user of the failure reason, retain the Smart_Cart contents, and allow the user up to 3 retry attempts before requiring the user to re-initiate checkout
5. WHEN an order is confirmed, THE Order_Service SHALL send an order confirmation email containing the order number, list of purchased items with quantities, total cost, selected delivery time slot, and delivery address within 60 seconds
6. IF a user initiates checkout with an empty Smart_Cart, THEN THE Order_Service SHALL prevent checkout and display a message indicating that the cart contains no items
7. WHEN a user confirms an order, THE Order_Service SHALL verify stock availability for all Smart_Cart items and IF any item is no longer available in the requested quantity, THEN THE Order_Service SHALL notify the user of the unavailable items and prevent order submission until the cart is updated

### Requirement 8: User Interface Design

**User Story:** As a user, I want a clean, modern, and minimalist interface, so that I can navigate the app efficiently and enjoy a visually consistent experience aligned with the Cartelligence brand.

#### Acceptance Criteria

1. THE Platform SHALL render all UI components using a monochrome color palette (black, white, and grayscale tones) as the primary design scheme, with non-monochrome colors permitted only for functional status indicators (error, success, and warning states)
2. THE Platform SHALL display the tagline "Click.Cart. Delivered." on the landing page and login screen
3. THE Platform SHALL implement responsive design that adapts to screen widths from 320px to 1920px without requiring horizontal scrolling, reflowing content layout at breakpoints for mobile (320px–767px), tablet (768px–1023px), and desktop (1024px–1920px)
4. WHEN a page is loaded, THE Platform SHALL render all above-the-fold content within 2 seconds on a 4G network connection
5. THE Platform SHALL use Angular Material or a comparable Angular-compatible component library for consistent UI elements across all pages
6. THE Platform SHALL maintain a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text and interactive UI components against their background colors

### Requirement 9: Delivery Scheduling

**User Story:** As a working professional with a busy schedule, I want to choose a delivery time slot, so that I can receive my groceries at a convenient time.

#### Acceptance Criteria

1. WHEN a user proceeds to checkout, THE Order_Service SHALL display available delivery time slots for the next 3 days starting from the current day
2. WHEN a user selects a delivery time slot, THE Order_Service SHALL reserve that slot for a maximum of 15 minutes and associate it with the order
3. THE Order_Service SHALL offer delivery time slots in 2-hour windows between 8:00 AM and 9:00 PM Philippine Standard Time, with a maximum of 20 orders per slot
4. IF all delivery slots for a selected day are fully booked, THEN THE Order_Service SHALL display that day as unavailable and suggest the next available day
5. WHEN a user requests to reschedule a delivery at least 2 hours before the scheduled time, THE Order_Service SHALL allow slot modification up to a maximum of 2 reschedules per order
6. IF a user attempts to reschedule a delivery less than 2 hours before the scheduled time, THEN THE Order_Service SHALL reject the request and display a message indicating that the reschedule window has passed

### Requirement 10: Data Persistence and Backend

**User Story:** As a platform operator, I want reliable data storage and a performant backend, so that user data, product information, and orders are stored securely and retrieved efficiently.

#### Acceptance Criteria

1. THE Platform SHALL use PostgreSQL as the primary database for storing User_Profiles, orders, and Product_Catalog data
2. THE Platform SHALL implement the backend API using Node.js with a RESTful architecture
3. THE Platform SHALL implement the frontend application using Angular framework version 16 or later
4. WHEN the database receives a query, THE Platform SHALL return results within 200 milliseconds for indexed queries under normal load (up to 1000 concurrent users)
5. THE Platform SHALL encrypt all data in transit using TLS 1.2 or later and encrypt all data at rest using AES-256 or equivalent encryption
6. IF the database becomes unavailable, THEN THE Platform SHALL return an error response indicating a service disruption to the client within 5 seconds and retry the connection up to 3 times with a 2-second interval before reporting failure
7. THE Platform SHALL perform automated database backups at least once every 24 hours, retaining backups for a minimum of 30 days, and SHALL support restoration of any retained backup to a recovery point within 60 minutes
8. WHEN the backend API receives a write request, THE Platform SHALL validate all required fields and data types against the defined schema before persisting data, and SHALL reject invalid requests with an error response indicating which fields failed validation
