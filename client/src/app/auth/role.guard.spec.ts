import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UserRole } from '@shared/enums';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a minimal JWT with the given role claim (no real signature). */
function makeToken(role: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: 'user-1', email: 'a@b.com', role, exp: 9999999999, type: 'access' }),
  );
  return `${header}.${payload}.fakesig`;
}

// ---------------------------------------------------------------------------
// AuthService.getUserRole() unit tests
// ---------------------------------------------------------------------------

describe('AuthService.getUserRole()', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('returns null when no token is stored', () => {
    expect(service.getUserRole()).toBeNull();
  });

  it('returns UserRole.Buyer for a buyer token', () => {
    localStorage.setItem('accessToken', makeToken('buyer'));
    expect(service.getUserRole()).toBe(UserRole.Buyer);
  });

  it('returns UserRole.Seller for a seller token', () => {
    localStorage.setItem('accessToken', makeToken('seller'));
    expect(service.getUserRole()).toBe(UserRole.Seller);
  });

  it('returns null for a token with an unknown role', () => {
    localStorage.setItem('accessToken', makeToken('admin'));
    expect(service.getUserRole()).toBeNull();
  });

  it('returns null for a malformed token (not 3 parts)', () => {
    localStorage.setItem('accessToken', 'not.a.valid.jwt.here');
    expect(service.getUserRole()).toBeNull();
  });

  it('returns null for a token with invalid base64 payload', () => {
    localStorage.setItem('accessToken', 'header.!!!invalid!!!.sig');
    expect(service.getUserRole()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// roleGuard() functional guard tests
// ---------------------------------------------------------------------------

describe('roleGuard()', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', ['getUserRole']);
    router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
    // Return the commands array as a stand-in for a real UrlTree
    router.createUrlTree.and.callFake(
      (commands: unknown[]) => commands as unknown as ReturnType<Router['createUrlTree']>,
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  function runGuard(requiredRole: UserRole): ReturnType<ReturnType<typeof roleGuard>> {
    const guard = roleGuard(requiredRole);
    return TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  }

  // Requirement 7.1 – seller accessing seller route → allow
  it('allows a seller to access a seller-required route', () => {
    authService.getUserRole.and.returnValue(UserRole.Seller);
    expect(runGuard(UserRole.Seller)).toBe(true);
  });

  // Requirement 7.3 – buyer accessing buyer route → allow
  it('allows a buyer to access a buyer-required route', () => {
    authService.getUserRole.and.returnValue(UserRole.Buyer);
    expect(runGuard(UserRole.Buyer)).toBe(true);
  });

  // Requirement 7.2 – buyer accessing seller route → redirect to /catalog
  it('redirects a buyer away from a seller-required route to /catalog', () => {
    authService.getUserRole.and.returnValue(UserRole.Buyer);
    runGuard(UserRole.Seller);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/catalog']);
  });

  // Requirement 7.4 – seller accessing buyer route → redirect to /seller
  it('redirects a seller away from a buyer-required route to /seller', () => {
    authService.getUserRole.and.returnValue(UserRole.Seller);
    runGuard(UserRole.Buyer);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/seller']);
  });

  // Requirement 7.7 – no token → redirect to /login
  it('redirects to /login when role cannot be determined (no token)', () => {
    authService.getUserRole.and.returnValue(null);
    runGuard(UserRole.Seller);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('redirects to /login when role cannot be determined (invalid token)', () => {
    authService.getUserRole.and.returnValue(null);
    runGuard(UserRole.Buyer);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
