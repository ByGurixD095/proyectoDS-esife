import {
  Component, input, inject, OnInit, signal, computed, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Espectaculo, EntradaInfo } from '../../../models/event.model';
import { EventService } from '../../../services/event.service';

@Component({
  selector: 'app-event-ticket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './event-ticket.html',
  styleUrls: ['./event-ticket.css']
})
export class EventTicketComponent implements OnInit {
  espectaculo = input.required<Espectaculo>();

  private eventService = inject(EventService);
  private router       = inject(Router);

  info      = signal<EntradaInfo | null>(null);
  infoError = signal(false);

  @HostListener('click')
  navigate(): void {
    this.router.navigate(['/espectaculos', this.espectaculo().id]);
  }

  // ── Computed helpers ──────────────────────────────────────

  hora = computed(() => {
    const t = this.espectaculo().fecha;
    return t ? t.substring(11, 16) : '';
  });

  fechaLabel = computed(() => {
    const d = new Date(this.espectaculo().fecha);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).toUpperCase();
  });

  initials = computed(() => {
    return this.espectaculo().artista
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(w => w[0].toUpperCase())
      .join('');
  });

  accentColor = computed((): string => {
    const palette = [
      '#e07b39', '#6c5ce7', '#00b894', '#e84393',
      '#0984e3', '#636e72', '#fd79a8', '#a29bfe'
    ];
    let hash = 0;
    for (const c of this.espectaculo().artista) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return palette[hash % palette.length];
  });

  statusLabel = computed((): string => {
    const i = this.info();
    if (!i) return 'Cargando…';
    if (i.libres === 0) return 'Agotado';
    if (i.libres < i.total * 0.1) return 'Últimas entradas';
    return 'Disponible';
  });

  statusClass = computed((): string => {
    const i = this.info();
    if (!i) return 'status--loading';
    if (i.libres === 0) return 'status--sold-out';
    if (i.libres < i.total * 0.1) return 'status--partial';
    return 'status--available';
  });

  ocupacionPct = computed((): number => {
    const i = this.info();
    if (!i || i.total === 0) return 0;
    return Math.round(((i.total - i.libres) / i.total) * 100);
  });

  ngOnInit(): void {
    this.eventService.getEntradaInfo(this.espectaculo().id).subscribe({
      next:  data => this.info.set(data),
      error: ()   => this.infoError.set(true)
    });
  }
}