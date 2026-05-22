import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { UserRole } from '@shared/enums';
import { AuthService } from './auth.service';

/**
 * Returns a functional route guard that allows navigation only when the
 * authenticated user's role matches `requiredRole`.
 *
 * - If the role matches → allow navigation (returns true).
 * - If the role does NOT match → redirect to the user's own default route (returns UrlTree).
 * - If the role cannot be determined (no/invalid token) → redirect to /login (returns UrlTree).
 *
 * Returns a UrlTree for redirects so Angular performs the navigation correctly
 * rather than cancelling it.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.7
 */
export function roleGuard(requiredRole: UserRole): CanActivateFn {
  return (): boolean | UrlTree => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const userRole = authService.getUserRole();

    if (userRole === null) {
      // Cannot determine role — send to login
      return router.createUrlTree(['/login']);
    }

    if (userRole === requiredRole) {
      return true;
    }

    // Role mismatch — redirect to the user's own default route
    const fallback = userRole === UserRole.Seller ? '/seller' : '/catalog';
    return router.createUrlTree([fallback]);
  };
}
