// cola-mock.interceptor.ts

import { Injectable } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler,
  HttpEvent
} from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';

const API = 'http://localhost:8080';

// ── Configuración ─────────────────────────────────────────────
const FANTASMAS = 20; 
// ─────────────────────────────────────────────────────────────

const emailFantasma = (i: number, espId: number) =>
  `fantasma${i}_esp${espId}@mock.internal`;

interface MockState {
  fantasmasRestantes: string[];
  eliminando: boolean;
}

const states = new Map<number, MockState>();

function getState(espId: number): MockState {
  if (!states.has(espId)) {
    states.set(espId, { fantasmasRestantes: [], eliminando: false });
  }
  return states.get(espId)!;
}

function resetState(espId: number): void {
  states.delete(espId);
}

@Injectable()
export class ColaMockInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    const match = req.url.match(/\/espectaculos\/(\d+)\/cola$/);
    if (!match) return next.handle(req);

    const espId = Number(match[1]);

    // ── POST — unirse ─────────────────────────────────────────
    if (req.method === 'POST') {
      resetState(espId);
      const state = getState(espId);
      state.fantasmasRestantes = Array.from(
        { length: FANTASMAS }, (_, i) => emailFantasma(i + 1, espId)
      );

      // Extraemos el email del usuario real desde la cabecera de la petición
      const emailUsuario = req.headers.get('X-User-Email') ?? '';

      return from(this._prepararCola(emailUsuario, state.fantasmasRestantes, espId)).pipe(
        switchMap(() => next.handle(req))
      );
    }

    // ── GET — polling ─────────────────────────────────────────
    if (req.method === 'GET') {
      const state = getState(espId);

      if (state.fantasmasRestantes.length > 0 && !state.eliminando) {
        state.eliminando = true;
        const email = state.fantasmasRestantes.shift()!;
        return from(this._eliminarFantasma(email, espId)).pipe(
          switchMap(() => {
            state.eliminando = false;
            return next.handle(req);
          })
        );
      }

      return next.handle(req);
    }

    // ── DELETE — abandonar ────────────────────────────────────
    if (req.method === 'DELETE') {
      const state = getState(espId);
      const restantes = [...state.fantasmasRestantes];
      resetState(espId);
      restantes.forEach(email => this._eliminarFantasma(email, espId));
      return next.handle(req);
    }

    return next.handle(req);
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * 1. Borra el registro previo del usuario real (puede estar COMPLETADO/EXPIRADO).
   * 2. Inserta los fantasmas en la cola real.
   * El DELETE del usuario puede fallar (404 si no existía) — se ignora.
   */
  private async _prepararCola(emailUsuario: string, fantasmas: string[], espId: number): Promise<void> {
    // Paso 1: limpiar registro anterior del usuario real
    if (emailUsuario) {
      try {
        await fetch(`${API}/espectaculos/${espId}/cola`, {
          method: 'DELETE',
          headers: { 'X-User-Email': emailUsuario }
        });
      } catch (_) { /* ignorar */ }
    }

    // Paso 2: insertar fantasmas
    for (const email of fantasmas) {
      try {
        await fetch(`${API}/espectaculos/${espId}/cola`, {
          method: 'POST',
          headers: { 'X-User-Email': email }
        });
      } catch (_) { /* ignorar */ }
    }
  }

  private async _eliminarFantasma(email: string, espId: number): Promise<void> {
    try {
      await fetch(`${API}/espectaculos/${espId}/cola`, {
        method: 'DELETE',
        headers: { 'X-User-Email': email }
      });
    } catch (_) { /* ignorar */ }
  }
}