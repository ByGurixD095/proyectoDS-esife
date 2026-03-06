import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'espectaculos/:id',
    loadComponent: () =>
      import('./features/espectaculo-detail/espectaculo-detail').then(
        m => m.EspectaculoDetailComponent
      )
  },
  { path: '**', redirectTo: '' }
];