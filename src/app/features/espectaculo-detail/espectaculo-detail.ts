import {
  Component, inject, signal, computed, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EventService } from '../../services/event.service';
import { AuthService }  from '../../services/auth.service';
import {
  Espectaculo, Entrada, EntradaDeZona, EntradaPrecisa, EntradaInfo
} from '../../models/event.model';

export interface ZonaGroup {
  zona: number;
  entradas: EntradaDeZona[];
  precioMin: number;
  precioMax: number;
}

export type SeatState = 'free' | 'selected' | 'taken' | 'loading';

export interface SeatCell {
  entrada: EntradaPrecisa | null;
  state: SeatState;
}

@Component({
  selector: 'app-espectaculo-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './espectaculo-detail.html',
  styleUrls: ['./espectaculo-detail.css']
})
export class EspectaculoDetailComponent implements OnInit, OnDestroy {
  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  protected eventSvc = inject(EventService);
  protected authSvc  = inject(AuthService);

  // ── Raw state ─────────────────────────────────────────────
  espectaculo = signal<Espectaculo | null>(null);
  entradas    = signal<Entrada[]>([]);
  info        = signal<EntradaInfo | null>(null);
  loading     = signal(true);
  error       = signal<string | null>(null);

  // ── Per-seat loading/error state ─────────────────────────
  pendingIds = signal<Set<number>>(new Set());
  errorIds   = signal<Set<number>>(new Set());

  // ── Zona / planta UI state ────────────────────────────────
  selectedZona   = signal<number | null>(null);
  selectedPlanta = signal<number | null>(null);
  activeTab      = signal<'zona' | 'precisa'>('zona');

  // ── Purchase flow ─────────────────────────────────────────
  purchaseStep = signal<'idle' | 'confirming' | 'processing' | 'done' | 'error'>('idle');
  purchaseMsg  = signal('');

  // ── Accent color (same deterministic hash as ticket card) ─
  accentColor = computed((): string => {
    const esp = this.espectaculo();
    if (!esp) return '#8b5cf6';
    const palette = [
      '#e07b39', '#6c5ce7', '#00b894', '#e84393',
      '#0984e3', '#636e72', '#fd79a8', '#a29bfe'
    ];
    let hash = 0;
    for (const c of esp.artista) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return palette[hash % palette.length];
  });

  // ── Split entradas by type ────────────────────────────────
  entradasZona = computed((): EntradaDeZona[] =>
    this.entradas().filter((e): e is EntradaDeZona => e.tipo === 'ZONA')
  );
  entradasPrecisas = computed((): EntradaPrecisa[] =>
    this.entradas().filter((e): e is EntradaPrecisa => e.tipo === 'PRECISA')
  );
  hasZona    = computed(() => this.entradasZona().length > 0);
  hasPrecisa = computed(() => this.entradasPrecisas().length > 0);

  // ── Zona groups ───────────────────────────────────────────
  zonaGroups = computed((): ZonaGroup[] => {
    const map = new Map<number, EntradaDeZona[]>();
    for (const e of this.entradasZona()) {
      if (!map.has(e.zona)) map.set(e.zona, []);
      map.get(e.zona)!.push(e);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([zona, list]) => ({
        zona,
        entradas: list,
        precioMin: Math.min(...list.map(e => e.precio)),
        precioMax: Math.max(...list.map(e => e.precio)),
      }));
  });

  // Entradas within the currently selected zona
  zonaEntradas = computed((): EntradaDeZona[] => {
    const z = this.selectedZona();
    if (z === null) return [];
    return this.entradasZona().filter(e => e.zona === z);
  });

  // How many of the selected zona are prereserved right now
  zonaSelectedCount = computed((): number =>
    this.zonaEntradas().filter(e => this.eventSvc.isInCart(e.id)).length
  );

  // ── Plantas for precisa ───────────────────────────────────
  plantas = computed((): number[] => {
    const set = new Set(this.entradasPrecisas().map(e => e.planta));
    return Array.from(set).sort((a, b) => a - b);
  });

