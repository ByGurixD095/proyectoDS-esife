import { Component } from '@angular/core';
import { HomeComponent } from './features/home/home';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HomeComponent],
  template: `<app-home></app-home>`
})
export class AppComponent {}
