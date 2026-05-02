import {
  Component, inject, signal, output, computed, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';
import { EntradaComprada } from '../../../models/event.model';

export type ProfileTab = 'datos' | 'entradas' | 'password';

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-modal.html',
  styleUrls: ['./profile-modal.css']
})
export class ProfileModalComponent implements OnInit {

  closed = output<void>();

  protected auth     = inject(AuthService);
  protected eventSvc = inject(EventService);

  // ── Tabs ──────────────────────────────────────────────────
  activeTab = signal<ProfileTab>('datos');

  // ── Mis entradas ──────────────────────────────────────────
  entradas      = signal<EntradaComprada[]>([]);
  loadingEntradas = signal(false);
  errorEntradas   = signal<string | null>(null);

  // ── Cambiar contraseña ────────────────────────────────────
  pwdActual  = '';
  pwdNueva   = '';
  pwdNueva2  = '';
  showPwd    = signal(false);
  pwdLoading = signal(false);
  pwdError   = signal<string | null>(null);
  pwdSuccess = signal(false);

  // ── Eliminar cuenta ───────────────────────────────────────
  deleteLoading = signal(false);
  deleteConfirm = signal(false);

  // ── Computed ──────────────────────────────────────────────
  email    = computed(() => this.auth.getEmail() ?? '');
  totalGastado = computed(() =>
    this.entradas().reduce((s, e) => s + e.precio, 0)
  );

  ngOnInit(): void {
    this.loadEntradas();
  }

  loadEntradas(): void {
    const token = this.auth.getToken();
    if (!token) return;
    this.loadingEntradas.set(true);
    this.errorEntradas.set(null);
    this.eventSvc.getMisEntradas(token).subscribe({
      next: data => {
        this.entradas.set(data);
        this.loadingEntradas.set(false);
      },
      error: () => {
        this.errorEntradas.set('No se pudieron cargar tus entradas.');
        this.loadingEntradas.set(false);
      }
    });
  }

  submitChangePassword(): void {
    this.pwdError.set(null);
    this.pwdSuccess.set(false);

    if (!this.pwdActual || !this.pwdNueva || !this.pwdNueva2) {
      this.pwdError.set('Completa todos los campos.');
      return;
    }
    if (this.pwdNueva !== this.pwdNueva2) {
      this.pwdError.set('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (this.pwdNueva.length < 8) {
      this.pwdError.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.pwdActual === this.pwdNueva) {
      this.pwdError.set('La nueva contraseña debe ser diferente a la actual.');
      return;
    }

    this.pwdLoading.set(true);
    this.auth.changePassword(this.pwdActual, this.pwdNueva).subscribe({
      next: () => {
        this.pwdLoading.set(false);
        this.pwdSuccess.set(true);
        this.pwdActual = '';
        this.pwdNueva  = '';
        this.pwdNueva2 = '';
      },
      error: err => {
        this.pwdLoading.set(false);
        this.pwdError.set(
          err.error?.message ??
          err.status === 403
            ? 'La contraseña actual es incorrecta.'
            : 'Error al cambiar la contraseña.'
        );
      }
    });
  }

  confirmDelete(): void  { this.deleteConfirm.set(true); }
  cancelDelete(): void   { this.deleteConfirm.set(false); }

  executeDelete(): void {
    this.deleteLoading.set(true);
    this.auth.deleteAccount().subscribe({
      next: () => {
        this.deleteLoading.set(false);
        this.close();
      },
      error: () => this.deleteLoading.set(false)
    });
  }

  fechaLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  close(): void { this.closed.emit(); }
}