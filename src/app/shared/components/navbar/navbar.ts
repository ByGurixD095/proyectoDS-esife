import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService }  from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';
import { AuthModalComponent, AuthView } from '../auth-modal/auth-modal';
import { ProfileModalComponent } from '../profile-modal/profile-modal';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, AuthModalComponent, ProfileModalComponent],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class NavbarComponent {
  protected auth     = inject(AuthService);
  protected eventSvc = inject(EventService);
  private   router   = inject(Router);

  // ── Auth modal ────────────────────────────────────────────
  showModal = signal(false);
  modalView = signal<AuthView>('login');

  // ── Cart dropdown ─────────────────────────────────────────
  showCart = signal(false);

  showProfile = signal(false);

  get cartCount(): number {
    return this.eventSvc.cartIds().size;
  }


  // Agrupa las entradas del carrito por espectáculo
  // para poder mostrar el nombre y construir el enlace
  cartEspectaculoId = computed((): number | null => {
    const entradas = this.eventSvc.espectaculos();
    // Buscamos el espectáculo de la primera entrada en carrito
    // (todas las entradas prereservadas son del mismo espectáculo)
    const cartIds = this.eventSvc.cartIds();
    if (!cartIds.size) return null;

    // Intentamos encontrarlo en los espectáculos cargados
    // Si no, lo sacamos de sessionStorage via el token
    // El espectaculoId está en cada entrada — lo exponemos desde eventSvc
    return this.eventSvc.getCartEspectaculoId();
  });

  cartEspectaculoNombre = computed((): string => {
    const id = this.cartEspectaculoId();
    if (!id) return '';
    const esp = this.eventSvc.espectaculos().find(e => e.id === id);
    return esp?.artista ?? 'Espectáculo';
  });

  // Líneas del carrito para mostrar en el dropdown
  cartLines = computed(() => {
    const id = this.cartEspectaculoId();
    if (!id) return [];
    // Buscamos las entradas cargadas en eventSvc que estén en el carrito
    // Estas solo estarán disponibles si el usuario está en la página de detalle
    // En home, mostramos solo el conteo
    return this.eventSvc.getCartEntradas();
  });

  totalPrice = computed(() =>
    this.cartLines().reduce((s, e) => s + e.precio, 0)
  );

  // ── Cerrar al hacer click fuera ───────────────────────────
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.navbar__cart-wrap')) {
      this.showCart.set(false);
    }
  }

  toggleCart(e: MouseEvent): void {
    e.stopPropagation();
    this.showCart.update(v => !v);
  }

  goToEspectaculo(): void {
    const id = this.cartEspectaculoId();
    if (id) {
      this.showCart.set(false);
      this.router.navigate(['/espectaculos', id]);
    }
  }

  // ── Auth ──────────────────────────────────────────────────
  openLogin(): void {
    this.modalView.set('login');
    this.showModal.set(true);
  }

  openRegister(): void {
    this.modalView.set('register');
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }
  openProfile(): void  { this.showProfile.set(true); }
  closeProfile(): void { this.showProfile.set(false); }
}