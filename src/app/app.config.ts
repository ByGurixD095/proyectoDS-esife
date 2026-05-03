import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS          
} from '@angular/common/http';
import { routes } from './app.routes';
import { ColaMockInterceptor } from './shared/interceptors/cola-mock.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    {
      provide:  HTTP_INTERCEPTORS,
      useClass: ColaMockInterceptor,
      multi:    true
    }
  ]
};