  // ── Seat grid ─────────────────────────────────────────────
  seatGrid = computed((): SeatCell[][] => {
    const planta = this.selectedPlanta() ?? this.plantas()[0];
    if (planta === undefined) return [];

    const inPlanta = this.entradasPrecisas().filter(e => e.planta === planta);
    if (!inPlanta.length) return [];

    const maxFila = Math.max(...inPlanta.map(e => e.fila));
    const maxCol  = Math.max(...inPlanta.map(e => e.columna));

    const posMap = new Map<string, EntradaPrecisa>();
    for (const e of inPlanta) posMap.set(`${e.fila}-${e.columna}`, e);

    const pending = this.pendingIds();

    const grid: SeatCell[][] = [];
    for (let f = 1; f <= maxFila; f++) {
      const row: SeatCell[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const e = posMap.get(`${f}-${c}`) ?? null;
        let state: SeatState = 'taken';
        if (e) {
          if (pending.has(e.id))                  state = 'loading';
          else if (this.eventSvc.isInCart(e.id))  state = 'selected';
          else                                     state = 'free';
        }
        row.push({ entrada: e, state });
      }
      grid.push(row);
    }
    return grid;
  });

  // ── Cart (all prereserved entradas for this espectaculo) ──
  cartEntradas = computed((): Entrada[] =>
    this.entradas().filter(e => this.eventSvc.isInCart(e.id))
  );

  totalPrice     = computed(() => this.cartEntradas().reduce((s, e) => s + e.precio, 0));
  selectionCount = computed(() => this.cartEntradas().length);

  // ── Hero helpers ──────────────────────────────────────────
  fechaLabel = computed((): string => {
    const esp = this.espectaculo();
    if (!esp) return '';
    return new Date(esp.fecha).toLocaleDateString('es-ES', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
  });

  horaLabel = computed(() => this.espectaculo()?.fecha.substring(11, 16) ?? '');

  ocupacionPct = computed((): number => {
    const i = this.info();
    if (!i || i.total === 0) return 0;
    return Math.round(((i.total - i.libres) / i.total) * 100);
  });

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/']); return; }

    // Use cached espectaculo if available (navigated from home)
    const cached = this.eventSvc.espectaculos().find(e => e.id === id);
    if (cached) {
      this.espectaculo.set(cached);
    } else {
      // Fallback: fetch via ?id= query param (no path-variable endpoint exists)
      this.eventSvc.getEspectaculoById(id).subscribe({
        next: data => this.espectaculo.set(data),
        error: () => {} // hero stays empty, not critical
      });
    }

    // Step 1: load available (DISPONIBLE) entries for this show
    this.eventSvc.getEntradasByEspectaculo(id).subscribe({
      next: availableEntradas => {
        // Step 2: if we have an active prereserva session token, fetch the
        // RESERVADA entries that belong to it and merge them into the list.
        // The backend only returns DISPONIBLE entries in the normal endpoint,
        // so we need a separate call to recover the user's cart on page load.
        const token = this.eventSvc.getPrereservaToken();

        const finalize = (allEntradas: Entrada[]) => {
          this.entradas.set(allEntradas);
          this.loading.set(false);

          const hasZ = allEntradas.some(e => e.tipo === 'ZONA');
          const hasP = allEntradas.some(e => e.tipo === 'PRECISA');
          this.activeTab.set(hasZ ? 'zona' : 'precisa');

          if (hasP) {
            const ps = Array.from(
              new Set((allEntradas.filter(e => e.tipo === 'PRECISA') as EntradaPrecisa[]).map(e => e.planta))
            ).sort((a, b) => a - b);
            if (ps.length) this.selectedPlanta.set(ps[0]);
          }
        };

        if (!token) {
          // No active session — just show available entries, cart is empty
          finalize(availableEntradas);
          return;
        }

        // Fetch prereserved entries for our session token
        this.eventSvc.getEntradasByToken(token).subscribe({
          next: prereservedEntradas => {
            if (prereservedEntradas.length === 0) {
              // Token exists in sessionStorage but backend has no entries
              // (expired or already purchased) — clear stale local state
              this.eventSvc.clearCart();
              finalize(availableEntradas);
              return;
            }

            // Restore cart IDs from what the backend confirms is still RESERVADA
            const prereservedIds = prereservedEntradas.map(e => e.id);
            this.eventSvc.restoreCartIds(prereservedIds);

            // Merge: available list + prereserved list (deduplicating by id)
            // so the UI can show prereserved seats as "selected" alongside
            // the free ones.
            const availableIds = new Set(availableEntradas.map(e => e.id));
            const merged = [
              ...availableEntradas,
              ...prereservedEntradas.filter(e => !availableIds.has(e.id))
            ];

            finalize(merged);
          },
          error: () => {
            // Failed to reach backend — fall back to just available entries
            // and keep local cart state as-is (optimistic)
            finalize(availableEntradas);
          }
        });
      },
      error: () => { this.error.set('No se pudieron cargar las entradas.'); this.loading.set(false); }
    });

    this.eventSvc.getEntradaInfo(id).subscribe({
      next: data => this.info.set(data),
      error: () => {}
    });
  }

