import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../../services/event.service';

import { NavbarComponent }      from '../../shared/components/navbar/navbar';
import { SearchBarComponent }   from '../../shared/components/search-bar/search-bar';
import { ViewToggleComponent }  from '../../shared/components/view-toggle/view-toggle';
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

  dateFrom = '';
  dateTo   = '';

  ngOnInit(): void {
    this.eventService.loadAll();
    this.eventService.loadEscenarios();
  }

  onDateFrom(val: string): void {
    this.dateFrom = val;
    this.eventService.setDateRange(this.dateFrom, this.dateTo);
  }

  onDateTo(val: string): void {
    this.dateTo = val;
    this.eventService.setDateRange(this.dateFrom, this.dateTo);
  }

  clearDates(): void {
    this.dateFrom = '';
    this.dateTo   = '';
    this.eventService.clearDateFilter();
  }
}