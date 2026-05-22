import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { tap, catchError, switchMap, filter, take, map } from 'rxjs/operators';
import { AuthTokens, UserProfile } from '@shared/interfaces';
import { RegisterDto, LoginDto } from '@shared/dtos';
import { ErrorResponse } from '@shared/errors';
import { UserRole } from '@shared/enums';

const API_BASE = '/api/v1/auth';
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

/** Minimal shape of the decoded JWT payload we care about. */
interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  exp: number;
  type: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly isRefreshing = signal(false);
  private readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  readonly isAuthenticated = computed(() => !!this.getAccessToken());

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  /**
   * Decodes the stored JWT access token and returns the role claim.
   * Returns null if no token is present or the token is malformed.
   */
  getUserRole(): UserRole | null {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      // Base64url → Base64 → JSON
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload;
      const role = payload?.role;
      if (role === UserRole.Buyer || role === UserRole.Seller) {
        return role;
      }
      return null;
    } catch {
      return null;
    }
  }

  private storeTokens(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  register(dto: RegisterDto): Observable<UserProfile> {
    return this.http
      .post<{ data: UserProfile }>(`${API_BASE}/register`, dto)
      .pipe(map((res) => res.data));
  }

  login(dto: LoginDto): Observable<AuthTokens> {
    return this.http
      .post<{ data: AuthTokens }>(`${API_BASE}/login`, dto)
      .pipe(
        map((res) => res.data),
        tap((tokens) => this.storeTokens(tokens)),
      );
  }

  logout(): Observable<void> {
    const refreshToken = this.getRefreshToken();
    return this.http.post<void>(`${API_BASE}/logout`, { refreshToken }).pipe(
      tap(() => {
        this.clearTokens();
        this.router.navigate(['/login']);
      }),
      catchError(() => {
        this.clearTokens();
        this.router.navigate(['/login']);
        return throwError(() => new Error('Logout failed'));
      }),
    );
  }

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/password-reset/request`, { email });
  }

  confirmPasswordReset(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/password-reset/confirm`, {
      token,
      newPassword,
    });
  }

  refreshAccessToken(): Observable<AuthTokens> {
    if (this.isRefreshing()) {
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap(() => {
          const tokens: AuthTokens = {
            accessToken: this.getAccessToken()!,
            refreshToken: this.getRefreshToken()!,
          };
          return new Observable<AuthTokens>((subscriber) => {
            subscriber.next(tokens);
            subscriber.complete();
          });
        }),
      );
    }

    this.isRefreshing.set(true);
    this.refreshTokenSubject.next(null);

    const refreshToken = this.getRefreshToken();
    return this.http
      .post<{ data: AuthTokens }>(`${API_BASE}/token/refresh`, { refreshToken })
      .pipe(
        map((res) => res.data),
        tap((tokens) => {
          this.isRefreshing.set(false);
          this.storeTokens(tokens);
          this.refreshTokenSubject.next(tokens.accessToken);
        }),
        catchError((error: HttpErrorResponse) => {
          this.isRefreshing.set(false);
          this.clearTokens();
          this.router.navigate(['/login']);
          return throwError(() => error);
        }),
      );
  }

  handleUnauthorized(): void {
    this.clearTokens();
    this.router.navigate(['/login']);
  }
}
