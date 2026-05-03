import { Injectable } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler,
  HttpEvent, HttpResponse
} from '@angular/common/http';
import { Observable, of, delay } from 'rxjs';

// ══ ÚNICO VALOR QUE PUEDES AJUSTAR ════════════════════════════
const POSICION_INICIAL = 5;
// ══════════════════════════════════════════════════════════════

interface ColaState {
  posicion: number;
  estado: 'ESPERANDO' | 'ACTIVO';
  turnoActivadoEn: string | null;
}

// Un estado por espectaculoId — así funciona con cualquier espectáculo
const estados = new Map<number, ColaState>();

function getState(id: number): ColaState {
  if (!estados.has(id)) {
    estados.set(id, {
      posicion:        POSICION_INICIAL,
      estado:          'ESPERANDO',
      turnoActivadoEn: null,
    });
  }
  return estados.get(id)!;
}

function resetState(id: number): void {
  estados.set(id, {
    posicion:        POSICION_INICIAL,
    estado:          'ESPERANDO',
    turnoActivadoEn: null,
  });
}

function avanzar(id: number): void {
  const s = getState(id);
  if (s.estado !== 'ESPERANDO') return;
  s.posicion = Math.max(1, s.posicion - 1);
  if (s.posicion === 1) {
    s.estado          = 'ACTIVO';
    s.turnoActivadoEn = new Date().toISOString();
  }
}

function buildBody(id: number): object {
  const s         = getState(id);
  const esTuTurno = s.estado === 'ACTIVO';
  const expira    = esTuTurno && s.turnoActivadoEn
    ? new Date(new Date(s.turnoActivadoEn).getTime() + 5 * 60 * 1000).toISOString()
    : null;

  return {
    colaId:          99,
    posicion:        s.posicion,
    usuariosDelante: esTuTurno ? 0 : s.posicion - 1,
    estadoCola:      s.estado,
    esTuTurno,
    expiraTurnoEn:   expira,
  };
}

// Extrae el ID del espectáculo de la URL: /espectaculos/42/cola
function extraerEspectaculoId(url: string): number | null {
  const match = url.match(/\/espectaculos\/(\d+)\/cola/);
  return match ? Number(match[1]) : null;
}

@Injectable()
export class ColaMockInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    const espectaculoId = extraerEspectaculoId(req.url);

    // Si la URL no es de cola, deja pasar la petición al backend real
    if (espectaculoId === null) return next.handle(req);

    // POST → el usuario se une: inicializa o resetea el estado de ese espectáculo
    if (req.method === 'POST') {
      resetState(espectaculoId);
      return of(new HttpResponse({ status: 200, body: buildBody(espectaculoId) }))
        .pipe(delay(350));
    }

    // GET → polling: avanza un puesto y devuelve el estado actual
    if (req.method === 'GET') {
      avanzar(espectaculoId);
      return of(new HttpResponse({ status: 200, body: buildBody(espectaculoId) }))
        .pipe(delay(350));
    }

    // DELETE → el usuario abandona: limpia el estado
    if (req.method === 'DELETE') {
      resetState(espectaculoId);
      return of(new HttpResponse({
        status: 200,
        body: {
          colaId: null, posicion: null,
          usuariosDelante: 0, estadoCola: 'ABANDONADO',
          esTuTurno: false, expiraTurnoEn: null
        }
      })).pipe(delay(200));
    }

    return next.handle(req);
  }
}