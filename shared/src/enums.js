"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderStatus = exports.ProductCategory = exports.UserRole = void 0;
/**
 * User roles for role-based access control.
 */
var UserRole;
(function (UserRole) {
    UserRole["Buyer"] = "buyer";
    UserRole["Seller"] = "seller";
})(UserRole || (exports.UserRole = UserRole = {}));
/**
 * Product categories available in the Cartelligence grocery catalog.
 */
var ProductCategory;
(function (ProductCategory) {
    ProductCategory["Produce"] = "produce";
    ProductCategory["Dairy"] = "dairy";
    ProductCategory["Meat"] = "meat";
    ProductCategory["Beverages"] = "beverages";
    ProductCategory["Snacks"] = "snacks";
    ProductCategory["Household"] = "household";
    ProductCategory["PersonalCare"] = "personal_care";
    ProductCategory["BabiesToys"] = "babies_toys";
})(ProductCategory || (exports.ProductCategory = ProductCategory = {}));
/**
 * Order lifecycle statuses for tracking delivery progress.
 */
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["Confirmed"] = "confirmed";
    OrderStatus["BeingPrepared"] = "being_prepared";
    OrderStatus["OutForDelivery"] = "out_for_delivery";
    OrderStatus["Delivered"] = "delivered";
    OrderStatus["Cancelled"] = "cancelled";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
//# sourceMappingURL=enums.js.map