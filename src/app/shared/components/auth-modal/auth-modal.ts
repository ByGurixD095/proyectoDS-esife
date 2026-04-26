import {
  Component, inject, signal, output, input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';

export type AuthView = 'login' | 'register' | 'forgot' | 'reset' | 'done';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.html',
  styleUrls: ['./auth-modal.css']
})
export class AuthModalComponent {

  // ── I/O ───────────────────────────────────────────────────
  // Vista inicial: 'login' | 'register'
  initialView = input<AuthView>('login');
  closed      = output<void>();
  loggedIn    = output<void>();

  protected auth = inject(AuthService);

  // ── Vista activa ──────────────────────────────────────────
  view = signal<AuthView>('login');

  // ── Campos login ──────────────────────────────────────────
  loginId  = '';   // email o nombre de usuario
  loginPwd = '';

  // ── Campos registro ───────────────────────────────────────
  regName  = '';
  regEmail = '';
  regPwd1  = '';
  regPwd2  = '';

  // ── Forgot / Reset ────────────────────────────────────────
  forgotEmail  = '';
  resetToken   = '';
  resetPwd     = '';
  resetPwd2    = '';

  // ── Estado UI ─────────────────────────────────────────────
  loading = signal(false);
  error   = signal<string | null>(null);
  success = signal<string | null>(null);

  // ── Visibilidad contraseñas ───────────────────────────────
  showPwd  = signal(false);
  showPwd2 = signal(false);

  // ── Lifecycle ────────────────────────────────────────────
  ngOnInit(): void {
    this.view.set(this.initialView());
  }

  // ── Navegación entre vistas ───────────────────────────────
  goTo(v: AuthView): void {
    this.error.set(null);
    this.success.set(null);
    this.view.set(v);
  }

  close(): void { this.closed.emit(); }

  // ── Login ─────────────────────────────────────────────────
  submitLogin(): void {
    this.error.set(null);
    if (!this.loginId.trim() || !this.loginPwd) {
      this.error.set('Completa todos los campos.');
      return;
    }
    this.loading.set(true);

    this.auth.login(this.loginId.trim(), this.loginPwd).subscribe({
      next: () => {
        this.loading.set(false);
        this.loggedIn.emit();
        this.close();
      },
      error: err => {
        this.loading.set(false);
        this.error.set(
          err.error?.message ??
          err.statusText ??
          'Credenciales incorrectas. Inténtalo de nuevo.'
        );
      }
    });
  }

  // ── Register ──────────────────────────────────────────────
  submitRegister(): void {
    this.error.set(null);

    if (!this.regName.trim() || !this.regEmail.trim() ||
        !this.regPwd1 || !this.regPwd2) {
      this.error.set('Completa todos los campos.');
      return;
    }
    if (this.regPwd1 !== this.regPwd2) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    if (this.regPwd1.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.loading.set(true);

    this.auth.register(
      this.regName.trim(),
      this.regEmail.trim(),
      this.regPwd1,
      this.regPwd2
    ).subscribe({
      next: () => {
        this.loading.set(false);
        // Tras registrarse hacemos login automático
        this.auth.login(this.regEmail.trim(), this.regPwd1).subscribe({
          next: () => {
            this.loggedIn.emit();
            this.close();
          },
          error: () => {
            // Si el auto-login falla, llevamos al login manual
            this.goTo('login');
          }
        });
      },
      error: err => {
        this.loading.set(false);
        this.error.set(
          err.error?.message ??
          err.statusText ??
          'No se pudo crear la cuenta. El nombre o email ya existen.'
        );
      }
    });
  }

  // ── Forgot password ───────────────────────────────────────
  submitForgot(): void {
    this.error.set(null);
    if (!this.forgotEmail.trim()) {
      this.error.set('Introduce tu correo electrónico.');
      return;
    }
    this.loading.set(true);

    this.auth.forgotPassword(this.forgotEmail.trim()).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(
          'Si el correo existe, recibirás un enlace de recuperación en breve.'
        );
      },
      error: () => {
        this.loading.set(false);
        // Respuesta genérica — no revelamos si el email existe
        this.success.set(
          'Si el correo existe, recibirás un enlace de recuperación en breve.'
        );
      }
    });
  }

  // ── Reset password ────────────────────────────────────────
  submitReset(): void {
    this.error.set(null);
    if (!this.resetToken.trim() || !this.resetPwd || !this.resetPwd2) {
      this.error.set('Completa todos los campos.');
      return;
    }
    if (this.resetPwd !== this.resetPwd2) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    if (this.resetPwd.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    this.loading.set(true);

    this.auth.resetPassword(this.resetToken.trim(), this.resetPwd).subscribe({
      next: () => {
        this.loading.set(false);
        this.view.set('done');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(
          err.error?.message ??
          'Token inválido o expirado.'
        );
      }
    });
  }

  // ── Password strength ─────────────────────────────────────
  pwdStrength(pwd: string): 'weak' | 'medium' | 'strong' {
    if (pwd.length < 8)  return 'weak';
    const hasUpper   = /[A-Z]/.test(pwd);
    const hasNumber  = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const score = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    return score >= 2 ? 'strong' : 'medium';
  }

  pwdStrengthLabel(pwd: string): string {
    return { weak: 'Débil', medium: 'Media', strong: 'Fuerte' }[this.pwdStrength(pwd)];
  }
}