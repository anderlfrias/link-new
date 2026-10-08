/// Las claves de `localStorage` se llamaban `chat-interno:*` (el nombre anterior de la app) y
/// pasaron a `link:*`. Para que quien ya tenía una sesión abierta no la pierda, ni el tema
/// elegido, el valor guardado bajo la clave vieja se copia a la nueva la primera vez.
///
/// Si `legacyKey` existe, su valor pasa a `key` (salvo que `key` ya tenga uno: no se pisa) y
/// `legacyKey` se borra. No hace nada si `legacyKey` no existe. Nunca lanza: `localStorage` puede
/// no estar disponible (modo privado, datos de sitio bloqueados) y la app tiene que andar igual.
///
/// Esta migración se puede borrar, junto con las constantes `LEGACY_*`, en la primera versión
/// mayor posterior a la que la introdujo: para entonces toda sesión activa ya migró.
export function migrateLegacyKey(legacyKey: string, key: string): void {
  try {
    const legacyValue = window.localStorage.getItem(legacyKey);
    if (legacyValue === null) return;
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, legacyValue);
    }
    window.localStorage.removeItem(legacyKey);
  } catch {
    // Sin localStorage no hay nada que migrar.
  }
}
