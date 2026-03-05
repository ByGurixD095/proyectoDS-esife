import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../../services/event.service';

// IMPORTA LAS CLASES (Asegúrate de que los nombres coincidan con el "export class ...")
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { SearchBarComponent } from '../../shared/components/search-bar/search-bar';
import { ViewToggleComponent } from '../../shared/components/view-toggle/view-toggle';
import { EventTicketComponent } from '../../shared/components/event-ticket/event-ticket';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    NavbarComponent,
    SearchBarComponent,
    ViewToggleComponent,
    EventTicketComponent,
  ],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit { 
  protected eventService = inject(EventService);
  showLoginModal = signal(false);

  ngOnInit(): void {
    this.eventService.loadAll();
    this.eventService.loadEscenarios();
  }

  openLogin(): void  { this.showLoginModal.set(true); }
  closeLogin(): void { this.showLoginModal.set(false); }
}