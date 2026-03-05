import { Component, inject, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class NavbarComponent{
  protected auth = inject(AuthService);
  loginClicked = output<void>();

  onLoginClick(): void {
    this.loginClicked.emit();
  }
}
