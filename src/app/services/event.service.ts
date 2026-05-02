import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, tap, catchError, of } from 'rxjs';
import {
  Espectaculo, Escenario, Entrada, EntradaInfo,
  ReservaResponse, CompraResponse, ColaResponse,
  ViewMode, EspectaculosByVenue,
  EntradaComprada
} from '../models/event.model';

const API = 'http://localhost:8080';

const TOKEN_KEY = 'prereserva_token';
const IDS_KEY   = 'prereserva_ids';

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
  private _prereservaToken = signal<string>(loadToken());
  private _cartIds         = signal<Set<number>>(loadIds());

  prereservaToken = this._prereservaToken.asReadonly();
  cartIds         = this._cartIds.asReadonly();

  // ── Cache de entradas cargadas (para el dropdown del carrito) ─
  // El componente de detalle las registra al cargarlas
  private _cartEntradasCache: Entrada[] = [];

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
      if (!map.has(e.escenario)) map.set(e.escenario, []);
      map.get(e.escenario)!.push(e);
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
    this.http.get<Espectaculo[]>(`${API}/espectaculos`, {
      params: { artista: query }
    }).pipe(
      catchError(() => of([] as Espectaculo[]))
    ).subscribe(data => {
      this._espectaculos.set(data ?? []);
      this._loading.set(false);
    });
  }

  // ── Espectaculos ─────────────────────────────────────────
  loadAll(): void {
    this._loading.set(true);
    this._error.set(null);
    this.http.get<Espectaculo[]>(`${API}/espectaculos`).pipe(
      tap(data => { this._espectaculos.set(data); this._loading.set(false); }),
      catchError(() => {
        this._error.set('No se pudo conectar con el servidor.');
        this._loading.set(false);
        return of([]);
      })
    ).subscribe();
  }

  getEspectaculoById(id: number): Observable<Espectaculo> {
    return this.http.get<Espectaculo>(`${API}/espectaculos/${id}`);
  }

  // ── Escenarios ───────────────────────────────────────────
  loadEscenarios(): void {
    this.http.get<Escenario[]>(`${API}/escenarios`).pipe(
      tap(data => this._escenarios.set(data)),
      catchError(() => of([]))
    ).subscribe();
  }

  // ── Entradas ─────────────────────────────────────────────
  getEntradaById(espectaculoId: number, entradaId: number): Observable<Entrada> {
    return this.http.get<Entrada>(`${API}/espectaculos/${espectaculoId}/entradas/${entradaId}`);
  }

  getEntradasByEspectaculo(espectaculoId: number): Observable<Entrada[]> {
    return this.http.get<Entrada[]>(`${API}/espectaculos/${espectaculoId}/entradas`);
  }

  getEntradaInfo(espectaculoId: number): Observable<EntradaInfo> {
    return this.http.get<EntradaInfo>(`${API}/espectaculos/${espectaculoId}/entradas/info`);
  }

  getNumeroEntradas(espectaculoId: number): Observable<number> {
    return this.http.get<number>(`${API}/espectaculos/${espectaculoId}/entradas/cantidad`);
  }

  // ── Cart dropdown helpers ─────────────────────────────────

  // El detalle registra sus entradas cargadas para que el dropdown
  // pueda mostrarlas desde cualquier página
  registerLoadedEntradas(entradas: Entrada[]): void {
    this._cartEntradasCache = entradas;
  }

  // Devuelve las entradas en carrito (con datos completos si están cacheadas)
  getCartEntradas(): Entrada[] {
    const cartIds = this._cartIds();
    return this._cartEntradasCache.filter(e => cartIds.has(e.id));
  }

  // Devuelve el espectaculoId de las entradas en carrito
  getCartEspectaculoId(): number | null {
    const cartIds = this._cartIds();
    if (!cartIds.size) return null;
    const entry = this._cartEntradasCache.find(e => cartIds.has(e.id));
    return entry?.espectaculoId ?? null;
  }

  // ── Cart: prereserva session ──────────────────────────────
  addToCart(espectaculoId: number, entradaId: number): Observable<ReservaResponse> {
    const currentToken = this._prereservaToken();
    return new Observable(observer => {
      this.http.post<ReservaResponse>(
        `${API}/espectaculos/${espectaculoId}/entradas/${entradaId}/prerreservar`,
        { token: currentToken }
      ).subscribe({
        next: reserva => {
          if (reserva.token && reserva.token !== currentToken) {
            this._prereservaToken.set(reserva.token);
            persistToken(reserva.token);
          }
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

  removeFromCart(espectaculoId: number, entradaId: number): Observable<void> {
    const token = this._prereservaToken();
    return new Observable(observer => {
      if (!token || !this._cartIds().has(entradaId)) {
        this._removeLocalId(entradaId);
        observer.next();
        observer.complete();
        return;
      }
      this.http.delete<void>(
        `${API}/espectaculos/${espectaculoId}/entradas/${entradaId}/prerreservar/${token}`
      ).subscribe({
        next: () => {
          this._removeLocalId(entradaId);
          observer.next();
          observer.complete();
        },
        error: err => {
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
    if (ids.size === 0) {
      this._prereservaToken.set('');
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  restoreCartIds(ids: number[]): void {
    const set = new Set(ids);
    this._cartIds.set(set);
    persistIds(set);
  }

  isInCart(entradaId: number): boolean {
    return this._cartIds().has(entradaId);
  }

  getPrereservaToken(): string {
    return this._prereservaToken();
  }

  clearCart(): void {
    this._prereservaToken.set('');
    this._cartIds.set(new Set());
    this._cartEntradasCache = [];
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(IDS_KEY);
  }

  // ── Compra ────────────────────────────────────────────────
  comprar(tokenPrerreserva: string, tokenUsuario: string): Observable<CompraResponse> {
    return this.http.post<CompraResponse>(`${API}/compras`, {
      tokenPrerreserva,
      tokenUsuario
    });
  }

  // ── Mis entradas ──────────────────────────────────────────
  getMisEntradas(token: string): Observable<EntradaComprada[]> {
    return this.http.get<EntradaComprada[]>(`${API}/compras/mis-entradas`, {
      headers: { Authorization: `Bearer ${token}` }
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