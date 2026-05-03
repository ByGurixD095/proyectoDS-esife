import {
  Component, inject, signal, computed, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EventService } from '../../services/event.service';
import { AuthService }  from '../../services/auth.service';
import { forkJoin } from 'rxjs';
import {
  Espectaculo, Entrada, EntradaDeZona, EntradaPrecisa, EntradaInfo
} from '../../models/event.model';
import { AuthModalComponent, AuthView } from '../../shared/components/auth-modal/auth-modal';
import { PaymentComponent } from '../../shared/components/payment/payment';
import { ColaVirtualComponent } from '../../shared/components/cola-virtual/cola-virtual';

export interface ZonaGroup {
  zona: number;
  entradas: EntradaDeZona[];
  precioMin: number;
  precioMax: number;
}

export interface PriceGroup {
  label: string;
  rangeMin: number;
  rangeMax: number;
  disponibles: number;
  total: number;
  entradas: EntradaDeZona[];
}

export type SeatState = 'free' | 'selected' | 'taken' | 'loading';

export interface SeatCell {
  entrada: EntradaPrecisa | null;
  state: SeatState;
}

@Component({
  selector: 'app-espectaculo-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, AuthModalComponent, PaymentComponent, ColaVirtualComponent],
  templateUrl: './espectaculo-detail.html',
  styleUrls: ['./espectaculo-detail.css']
})
export class EspectaculoDetailComponent implements OnInit {
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

  espectaculoId = 0;

  // ── Cola virtual ──────────────────────────────────────────
  // true  = mostrar cola (bloqueando picker y compra)
  // false = turno activo o cola no activa, mostrar picker normal
  showCola     = signal(false);
  turnoActivo  = signal(false);

  // ── Per-seat loading/error state ──────────────────────────
  pendingIds = signal<Set<number>>(new Set());
  errorIds   = signal<Set<number>>(new Set());

  // ── Zona / planta UI state ────────────────────────────────
  selectedZona       = signal<number | null>(null);
  selectedPriceGroup = signal<number | null>(null);
  selectedPlanta     = signal<number | null>(null);
  activeTab          = signal<'zona' | 'precisa'>('zona');

  // ── Purchase flow ─────────────────────────────────────────
  purchaseStep = signal<'idle' | 'confirming' | 'processing' | 'done' | 'error'>('idle');
  purchaseMsg  = signal('');

  // ── Auth modal ─────────────────────────────────────────────
  showAuthModal = signal(false);
  authModalView = signal<AuthView>('login');

  // ── Payment modal ─────────────────────────────────────────
  showPayment = signal(false);

  totalPriceCentimos = computed(() =>
    Math.round(this.cartEntradas().reduce((s, e) => s + e.precio, 0) * 100)
  );

  accentColor = computed((): string => {
    const esp = this.espectaculo();
    if (!esp) return '#0071e3';
    const palette = [
      '#e07b39', '#6c5ce7', '#00b894', '#e84393',
      '#0984e3', '#636e72', '#fd79a8', '#a29bfe'
    ];
    let hash = 0;
    for (const c of esp.artista) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return palette[hash % palette.length];
  });

  entradasZona = computed((): EntradaDeZona[] =>
    this.entradas().filter((e): e is EntradaDeZona => e.tipo === 'ZONA')
  );
  entradasPrecisas = computed((): EntradaPrecisa[] =>
    this.entradas().filter((e): e is EntradaPrecisa => e.tipo === 'PRECISA')
  );
  hasZona    = computed(() => this.entradasZona().length > 0);
  hasPrecisa = computed(() => this.entradasPrecisas().length > 0);

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

  zonaEntradas = computed((): EntradaDeZona[] => {
    const z = this.selectedZona();
    if (z === null) return [];
    return this.entradasZona().filter(e => e.zona === z);
  });

  zonaSelectedCount = computed((): number =>
    this.zonaEntradas().filter(e => this.eventSvc.isInCart(e.id)).length
  );

  zonaPriceGroups = computed((): PriceGroup[] => {
    const entradas = this.zonaEntradas();
    if (!entradas.length) return [];
    const precios = entradas.map(e => e.precio);
    const min = Math.min(...precios);
    const max = Math.max(...precios);
    if (min === max) {
      return [{
        label: `${min.toFixed(2)}€`,
        rangeMin: min, rangeMax: max,
        disponibles: entradas.filter(e => !this.eventSvc.isInCart(e.id)).length,
        total: entradas.length, entradas,
      }];
    }
    const N = 4;
    const step = (max - min) / N;
    return Array.from({ length: N }, (_, i) => {
      const rMin = min + i * step;
      const rMax = i === N - 1 ? max + 0.001 : min + (i + 1) * step;
      const bucket = entradas.filter(e => e.precio >= rMin && e.precio < rMax);
      return {
        label: `${Math.ceil(rMin)}€ – ${Math.floor(rMax - 0.001)}€`,
        rangeMin: rMin, rangeMax: rMax,
        disponibles: bucket.filter(e => !this.eventSvc.isInCart(e.id)).length,
        total: bucket.length, entradas: bucket,
      };
    }).filter(g => g.total > 0);
  });

