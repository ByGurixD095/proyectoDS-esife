// ── Escenario ────────────────────────────────────────────────
// Matches: DtoEscenario { id, nombre, descripcion }
export interface Escenario {
  id: number;
  nombre: string;
  descripcion: string;
}

// ── Espectaculo ───────────────────────────────────────────────
// Matches: DtoEspectaculo { id, artista, fecha (LocalDateTime), escenario (string nombre) }
export interface Espectaculo {
  id: number;
  artista: string;
  fecha: string;          // ISO-8601: "2026-03-14T21:00:00"
  escenario: string;      // nombre del escenario (ya mapeado en backend)
}

// ── Entrada base ──────────────────────────────────────────────
// Matches: DtoEntrada { id, espectaculoId, precio (BigDecimal), tipo }
export interface EntradaBase {
  id: number;
  espectaculoId: number;
  precio: number;         // BigDecimal -> number (euros, 2 decimales)
  tipo: 'ZONA' | 'PRECISA';
}

// Matches: DtoEntradaDeZona extends DtoEntrada { zona: number }
export interface EntradaDeZona extends EntradaBase {
  tipo: 'ZONA';
  zona: number;
}

// Matches: DtoEntradaPrecisa extends DtoEntrada { fila, columna, planta }
export interface EntradaPrecisa extends EntradaBase {
  tipo: 'PRECISA';
  fila: number;
  columna: number;
  planta: number;
}

export type Entrada = EntradaDeZona | EntradaPrecisa;

// ── EntradaInfo ───────────────────────────────────────────────
// Matches: DtoEntradaInfo { total, libres, reservadas, vendidas }
export interface EntradaInfo {
  total: number;
  libres: number;
  reservadas: number;
  vendidas: number;
}

// ── Reserva ───────────────────────────────────────────────────
// Matches: ReservaResponse { entradaId, token, expiraEn }
export interface ReservaResponse {
  entradaId: number;
  token: string;
  expiraEn: string;
}

// ── EntradaComprada ───────────────────────────────────────
export interface EntradaComprada {
  id: number;
  tipo: 'ZONA' | 'PRECISA';
  precio: number;
  espectaculoId: number;
  artista: string;
  fechaEspectaculo: string;
  escenario: string;
  planta?: number;
  fila?: number;
  columna?: number;
  zona?: number;
}

// ── Cola ──────────────────────────────────────────────────────
// Matches: ColaResponse { colaId, posicion, usuariosDelante, estadoCola }
export interface ColaResponse {
  colaId: number;
  posicion: number;
  usuariosDelante: number;
  estadoCola: string;
}

// ── Compra ────────────────────────────────────────────────────
// Matches: CompraResponse { mensaje, correoEnviado }
export interface CompraResponse {
  mensaje: string;
  correoEnviado: string;
}

// ── UI helpers ────────────────────────────────────────────────
export type ViewMode = 'by-event' | 'by-venue';

export interface EspectaculosByVenue {
  escenarioNombre: string;
  espectaculos: Espectaculo[];
}
