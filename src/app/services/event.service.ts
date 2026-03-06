import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import {
  Espectaculo, Escenario, Entrada, EntradaInfo,
  ReservaResponse, CompraResponse, ColaResponse,
  ViewMode, EspectaculosByVenue
} from '../models/event.model';

const API = 'http://localhost:8080';

// ── Session-scoped prereserva store ──────────────────────────
// Keyed by entradaId → token returned by backend
// Stored in sessionStorage so it survives page refreshes but
// dies when the tab is closed (correct for a 10-min prereserva)
const SESSION_KEY = 'prereservas';

function loadPrereservas(): Map<number, string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [number, string][]);
  } catch {
    return new Map();
  }
}

function savePrereservas(map: Map<number, string>): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(map.entries())));
  } catch { /* quota exceeded – silently ignore */ }
}

@Injectable({ providedIn: 'root' })
export class EventService {
  private http = inject(HttpClient);

  // ── Prereserva token store (entradaId → token) ────────────
  // This is the source of truth for what the user has "in cart"
  private _prereservas = signal<Map<number, string>>(loadPrereservas());
  prereservas = this._prereservas.asReadonly();

  // ── UI state ──────────────────────────────────────────────
  private _viewMode    = signal<ViewMode>('by-event');
  private _searchQuery = signal<string>('');
  private _espectaculos = signal<Espectaculo[]>([]);
  private _escenarios   = signal<Escenario[]>([]);
  private _loading      = signal<boolean>(false);
  private _error        = signal<string | null>(null);

  viewMode      = this._viewMode.asReadonly();
  searchQuery   = this._searchQuery.asReadonly();
  espectaculos  = this._espectaculos.asReadonly();
  escenarios    = this._escenarios.asReadonly();
  loading       = this._loading.asReadonly();
  error         = this._error.asReadonly();

  // ── Derived: set of prereserved entrada IDs ───────────────
  prereservedIds = computed(() => new Set(this._prereservas().keys()));

  // ── Client-side filter ────────────────────────────────────
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
      escenarioNombre,
      espectaculos,
    }));
  });

  // ── Public API ────────────────────────────────────────────

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
      if (data && data.length > 0) {
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
    const params = new HttpParams().set('artist', artist);
    const req$ = this.http.get<Espectaculo[]>(`${API}/espectaculos`, { params }).pipe(
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

  getEntradaInfo(espectaculoId: number): Observable<EntradaInfo> {
    return this.http.get<EntradaInfo>(`${API}/entradas/espectaculo/${espectaculoId}/info`);
  }

  getNumeroEntradas(espectaculoId: number): Observable<number> {
    return this.http.get<number>(`${API}/entradas/espectaculos/${espectaculoId}/cantidad`);
  }

  // ── Prereserva (the real cart logic) ─────────────────────

  /**
   * Add an entrada to the cart:
   * 1. Call POST /entradas/{id}/prerreservar with token (empty string if none yet)
   * 2. Store the returned token in sessionStorage keyed by entradaId
   * Returns an Observable so the caller can show loading/error state.
   */
  addToCart(entradaId: number, userToken: string | null): Observable<ReservaResponse | null> {
    const body = { token: userToken ?? '' };

    return new Observable(observer => {
      this.http.post<ReservaResponse>(`${API}/entradas/${entradaId}/prerreservar`, body)
        .subscribe({
          next: reserva => {
            const map = new Map(this._prereservas());
            map.set(entradaId, reserva.token);
            this._prereservas.set(map);
            savePrereservas(map);
            observer.next(reserva);
            observer.complete();
          },
          error: err => {
            observer.error(err);
          }
        });
    });
  }

  /**
   * Remove an entrada from the cart:
   * 1. Look up the token for this entradaId
   * 2. Call DELETE /entradas/{id}/prerreservar/{token}
   * 3. Remove from local store
   */
  removeFromCart(entradaId: number): Observable<void> {
    const token = this._prereservas().get(entradaId);

    return new Observable(observer => {
      if (!token) {
        // Not in cart – nothing to do
        observer.next();
        observer.complete();
        return;
      }

      this.http.delete<void>(`${API}/entradas/${entradaId}/prerreservar/${token}`)
        .subscribe({
          next: () => {
            const map = new Map(this._prereservas());
            map.delete(entradaId);
            this._prereservas.set(map);
            savePrereservas(map);
            observer.next();
            observer.complete();
          },
          error: err => {
            // Even on error, clean local state (token may already be expired)
            const map = new Map(this._prereservas());
            map.delete(entradaId);
            this._prereservas.set(map);
            savePrereservas(map);
            observer.error(err);
          }
        });
    });
  }

  /** Get the prereserva token for a given entrada (null if not in cart) */
  getTokenForEntrada(entradaId: number): string | null {
    return this._prereservas().get(entradaId) ?? null;
  }

  /** True if this entrada is currently prereserved */
  isInCart(entradaId: number): boolean {
    return this._prereservas().has(entradaId);
  }

  /** Clear ALL local prereservas (e.g. after successful purchase) */
  clearCart(): void {
    this._prereservas.set(new Map());
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ── Purchase ─────────────────────────────────────────────

  prerreservar(entradaId: number, token: string | null): Observable<ReservaResponse> {
    const body = { token: token ?? '' };
    return this.http.post<ReservaResponse>(`${API}/entradas/${entradaId}/prerreservar`, body);
  }

  cancelarPrerreserva(entradaId: number, token: string): Observable<void> {
    return this.http.delete<void>(`${API}/entradas/${entradaId}/prerreservar/${token}`);
  }

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