import {
  Component, inject, signal, computed,
  Input, Output, EventEmitter,
  OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { ColaResponse } from '../../../models/event.model';

const API = 'http://localhost:8080';
const POLL_INTERVAL_MS = 10000;

@Component({
  selector: 'app-cola-virtual',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cola-virtual.html',
  styleUrls: ['./cola-virtual.css']
})
export class ColaVirtualComponent implements OnInit, OnDestroy {

  @Input({ required: true }) espectaculoId!: number;
  @Output() turnoActivo = new EventEmitter<void>();
  @Output() cerrar      = new EventEmitter<void>();

  private http    = inject(HttpClient);
  private authSvc = inject(AuthService);

  estado      = signal<ColaResponse | null>(null);
  loading     = signal(true);
  error       = signal<string | null>(null);
  segundosRestantes = signal<number | null>(null);

  // Guardamos el número de usuariosDelante del primer poll
  // para poder calcular el progreso visual
  totalInicial = signal<number>(0);

  private pollTimer:      any = null;
  private countdownTimer: any = null;

  // ── Computed ──────────────────────────────────────────────
  esTuTurno  = computed(() => this.estado()?.esTuTurno ?? false);
  expirado   = computed(() => this.estado()?.estadoCola === 'EXPIRADO');
  completado = computed(() => this.estado()?.estadoCola === 'COMPLETADO');

  // Porcentaje de progreso en la cola (0 → 100)
  progresoPercent = computed((): number => {
    const total = this.totalInicial();
    if (total === 0) return 100;
    const delante = this.estado()?.usuariosDelante ?? total;
    return Math.round(((total - delante) / total) * 100);
  });

  minutosRestantes = computed(() => {
    const s = this.segundosRestantes();
    if (s === null) return null;
    const m  = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss.toString().padStart(2, '0')}`;
  });

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    this._unirse();
  }

  ngOnDestroy(): void {
    this._stopPolling();
    this._stopCountdown();
  }

  // ── Acciones ──────────────────────────────────────────────
  private _unirse(): void {
    this.loading.set(true);
    this.http.post<ColaResponse>(
      `${API}/espectaculos/${this.espectaculoId}/cola`,
      {},
      { headers: this._headers() }
    ).subscribe({
      next: res => {
        this.loading.set(false);
        this.totalInicial.set(res.usuariosDelante);
        this._procesarRespuesta(res);
        this._startPolling();
      },
      error: err => {
        this.loading.set(false);
        this.error.set(
          err.status === 409
            ? 'La cola no está activa para este espectáculo.'
            : 'Error al unirse a la cola. Inténtalo de nuevo.'
        );
      }
    });
  }

  abandonar(): void {
    this._stopPolling();
    this._stopCountdown();
    this.http.delete(
      `${API}/espectaculos/${this.espectaculoId}/cola`,
      { headers: this._headers() }
    ).subscribe({
      next:  () => this.cerrar.emit(),
      error: () => this.cerrar.emit()
    });
  }

  // ── Polling ───────────────────────────────────────────────
  private _startPolling(): void {
    this._stopPolling();
    this.pollTimer = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private _poll(): void {
    this.http.get<ColaResponse>(
      `${API}/espectaculos/${this.espectaculoId}/cola`,
      { headers: this._headers() }
    ).subscribe({
      next: res => this._procesarRespuesta(res),
      error: ()  => {}
    });
  }

  // ── Procesado de respuesta ────────────────────────────────
  private _procesarRespuesta(res: ColaResponse): void {
    this.estado.set(res);

    if (res.esTuTurno) {
      this._stopPolling();
      this._iniciarCountdown(res.expiraTurnoEn);
    }

    if (res.estadoCola === 'EXPIRADO' || res.estadoCola === 'COMPLETADO') {
      this._stopPolling();
      this._stopCountdown();
    }
  }

  // ── Countdown ─────────────────────────────────────────────
  private _iniciarCountdown(expiraTurnoEn: string | null): void {
    this._stopCountdown();
    if (!expiraTurnoEn) return;

    const expira = new Date(expiraTurnoEn).getTime();

    const tick = () => {
      const diff = Math.max(0, Math.floor((expira - Date.now()) / 1000));
      this.segundosRestantes.set(diff);
      if (diff === 0) this._stopCountdown();
    };

    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }

  private _stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.segundosRestantes.set(null);
  }

  // ── Helpers ───────────────────────────────────────────────
  private _headers(): HttpHeaders {
    const email = this.authSvc.getEmail() ?? '';
    return new HttpHeaders({ 'X-User-Email': email });
  }
}