  private zonaEntradasDelPrecio = computed((): EntradaDeZona[] => {
    const idx = this.selectedPriceGroup();
    if (idx === null) return [];
    return this.zonaPriceGroups()[idx]?.entradas ?? [];
  });

  zonaSelectedCountForPrecio = computed((): number =>
    this.zonaEntradasDelPrecio().filter(e => this.eventSvc.isInCart(e.id)).length
  );

  zonaPrecioMax = computed((): number => this.zonaEntradasDelPrecio().length);

  selectedPriceLabel = computed((): string => {
    const idx = this.selectedPriceGroup();
    if (idx === null) return '';
    return this.zonaPriceGroups()[idx]?.label ?? '';
  });

  plantas = computed((): number[] => {
    const set = new Set(this.entradasPrecisas().map(e => e.planta));
    return Array.from(set).sort((a, b) => a - b);
  });

  seatGrid = computed((): SeatCell[][] => {
    const planta = this.selectedPlanta() ?? this.plantas()[0];
    if (planta === undefined) return [];
    const inPlanta = this.entradasPrecisas().filter(e => e.planta === planta);
    if (!inPlanta.length) return [];
    const maxFila = Math.max(...inPlanta.map(e => e.fila));
    const maxCol  = Math.max(...inPlanta.map(e => e.columna));
    const posMap  = new Map<string, EntradaPrecisa>();
    for (const e of inPlanta) posMap.set(`${e.fila}-${e.columna}`, e);
    const pending = this.pendingIds();
    const grid: SeatCell[][] = [];
    for (let f = 1; f <= maxFila; f++) {
      const row: SeatCell[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const e = posMap.get(`${f}-${c}`) ?? null;
        let state: SeatState = 'taken';
        if (e) {
          if (pending.has(e.id))                 state = 'loading';
          else if (this.eventSvc.isInCart(e.id)) state = 'selected';
          else                                    state = 'free';
        }
        row.push({ entrada: e, state });
      }
      grid.push(row);
    }
    return grid;
  });

  cartEntradas  = computed((): Entrada[] =>
    this.entradas().filter(e => this.eventSvc.isInCart(e.id))
  );
  totalPrice    = computed(() => this.cartEntradas().reduce((s, e) => s + e.precio, 0));
  selectionCount = computed(() => this.cartEntradas().length);

  fechaLabel = computed((): string => {
    const esp = this.espectaculo();
    if (!esp) return '';
    return new Date(esp.fecha).toLocaleDateString('es-ES', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
  });

  horaLabel    = computed(() => this.espectaculo()?.fecha.substring(11, 16) ?? '');
  ocupacionPct = computed((): number => {
    const i = this.info();
    if (!i || i.total === 0) return 0;
    return Math.round(((i.total - i.libres) / i.total) * 100);
  });

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/']); return; }
    this.espectaculoId = id;

    const cached = this.eventSvc.espectaculos().find(e => e.id === id);
    if (cached) {
      this.espectaculo.set(cached);
      console.log('[Cola] colaActiva desde caché:', cached.colaActiva);
      this._checkCola(cached.colaActiva);
    } else {
      this.eventSvc.getEspectaculoById(id).subscribe({
        next: data => {
          console.log('[Cola] colaActiva desde API:', data.colaActiva)
          this.espectaculo.set(data);
          this._checkCola(data.colaActiva);
        },
        error: () => {}
      });
    }

    this.eventSvc.getEntradasByEspectaculo(id).subscribe({
      next: libres => {
        const libresIds = new Set(libres.map(e => e.id));
        const prereservadasIds = Array.from(this.eventSvc.cartIds())
          .filter(cartId => !libresIds.has(cartId));

        if (!prereservadasIds.length) {
          this.entradas.set(libres);
          this.eventSvc.registerLoadedEntradas(libres);
          this.loading.set(false);
          this._initTabAndPlanta(libres);
          return;
        }

        forkJoin(prereservadasIds.map(eid =>
          this.eventSvc.getEntradaById(id, eid)
        )).subscribe({
          next: prereservadas => {
            const todas = [...libres, ...prereservadas.filter(e => e.espectaculoId === id)];
            this.entradas.set(todas);
            this.eventSvc.registerLoadedEntradas(todas);
            this.loading.set(false);
            this._initTabAndPlanta(todas);
          },
          error: () => {
            this.entradas.set(libres);
            this.eventSvc.registerLoadedEntradas(libres);
            this.loading.set(false);
            this._initTabAndPlanta(libres);
          }
        });
      },
      error: () => {
        this.error.set('No se pudieron cargar las entradas.');
        this.loading.set(false);
      }
    });

    this.eventSvc.getEntradaInfo(id).subscribe({
      next: data => this.info.set(data),
      error: () => {}
    });
  }