  ngOnDestroy(): void {}

  // ── Navigation ────────────────────────────────────────────
  goBack(): void { this.router.navigate(['/']); }
  selectZona(zona: number): void   { this.selectedZona.set(zona); }
  selectPlanta(planta: number): void { this.selectedPlanta.set(planta); }

  // ── Zona +/- ─────────────────────────────────────────────

  addOneFromZona(): void {
    // Pick next not-yet-prereserved entrada in this zona
    const next = this.zonaEntradas().find(e => !this.eventSvc.isInCart(e.id));
    if (!next) return;
    this._prereservar(next.id);
  }

  removeOneFromZona(): void {
    // Cancel the last prereserved entrada in this zona
    const prereserved = this.zonaEntradas().filter(e => this.eventSvc.isInCart(e.id));
    const last = prereserved[prereserved.length - 1];
    if (!last) return;
    this._cancelar(last.id);
  }

  // ── Seat toggle ───────────────────────────────────────────

  toggleSeat(cell: SeatCell): void {
    if (!cell.entrada || cell.state === 'loading' || cell.state === 'taken') return;
    cell.state === 'selected'
      ? this._cancelar(cell.entrada.id)
      : this._prereservar(cell.entrada.id);
  }

  // ── Internal: call API immediately ───────────────────────

  private _prereservar(entradaId: number): void {
    this._setPending(entradaId, true);
    this._setError(entradaId, false);

    this.eventSvc.addToCart(entradaId).subscribe({
      next:  () => this._setPending(entradaId, false),
      error: () => {
        this._setPending(entradaId, false);
        this._setError(entradaId, true);
        setTimeout(() => this._setError(entradaId, false), 3000);
      }
    });
  }

  private _cancelar(entradaId: number): void {
    this._setPending(entradaId, true);
    this.eventSvc.removeFromCart(entradaId).subscribe({
      next:  () => this._setPending(entradaId, false),
      error: () => this._setPending(entradaId, false)
    });
  }

  private _setPending(id: number, on: boolean): void {
    const s = new Set(this.pendingIds());
    on ? s.add(id) : s.delete(id);
    this.pendingIds.set(s);
  }

  private _setError(id: number, on: boolean): void {
    const s = new Set(this.errorIds());
    on ? s.add(id) : s.delete(id);
    this.errorIds.set(s);
  }

  // ── Purchase flow ─────────────────────────────────────────

  confirmPurchase(): void {
    if (!this.selectionCount()) return;
    this.purchaseStep.set('confirming');
  }

  cancelConfirm(): void { this.purchaseStep.set('idle'); }

  processPurchase(): void {
    this.purchaseStep.set('processing');

    // The shared prereserva token groups ALL entries in the cart.
    // The backend looks up all entries with this token and marks them VENDIDA.
    const prereservaToken = this.eventSvc.getPrereservaToken();
    if (!prereservaToken) {
      this.purchaseStep.set('error');
      this.purchaseMsg.set('No hay una sesión de prerreserva activa. Añade entradas al carrito primero.');
      return;
    }

    const userToken = this.authSvc.getToken() ?? '';

    this.eventSvc.comprar(prereservaToken, userToken).subscribe({
      next: result => {
        this.purchaseStep.set('done');
        this.purchaseMsg.set(result.mensaje);
        this.eventSvc.clearCart();
      },
      error: () => {
        this.purchaseStep.set('error');
        this.purchaseMsg.set('Error al procesar la compra. Inténtalo de nuevo.');
      }
    });
  }

  // ── Template helpers ──────────────────────────────────────
  isInCart(id: number): boolean  { return this.eventSvc.isInCart(id); }
  isPending(id: number): boolean { return this.pendingIds().has(id); }
  hasError(id: number): boolean  { return this.errorIds().has(id); }

  /** Public alias so template can call it directly from the order list */
  _cancelar_public(entradaId: number): void { this._cancelar(entradaId); }

  trackByIndex(i: number): number { return i; }
  trackById(_: number, cell: SeatCell): number { return cell.entrada?.id ?? _; }
}