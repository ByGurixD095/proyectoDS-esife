import { Injectable, signal } from '@angular/core';
import { AuthState } from '../models/user.model';

// esiusuarios runs on :8081; UserService in the backend calls /external/token/{token}
// The front will redirect to esiusuarios for login and receive back a token.
// This service holds the token locally and passes it to esientradas on purchase.
const ESIUSUARIOS_BASE = 'http://localhost:8081';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _authState = signal<AuthState>({ isLoggedIn: false, user: null });
  authState = this._authState.asReadonly();

  isLoggedIn(): boolean {
    return this._authState().isLoggedIn;
  }

  getToken(): string | null {
    return this._authState().user?.token ?? null;
  }

  getEmail(): string | null {
    return this._authState().user?.email ?? null;
  }

  // Called after esiusuarios redirects back with token=1234 in query params
  // (matches flow described in the practice document msg 32-33)
  setTokenFromRedirect(token: string, email: string): void {
    this._authState.set({
      isLoggedIn: true,
      user: { id: 'from-esiusuarios', email, token }
    });
  }

  logout(): void {
    this._authState.set({ isLoggedIn: false, user: null });
  }

  // Redirect user to esiusuarios login page
  // After login, esiusuarios redirects back to esientradas with ?token=xxx&email=xxx
  redirectToLogin(): void {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `${ESIUSUARIOS_BASE}/login?returnUrl=${returnUrl}`;
  }
}