  // Si la cola está activa y el usuario está logueado, mostramos la cola
  // Si no está logueado, primero pedimos login
  private _checkCola(colaActiva: boolean): void {
    if (!colaActiva) return;

    if (!this.authSvc.isLoggedIn()) {
      // Pedimos login primero, cuando vuelva se mostrará la cola
      this.authModalView.set('login');
      this.showAuthModal.set(true);
    } else {
      this.showCola.set(true);
    }
  }

  private _initTabAndPlanta(entradas: Entrada[]): void {
    const hasZ = entradas.some(e => e.tipo === 'ZONA');
    const hasP = entradas.some(e => e.tipo === 'PRECISA');
    this.activeTab.set(hasZ ? 'zona' : 'precisa');
    if (hasP) {
      const plantas = Array.from(
        new Set((entradas.filter(e => e.tipo === 'PRECISA') as EntradaPrecisa[]).map(e => e.planta))
      ).sort((a, b) => a - b);
      if (plantas.length) this.selectedPlanta.set(plantas[0]);
    }
  }

  // ── Cola callbacks ────────────────────────────────────────
  onTurnoActivo(): void {
    // El usuario ya tiene su turno — ocultamos la cola y mostramos el picker
    this.turnoActivo.set(true);
    this.showCola.set(false);
  }

  onColaCerrada(): void {
    // El usuario abandonó la cola — volvemos atrás
    this.router.navigate(['/']);
  }

  // ── Navigation ────────────────────────────────────────────
  goBack(): void { this.router.navigate(['/']); }

  selectZonaAndReset(zona: number): void {
    this.selectedZona.set(zona);
    this.selectedPriceGroup.set(null);
  }

  selectPlanta(planta: number): void { this.selectedPlanta.set(planta); }
  selectPrecio(idx: number): void    { this.selectedPriceGroup.set(idx); }

  addOneFromZona(): void {
    const pool = (this.selectedPriceGroup() !== null
      ? this.zonaEntradasDelPrecio()
      : this.zonaEntradas()
    ).filter(e => !this.eventSvc.isInCart(e.id));
    const next = pool[0];
    if (next) this._prereservar(next.id);
  }

  removeOneFromZona(): void {
    const prereserved = (this.selectedPriceGroup() !== null
      ? this.zonaEntradasDelPrecio()
      : this.zonaEntradas()
    ).filter(e => this.eventSvc.isInCart(e.id));
    const last = prereserved[prereserved.length - 1];
    if (last) this._cancelar(last.id);
  }

  toggleSeat(cell: SeatCell): void {
    if (!cell.entrada || cell.state === 'loading' || cell.state === 'taken') return;
    cell.state === 'selected'
      ? this._cancelar(cell.entrada.id)
      : this._prereservar(cell.entrada.id);
  }

  // ── Purchase flow ─────────────────────────────────────────
  confirmPurchase(): void {
    if (!this.selectionCount()) return;
    if (!this.authSvc.isLoggedIn()) {
      this.authModalView.set('login');
      this.showAuthModal.set(true);
      return;
    }
    this.showPayment.set(true);
  }

  onAuthSuccess(): void {
    this.showAuthModal.set(false);
    // Si la cola estaba activa, ahora que está logueado la mostramos
    const esp = this.espectaculo();
    if (esp?.colaActiva && !this.turnoActivo()) {
      this.showCola.set(true);
    } else {
      this.showPayment.set(true);
    }
  }

  onPaymentSuccess(msg: string): void {
    this.showPayment.set(false);
    this.purchaseStep.set('done');
    this.purchaseMsg.set(msg);
  }

  cancelConfirm(): void { this.purchaseStep.set('idle'); }

  processPurchase(): void {
    this.purchaseStep.set('processing');
    const prereservaToken = this.eventSvc.getPrereservaToken();
    if (!prereservaToken) {
      this.purchaseStep.set('error');
      this.purchaseMsg.set('No hay una sesión de prerreserva activa.');
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

  // ── API calls ─────────────────────────────────────────────
  private _prereservar(entradaId: number): void {
    this._setPending(entradaId, true);
    this._setError(entradaId, false);
    this.eventSvc.addToCart(this.espectaculoId, entradaId).subscribe({
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
    this.eventSvc.removeFromCart(this.espectaculoId, entradaId).subscribe({
      next:  () => this._setPending(entradaId, false),
      error: () => this._setPending(entradaId, false)
    });
  }

  cancelarEntrada(entradaId: number): void { this._cancelar(entradaId); }
  isInCart(id: number): boolean  { return this.eventSvc.isInCart(id); }
  isPending(id: number): boolean { return this.pendingIds().has(id); }
  hasError(id: number): boolean  { return this.errorIds().has(id); }
  trackByIndex(i: number): number { return i; }
  trackById(_: number, cell: SeatCell): number { return cell.entrada?.id ?? _; }

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
}