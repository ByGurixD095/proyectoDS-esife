import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../../../services/event.service';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-bar.html',
  styleUrls: ['./search-bar.css']
})
export class SearchBarComponent {
  private eventService = inject(EventService);

  query = signal('');
  private debounceTimer: any;

  onInput(value: string): void {
    this.query.set(value);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.eventService.setSearchQuery(value.trim());
    }, 350);
  }

  onClear(): void {
    this.query.set('');
    clearTimeout(this.debounceTimer);
    this.eventService.setSearchQuery('');
  }
}
