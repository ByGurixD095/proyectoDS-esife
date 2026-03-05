import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import {
  Espectaculo, Escenario, Entrada, EntradaInfo,
  ReservaResponse, CompraResponse, ColaResponse,
  ViewMode, EspectaculosByVenue
} from '../models/event.model';

const API = 'http://localhost:8080';

@Injectable({ providedIn: 'root' })
export class EventService {
  private http = inject(HttpClient);

  // ── UI state ──────────────────────────────────────────────
  private _viewMode   = signal<ViewMode>('by-event');
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

  // Client-side filter over already-loaded espectaculos
  filteredEspectaculos = computed(() => {
    const q = this._searchQuery().toLowerCase().trim();
    if (!q) return this._espectaculos();
    return this._espectaculos().filter(e =>
      e.artista.toLowerCase().includes(q) ||
      e.escenario.toLowerCase().includes(q)
    );
  });

  // Grouped by venue for the "by-venue" view
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

  setViewMode(mode: ViewMode): void {
    this._viewMode.set(mode);
  }

  // Busca primero por artista; si no hay resultados, intenta por escenario;
  // si tampoco hay, deja la lista vacía. Query vacío recarga todo.
  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
    if (!query.trim()) {
      this.loadAll();
      return;
    }

    this._loading.set(true);
    this._error.set(null);

    // 1º intento: por artista
    const params = new HttpParams().set('artist', query);
    this.http.get<Espectaculo[]>(`${API}/espectaculos`, { params }).pipe(
      catchError(() => of([]))
    ).subscribe(data => {
      if (data && data.length > 0) {
        this._espectaculos.set(data);
        this._loading.set(false);
      } else {
        // 2º intento: por nombre de escenario
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
      tap(data => {
        this._espectaculos.set(data);
        this._loading.set(false);
      }),
      catchError(err => {
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
      tap(data => {
        this._espectaculos.set(data);
        this._loading.set(false);
      }),
      catchError(() => {
        // 404 = no results, not a real error
        this._espectaculos.set([]);
        this._loading.set(false);
        return of([]);
      })
    );
    req$.subscribe();
    return req$;
  }

  searchByEscenario(escenario: string): Observable<Espectaculo[]> {
    this._loading.set(true);

    const req$ = this.http.get<Espectaculo[]>(`${API}/espectaculos/${escenario}`).pipe(
      tap(data => {
        this._espectaculos.set(data);
        this._loading.set(false);
      }),
      catchError(() => {
        // 404 = no hay resultados o error de red
        this._espectaculos.set([]);
        this._loading.set(false);
        return of([]);
      })
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

  prerreservar(entradaId: number, token: string | null): Observable<ReservaResponse> {
    const body: Partial<ReservaResponse> = token ? { token } : {};
    return this.http.post<ReservaResponse>(
      `${API}/entradas/${entradaId}/prerreservar`, body
    );
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
      `${API}/espectaculos/${espectaculoId}/cola`,
      {},
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