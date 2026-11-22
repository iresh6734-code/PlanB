// Búsqueda de texto tolerante (misión maestra, 22/11/2026). Lógica pura y compartida.
// Quien busca en un CRM en español escribe sin tildes ni mayúsculas: «nunez» tiene que encontrar «Núñez» y «jose» a «José».
// Se quitan los diacríticos (también la ñ → n), se pasa a minúsculas en español y se juntan los espacios. Las palabras de la
// consulta pueden ir en cualquier orden: «ana revisar» encuentra «Revisar los detalles · Ana».

/** Texto plegado para comparar: sin diacríticos, en minúsculas y con los espacios juntos. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-ES').replace(/\s+/gu, ' ').trim();
}

/** ¿Contiene `haystack` todas las palabras de `query`, sin importar tildes, mayúsculas ni orden? Consulta vacía = sí. */
export function textMatches(haystack: string, query: string): boolean {
  const words = foldText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const target = foldText(haystack);
  return words.every(word => target.includes(word));
}
