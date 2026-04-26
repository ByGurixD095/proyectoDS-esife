import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { AuthModalComponent, AuthView } from '../auth-modal/auth-modal';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, AuthModalComponent],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class NavbarComponent {
  protected auth = inject(AuthService);

  loginClicked = output<void>();

  showModal    = signal(false);
  modalView    = signal<AuthView>('login');

  openLogin(): void {
    this.modalView.set('login');
    this.showModal.set(true);
    this.loginClicked.emit();
  }

  openRegister(): void {
    this.modalView.set('register');
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }
}