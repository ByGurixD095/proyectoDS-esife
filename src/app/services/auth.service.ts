import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthState } from '../models/user.model';

const API = 'http://localhost:8081/users';

// ── Persistencia en sessionStorage ───────────────────────────
const TOKEN_KEY = 'auth_token';
const EMAIL_KEY = 'auth_email';

function loadAuth(): AuthState {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const email = sessionStorage.getItem(EMAIL_KEY);
  if (token && email) {
    return { isLoggedIn: true, user: { id: 'stored', email, token } };
  }
  return { isLoggedIn: false, user: null };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private _authState = signal<AuthState>(loadAuth());
  authState = this._authState.asReadonly();

  // ── Getters ────────────────────────────────────────────────
  isLoggedIn(): boolean       { return this._authState().isLoggedIn; }
  getToken(): string | null   { return this._authState().user?.token ?? null; }
  getEmail(): string | null   { return this._authState().user?.email ?? null; }
  getName(): string | null    { return this._authState().user?.id ?? null; }

  // ── Login ──────────────────────────────────────────────────
  // El backend acepta name o email — mandamos ambos y dejamos
  // que el servicio use el que no esté vacío.
  login(nameOrEmail: string, pwd: string): Observable<string> {
    const isEmail = nameOrEmail.includes('@');
    const body = {
      name:  isEmail ? '' : nameOrEmail,
      email: isEmail ? nameOrEmail : '',
      pwd
    };
    return this.http.put(
      `${API}/login`, body, { responseType: 'text' }
    ).pipe(
      tap(token => this._persist(token, isEmail ? nameOrEmail : ''))
    );
  }

  // ── Register ───────────────────────────────────────────────
  register(name: string, email: string, pwd1: string, pwd2: string): Observable<void> {
    return this.http.post<void>(`${API}/register`, { name, email, pwd1, pwd2 });
  }

  // ── Validate stored token on app load ─────────────────────
  validateStoredToken(): Observable<string> {
    const token = this.getToken() ?? '';
    return this.http.get(
      `${API}/token/${token}`, { responseType: 'text' }
    ).pipe(
      tap(email => this._persist(token, email))
    );
  }

  // ── Forgot password ───────────────────────────────────────
  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${API}/forgot-password`, { email });
  }

  // ── Reset password ────────────────────────────────────────
  resetPassword(token: string, pwd: string): Observable<void> {
    return this.http.post<void>(`${API}/reset-password`, { token, pwd });
  }

  // ── Delete account ────────────────────────────────────────
  deleteAccount(): Observable<void> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.getToken()}`
    });
    return this.http.delete<void>(`${API}/removeUser`, { headers }).pipe(
      tap(() => this.logout())
    );
  }

  // ── Logout ────────────────────────────────────────────────
  logout(): void {
    this._authState.set({ isLoggedIn: false, user: null });
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  }

  // ── Internal ──────────────────────────────────────────────
  private _persist(token: string, email: string): void {
    this._authState.set({
      isLoggedIn: true,
      user: { id: 'authenticated', email, token }
    });
    sessionStorage.setItem(TOKEN_KEY, token);
    if (email) sessionStorage.setItem(EMAIL_KEY, email);
  }

  // Compatibilidad con flujo anterior (redirect)
  redirectToLogin(): void {
    // No se usa en el nuevo flujo modal — mantenido por compatibilidad
  }
}