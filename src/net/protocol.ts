import type { Action, Role } from '../engine/types';
import type { PlayerView } from '../engine/view';

/**
 * Mensajes entre el navegador y el servidor de salas (WebSocket en /ws).
 * El servidor ejecuta el motor de reglas y a cada jugador solo le manda SU vista.
 */

export type RoleChoice = Role | 'azar';

export type ClientMsg =
  | { t: 'create'; role: RoleChoice }
  | { t: 'join'; code: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'lair'; lair: number }
  | { t: 'action'; action: Action };

export type ServerMsg =
  /** Ya estás en la sala (al crearla, unirte o reconectar). Guarda el token para reconectar. */
  | { t: 'joined'; code: string; role: Role; token: string; waitingOpponent: boolean }
  /** Preparación: el pulpo elige la guarida del tiburón. `preview` es el tablero inicial. */
  | { t: 'setup'; preview: PlayerView }
  | { t: 'waitSetup' }
  /** Nuevo estado. cause: 'you' = resultado de tu acción, 'opponent' = jugó el rival, 'sync' = (re)conexión. */
  | { t: 'state'; view: PlayerView; cause: 'you' | 'opponent' | 'sync' }
  | { t: 'opponent'; connected: boolean }
  | { t: 'error'; msg: string };

export const WS_PATH = '/ws';

/** Códigos de sala: 4 letras sin las que se confunden (I, L, O, 0…). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
