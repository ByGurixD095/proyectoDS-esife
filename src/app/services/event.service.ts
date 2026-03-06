import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import {
  Espectaculo, Escenario, Entrada, EntradaInfo,
  ReservaResponse, CompraResponse, ColaResponse,
  ViewMode, EspectaculosByVenue
} from '../models/event.model';

const API = 'http://localhost:8080';

// ── Session storage keys ──────────────────────────────────────
// PRERESERVA_TOKEN_KEY: the single UUID shared across all entries
//   in the current cart session. The backend groups all entries
//   that share the same token, so we must reuse it on every
//   subsequent call.  Empty string = no session started yet.
//
// PRERESERVA_IDS_KEY: JSON array of entradaIds currently in cart.
//   Used to restore the cart state on page refresh within the
//   10-minute window.

const TOKEN_KEY = 'prereserva_token';   // string UUID | ''
const IDS_KEY   = 'prereserva_ids';     // JSON: number[]

function loadToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? '';
}

function loadIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(IDS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch { return new Set(); }
}

function persistToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function persistIds(ids: Set<number>): void {
  sessionStorage.setItem(IDS_KEY, JSON.stringify(Array.from(ids)));
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private http = inject(HttpClient);

  // ── Prereserva session state ──────────────────────────────
  //
  // prereservaToken: the SINGLE UUID the backend has assigned to
  //   this browser session. All cart entries share this token.
  //   Empty string means "no session started yet".
  //
  // cartIds: set of entradaIds the user has added to cart.
  //   Source of truth for what to show as "selected".
  //
  private _prereservaToken = signal<string>(loadToken());
  private _cartIds         = signal<Set<number>>(loadIds());

  /** Read-only token exposed for the purchase flow */
  prereservaToken = this._prereservaToken.asReadonly();

  /** Read-only set of IDs in cart */
  cartIds = this._cartIds.asReadonly();

  // ── UI state ──────────────────────────────────────────────
  private _viewMode     = signal<ViewMode>('by-event');
  private _searchQuery  = signal<string>('');
  private _espectaculos = signal<Espectaculo[]>([]);
  private _escenarios   = signal<Escenario[]>([]);
  private _loading      = signal<boolean>(false);
  private _error        = signal<string | null>(null);

  viewMode     = this._viewMode.asReadonly();
  searchQuery  = this._searchQuery.asReadonly();
  espectaculos = this._espectaculos.asReadonly();
  escenarios   = this._escenarios.asReadonly();
  loading      = this._loading.asReadonly();
  error        = this._error.asReadonly();

  // ── Filtered / grouped espectaculos ──────────────────────
  filteredEspectaculos = computed(() => {
    const q = this._searchQuery().toLowerCase().trim();
    if (!q) return this._espectaculos();
    return this._espectaculos().filter(e =>
      e.artista.toLowerCase().includes(q) ||
      e.escenario.toLowerCase().includes(q)
    );
  });

  espectaculosByVenue = computed((): EspectaculosByVenue[] => {
    const map = new Map<string, Espectaculo[]>();
    for (const e of this.filteredEspectaculos()) {
      const key = e.escenario;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([escenarioNombre, espectaculos]) => ({
      escenarioNombre, espectaculos
    }));
  });

  // ── View / search ─────────────────────────────────────────

  setViewMode(mode: ViewMode): void { this._viewMode.set(mode); }

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
    if (!query.trim()) { this.loadAll(); return; }

    this._loading.set(true);
    this._error.set(null);

    const params = new HttpParams().set('artist', query);
    this.http.get<Espectaculo[]>(`${API}/espectaculos`, { params }).pipe(
      catchError(() => of([]))
    ).subscribe(data => {
      if (data?.length > 0) {
        this._espectaculos.set(data);
        this._loading.set(false);
      } else {
        this.http.get<Espectaculo[]>(`${API}/espectaculos/${query}`).pipe(
          catchError(() => of([]))
        ).subscribe(data2 => {
          this._espectaculos.set(data2 ?? []);
          this._loading.set(false);
        });
      }
    });
  }

  // ── Espectaculos ─────────────────────────────────────────

  loadAll(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<Espectaculo[]>(`${API}/espectaculos`).pipe(
      tap(data => { this._espectaculos.set(data); this._loading.set(false); }),
      catchError(() => {
        this._error.set('No se pudo conectar con el servidor. Asegúrate de que esientradas está arriba.');
        this._loading.set(false);
        return of([]);
      })
    ).subscribe();
  }

  searchByArtist(artist: string): Observable<Espectaculo[]> {
    this._loading.set(true);
    const req$ = this.http.get<Espectaculo[]>(`${API}/espectaculos`, {
      params: new HttpParams().set('artist', artist)
    }).pipe(
      tap(data => { this._espectaculos.set(data); this._loading.set(false); }),
      catchError(() => { this._espectaculos.set([]); this._loading.set(false); return of([]); })
    );
    req$.subscribe();
    return req$;
  }

  searchByEscenario(escenario: string): Observable<Espectaculo[]> {
    this._loading.set(true);
    const req$ = this.http.get<Espectaculo[]>(`${API}/espectaculos/${escenario}`).pipe(
      tap(data => { this._espectaculos.set(data); this._loading.set(false); }),
      catchError(() => { this._espectaculos.set([]); this._loading.set(false); return of([]); })
    );
    req$.subscribe();
    return req$;
  }

  getEspectaculoById(id: number): Observable<Espectaculo> {
    return this.http.get<Espectaculo>(`${API}/espectaculos`, {
      params: new HttpParams().set('id', id)
    });
  }

  // ── Escenarios ───────────────────────────────────────────

  loadEscenarios(): void {
    this.http.get<Escenario[]>(`${API}/escenarios`).pipe(
      tap(data => this._escenarios.set(data)),
      catchError(() => of([]))
    ).subscribe();
  }

  // ── Entradas ─────────────────────────────────────────────

  getEntradasByEspectaculo(espectaculoId: number): Observable<Entrada[]> {
    return this.http.get<Entrada[]>(`${API}/entradas/espectaculos/${espectaculoId}`);
  }

  /**
   * Fetch entries currently RESERVADA under the given prereserva token.
   * Used on page load to restore cart state from an active session.
   * Always returns 200 (empty array if token is unknown/expired).
   */
  getEntradasByToken(token: string): Observable<Entrada[]> {
    return this.http.get<Entrada[]>(`${API}/entradas/prerreserva/${token}`);
  }

  getEntradaInfo(espectaculoId: number): Observable<EntradaInfo> {
    return this.http.get<EntradaInfo>(`${API}/entradas/espectaculo/${espectaculoId}/info`);
  }

  getNumeroEntradas(espectaculoId: number): Observable<number> {
    return this.http.get<number>(`${API}/entradas/espectaculos/${espectaculoId}/cantidad`);
  }

  // ── Cart: prereserva session ──────────────────────────────
  //
  // The backend uses a SINGLE token to group all prereserved
  // entries in one session.  The flow is:
  //
  //   1st call:  send token = ""
  //              → backend creates UUID, returns it in ReservaResponse.token
  //              → we store it in sessionStorage as prereserva_token
  //
  //   2nd+ call: send token = <stored UUID>
  //              → backend validates the UUID exists and is not expired
  //              → reuses same UUID, links this entry to same session
  //
  //   Cancel:    DELETE /entradas/{id}/prerreservar/{token}
  //              → backend frees the entry
  //              → we remove it from cartIds
  //              → if cartIds becomes empty, we clear the token too
  //
  //   Purchase:  POST /entradas/comprar { tokenPrerreserva: <UUID>, tokenUsuario }
  //              → backend finds all entries with that UUID and marks as VENDIDA
  //

  /**
   * Add an entrada to the cart.
   * Sends the current session token (or empty string on first call).
   * Stores the token returned by the backend for all future calls.
   */
  addToCart(entradaId: number): Observable<ReservaResponse> {
    // Always send the current prereserva session token.
    // On first call it will be '', backend generates a UUID.
    // On subsequent calls it will be that UUID, backend reuses it.
    const currentToken = this._prereservaToken();

    return new Observable(observer => {
      this.http.post<ReservaResponse>(
        `${API}/entradas/${entradaId}/prerreservar`,
        { token: currentToken }
      ).subscribe({
        next: reserva => {
          // Store the token returned by the backend (same for all entries in session)
          if (reserva.token && reserva.token !== currentToken) {
            this._prereservaToken.set(reserva.token);
            persistToken(reserva.token);
          }
          // Add this entrada to the local cart set
          const ids = new Set(this._cartIds());
          ids.add(entradaId);
          this._cartIds.set(ids);
          persistIds(ids);

          observer.next(reserva);
          observer.complete();
        },
        error: err => observer.error(err)
      });
    });
  }

  /**
   * Remove an entrada from the cart.
   * Calls DELETE /entradas/{id}/prerreservar/{token}.
   * Clears the session token if cart becomes empty.
   */
  removeFromCart(entradaId: number): Observable<void> {
    const token = this._prereservaToken();

    return new Observable(observer => {
      if (!token || !this._cartIds().has(entradaId)) {
        // Nothing to cancel on backend; just clean local state
        this._removeLocalId(entradaId);
        observer.next();
        observer.complete();
        return;
      }

      this.http.delete<void>(`${API}/entradas/${entradaId}/prerreservar/${token}`)
        .subscribe({
          next: () => {
            this._removeLocalId(entradaId);
            observer.next();
            observer.complete();
          },
          error: err => {
            // Clean local state even on error (token may be expired)
            this._removeLocalId(entradaId);
            observer.error(err);
          }
        });
    });
  }

  private _removeLocalId(entradaId: number): void {
    const ids = new Set(this._cartIds());
    ids.delete(entradaId);
    this._cartIds.set(ids);
    persistIds(ids);

    // If cart is now empty, reset the session token so next
    // purchase gets a fresh UUID from the backend
    if (ids.size === 0) {
      this._prereservaToken.set('');
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  /**
   * Restore _cartIds from a confirmed list returned by the backend.
   * Called on page load after GET /entradas/prerreserva/{token} succeeds.
   * Does NOT touch the token — only syncs the ID set.
   */
  restoreCartIds(ids: number[]): void {
    const set = new Set(ids);
    this._cartIds.set(set);
    persistIds(set);
  }

  /** Whether an entrada is currently in the prereserva cart */
  isInCart(entradaId: number): boolean {
    return this._cartIds().has(entradaId);
  }

  /** The shared prereserva token to use at purchase time */
  getPrereservaToken(): string {
    return this._prereservaToken();
  }

  /** Clear cart completely (call after successful purchase) */
  clearCart(): void {
    this._prereservaToken.set('');
    this._cartIds.set(new Set());
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(IDS_KEY);
  }

  // ── Purchase ─────────────────────────────────────────────

  comprar(tokenPrerreserva: string, tokenUsuario: string): Observable<CompraResponse> {
    return this.http.post<CompraResponse>(`${API}/entradas/comprar`, {
      tokenPrerreserva,
      tokenUsuario
    });
  }

  // ── Cola ─────────────────────────────────────────────────

  unirseACola(espectaculoId: number, correoUsuario: string): Observable<ColaResponse> {
    return this.http.post<ColaResponse>(
      `${API}/espectaculos/${espectaculoId}/cola`, {},
      { headers: { 'X-User-Email': correoUsuario } }
    );
  }

  consultarPosicionCola(espectaculoId: number, correoUsuario: string): Observable<ColaResponse> {
    return this.http.get<ColaResponse>(
      `${API}/espectaculos/${espectaculoId}/cola`,
      { headers: { 'X-User-Email': correoUsuario } }
    );
  }
}