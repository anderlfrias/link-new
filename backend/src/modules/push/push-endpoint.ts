/// Servicios push de los navegadores. El backend solo le hace POST a estos
/// hosts: con un endpoint libre, cualquiera elegía a qué URL le pegaba el
/// servidor cada vez que notificaba (un SSRF ciego, útil para tocar servicios
/// HTTPS internos o usar el servidor de reflector). Un navegador nuevo con otro
/// servicio push → agregar su sufijo acá.
///
/// Se descartó "https + rechazar IPs privadas después de resolver el DNS":
/// `web-push` vuelve a resolver el nombre al enviar, así que un DNS rebinding
/// evade el chequeo hecho al suscribir. Con una lista de dominios, el DNS lo
/// controlan sus dueños.
export const PUSH_SERVICE_HOST_SUFFIXES = [
  // Chrome, Opera, Samsung Internet y Edge en Android.
  "fcm.googleapis.com",
  // Endpoints GCM heredados.
  "android.googleapis.com",
  // Firefox (updates.push.services.mozilla.com).
  "push.services.mozilla.com",
  // Edge en Windows (WNS: *.notify.windows.com).
  "notify.windows.com",
  // Safari (web.push.apple.com).
  "push.apple.com",
] as const;

/// Los endpoints reales miden unos cientos de caracteres. Sin tope, el campo
/// podía guardar texto arbitrario.
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

/// `true` si `raw` es un endpoint HTTPS de uno de los servicios push admitidos.
/// Compara el host completo contra cada sufijo, o el host terminado en
/// `.<sufijo>`: `evilfcm.googleapis.com.atacante.example` no pasa.
export function isAllowedPushEndpoint(raw: string): boolean {
  if (raw.length > PUSH_ENDPOINT_MAX_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port !== "" && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
