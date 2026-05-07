// cola-mock.interceptor.ts

import { Injectable } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler,
  HttpEvent, HttpResponse
} from '@angular/common/http';
import { Observable, of, delay } from 'rxjs';

// ══ Cuántos polls hasta activar el turno ══════════════════════
const POLLS_HASTA_TURNO = 4;
// ══════════════════════════════════════════════════════════════

interface MockPollState {
  pollCount: number;
  activo: boolean;
  activadoEn: string | null;
}

const pollStates = new Map<number, MockPollState>();

function getState(id: number): MockPollState {
  if (!pollStates.has(id)) {
    pollStates.set(id, { pollCount: 0, activo: false, activadoEn: null });
  }
  return pollStates.get(id)!;
}

function resetState(id: number): void {
  pollStates.delete(id);
}

function buildBody(id: number): object {
  const s = getState(id);
  const posicion = Math.max(1, POLLS_HASTA_TURNO - s.pollCount + 1);
  const delante = Math.max(0, posicion - 1);
  const esTuTurno = s.activo;
  const expira = esTuTurno && s.activadoEn
    ? new Date(new Date(s.activadoEn).getTime() + 5 * 60 * 1000).toISOString()
    : null;

  return {
    colaId:          99,
    posicion:        esTuTurno ? 1 : posicion,
    usuariosDelante: esTuTurno ? 0 : delante,
    estadoCola:      esTuTurno ? 'ACTIVO' : 'ESPERANDO',
    esTuTurno,
    expiraTurnoEn:   expira,
  };
}

function extraerEspectaculoId(url: string): number | null {
  const match = url.match(/\/espectaculos\/(\d+)\/cola/);
  return match ? Number(match[1]) : null;
}

@Injectable()
export class ColaMockInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    const espectaculoId = extraerEspectaculoId(req.url);

    if (espectaculoId === null) return next.handle(req);

    // POST → deja pasar al backend real para que guarde en cola_virtual
    // Solo reseteamos el estado del mock local
    if (req.method === 'POST') {
      resetState(espectaculoId);
      return next.handle(req);  // ← pasa al backend
    }

    // DELETE → deja pasar al backend real para limpiar cola_virtual
    if (req.method === 'DELETE') {
      resetState(espectaculoId);
      return next.handle(req);  // ← pasa al backend
    }

    // GET → mock que avanza la posición rápidamente para la demo
    if (req.method === 'GET') {
      const s = getState(espectaculoId);
      if (!s.activo) {
        s.pollCount++;
        if (s.pollCount >= POLLS_HASTA_TURNO) {
          s.activo = true;
          s.activadoEn = new Date().toISOString();
        }
      }
      return of(new HttpResponse({ status: 200, body: buildBody(espectaculoId) }))
        .pipe(delay(350));
    }

    return next.handle(req);
  }
}