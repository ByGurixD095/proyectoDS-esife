import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../../../services/event.service';
import { ViewMode } from '../../../models/event.model';

@Component({
  selector: 'app-view-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './view-toggle.html',
  styleUrls: ['./view-toggle.css']
})
export class ViewToggleComponent {
  protected eventService = inject(EventService);

  setMode(mode: ViewMode): void {
    this.eventService.setViewMode(mode);
  }
}
