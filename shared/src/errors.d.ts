/**
 * Structured error response format returned by the API.
 * Matches the design spec error handling section.
 */
export interface ErrorResponse {
    /** Machine-readable error code (e.g., 'VALIDATION_ERROR', 'AUTH_FAILED') */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Field-level error details for validation failures */
    details: ErrorDetail[];
    /** ISO 8601 timestamp of when the error occurred */
    timestamp: string;
}
/**
 * Individual field-level error detail within an ErrorResponse.
 */
export interface ErrorDetail {
    /** The field that failed validation */
    field: string;
    /** Description of the validation failure */
    message: string;
}
/**
 * Standard error codes used across the API.
 */
export declare enum ErrorCode {
    ValidationError = "VALIDATION_ERROR",
    AuthenticationFailed = "AUTH_FAILED",
    AccountLocked = "ACCOUNT_LOCKED",
    Unauthorized = "UNAUTHORIZED",
    Forbidden = "FORBIDDEN",
    NotFound = "NOT_FOUND",
    Conflict = "CONFLICT",
    StockInsufficient = "STOCK_INSUFFICIENT",
    PaymentFailed = "PAYMENT_FAILED",
    RateLimited = "RATE_LIMITED",
    ServerError = "SERVER_ERROR",
    ServiceUnavailable = "SERVICE_UNAVAILABLE"
}
//# sourceMappingURL=errors.d.ts.map