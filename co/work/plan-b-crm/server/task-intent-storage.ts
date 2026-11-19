import type { Store } from './store.js';
import { KEY_PREFIX, type IntentStorage, type StorageWrite, type StoredEntry } from '../shared/task-intent-journal.js';

// Adaptador del cuaderno de intenciones sobre la API PÚBLICA de Store (unidad 208). No edita store.ts ni crea tablas: cada registro es una fila de `meta` bajo el
// prefijo `task-intent:`. Store ya sella cada valor de `meta` con la clave local cuando la base es un archivo, así que los datos de cliente del patch no quedan en claro.
// Precedente: server/rescue-room-journal.ts guarda intenciones con idempotencia sobre las mismas primitivas.
//
// Límites declarados:
//  · la escritura usa una transacción de SQLite (`BEGIN IMMEDIATE`): comparar el valor actual y escribir es atómico frente a otros escritores de la MISMA base. La exclusión entre
//    PROCESOS sobre la misma carpeta la da el candado de instancia de la demo, no este módulo; la prueba de dos procesos queda para el montaje acordado con Codex;
//  · el valor sellado no es resistente a manipulación por quien tenga la clave local;
//  · NO se monta en ninguna ruta HTTP ni se usa desde la App en esta unidad.
const readRaw = (store: Store, key: string): { raw: string | null; unreadable: boolean } => {
  try { const value = store.get<unknown>(key, null); return typeof value === 'string' ? { raw: value, unreadable: false } : { raw: null, unreadable: value !== null }; }
  catch { return { raw: null, unreadable: true }; }   // bytes ilegibles (cifrado dañado o clave distinta): se conserva sin tocar
};
export function storeIntentStorage(store: Store): IntentStorage {
  const own = (key: string) => key.startsWith(KEY_PREFIX) && key.length > KEY_PREFIX.length && key.length <= 200;
  return {
    async readAll(): Promise<StoredEntry[]> {
      const rows = store.db.prepare("SELECT key FROM meta WHERE substr(key,1,?)=? ORDER BY key").all(KEY_PREFIX.length, KEY_PREFIX) as { key: string }[];
      return rows.map(row => { const { raw, unreadable } = readRaw(store, row.key); return unreadable ? { key: row.key, raw: null, unreadable: true } : { key: row.key, raw }; });
    },
    async write(key, raw, expected, options): Promise<StorageWrite> {
      if (!own(key)) return 'failed';
      try {
        return store.transaction((): StorageWrite => {
          const current = readRaw(store, key);
          if (current.unreadable) return 'conflict';          // nunca se sobrescribe lo ilegible
          if (current.raw !== expected) return 'conflict';
          // Tope de altas EN el punto de escritura (misma transacción): dos altas simultáneas no pueden ocupar el último hueco las dos.
          if (expected === null && options?.maxEntries !== undefined) {
            const { n } = store.db.prepare('SELECT COUNT(*) AS n FROM meta WHERE substr(key,1,?)=?').get(KEY_PREFIX.length, KEY_PREFIX) as { n: number };
            if (n >= options.maxEntries) return 'full';
          }
          store.set(key, raw); return 'ok';
        });
      } catch { return 'failed'; }
    },
    async remove(key, expected): Promise<StorageWrite> {
      if (!own(key)) return 'failed';
      try {
        return store.transaction((): StorageWrite => {
          const current = readRaw(store, key);
          if (current.unreadable || current.raw !== expected) return 'conflict';
          store.db.prepare('DELETE FROM meta WHERE key=?').run(key); return 'ok';
        });
      } catch { return 'failed'; }
    },
  };
}
