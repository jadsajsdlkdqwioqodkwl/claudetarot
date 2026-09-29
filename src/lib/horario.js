/**
 * Horario permitido para los mensajes programados: nada sale entre las 23:30
 * y las 06:00 (hora de Lima). Configurable con HORARIO_ENVIO="06:00-23:30".
 *
 * Si un mensaje cae en ese hueco:
 *   1. se corre a las 06:00 siguientes, si a esa hora la ventana de 24 h del
 *      cliente sigue abierta;
 *   2. si no, se adelanta a las 23:29 de esa noche (lo último permitido antes
 *      del corte), si todavía no pasó;
 *   3. si tampoco, ya no hay hora posible: se cancela.
 * Las plantillas (envío masivo) no dependen de la ventana: solo se corren a
 * las 06:00.
 */

const LIMA_MS = 5 * 3600 * 1000;
const MIN = 60 * 1000;

function leerHorario(texto) {
  const m = String(texto || "").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  const [inicio, fin] = m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [6 * 60, 23 * 60 + 30];
  return { inicio, fin };
}

/** Minuto del día en Lima (0–1439). */
const minutoLima = (ms) => {
  const d = new Date(ms - LIMA_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export function enSilencio(ms, horario) {
  const { inicio, fin } = leerHorario(horario);
  const m = minutoLima(ms);
  return m >= fin || m < inicio;
}

/** La próxima hora de inicio (06:00 Lima) después de `ms`. */
function proximoInicio(ms, inicio) {
  const d = new Date(ms - LIMA_MS);
  let objetivo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + inicio * MIN + LIMA_MS;
  if (objetivo <= ms) objetivo += 24 * 3600 * 1000;
  return objetivo;
}

/** El último minuto permitido (23:29) antes del silencio en el que cae `ms`. */
function ultimoAntes(ms, fin) {
  const d = new Date(ms - LIMA_MS);
  let corte = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + fin * MIN + LIMA_MS;
  if (corte > ms) corte -= 24 * 3600 * 1000; // ms es de madrugada: el corte fue la noche anterior
  return corte - MIN;
}

/**
 * La hora a la que debe salir un mensaje programado para `envioMs`.
 * @param {number|null} venceMs  cuándo se cierra la ventana de 24 h (null = plantilla, no vence)
 * @returns {number|null} la misma hora si está permitida, la nueva, o null si ya no hay hora posible
 */
export function ajustarAlHorario(envioMs, venceMs, ahoraMs = Date.now(), horario) {
  if (!enSilencio(envioMs, horario)) return envioMs;
  const { inicio, fin } = leerHorario(horario);
  const manana = proximoInicio(envioMs, inicio);
  if (venceMs == null || manana <= venceMs - 5 * MIN) return manana;
  const antes = ultimoAntes(envioMs, fin);
  if (antes > ahoraMs + MIN && !enSilencio(antes, horario)) return antes;
  return null;
}
