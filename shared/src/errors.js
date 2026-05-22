"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = void 0;
/**
 * Standard error codes used across the API.
 */
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["ValidationError"] = "VALIDATION_ERROR";
    ErrorCode["AuthenticationFailed"] = "AUTH_FAILED";
    ErrorCode["AccountLocked"] = "ACCOUNT_LOCKED";
    ErrorCode["Unauthorized"] = "UNAUTHORIZED";
    ErrorCode["Forbidden"] = "FORBIDDEN";
    ErrorCode["NotFound"] = "NOT_FOUND";
    ErrorCode["Conflict"] = "CONFLICT";
    ErrorCode["StockInsufficient"] = "STOCK_INSUFFICIENT";
    ErrorCode["PaymentFailed"] = "PAYMENT_FAILED";
    ErrorCode["RateLimited"] = "RATE_LIMITED";
    ErrorCode["ServerError"] = "SERVER_ERROR";
    ErrorCode["ServiceUnavailable"] = "SERVICE_UNAVAILABLE";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
//# sourceMappingURL=errors.js.map