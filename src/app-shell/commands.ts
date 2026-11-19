/** Una orden de la paleta: lo mismo que ya hace un botón o un enlace del menú. */
export type Command = { id: string; label: string; hint?: string; group: string; run: () => void };

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Órdenes cuyo nombre o grupo contienen todas las palabras escritas, sin distinguir acentos ni mayúsculas. */
export const matchCommands = (commands: Command[], query: string) => { const words = plain(query).split(/\s+/).filter(Boolean); return commands.filter(command => words.every(word => plain(command.label + ' ' + command.group).includes(word))); };

export const RECENT_LIMIT = 4;
/** Lista de recientes tras ejecutar `id`: primero, sin repetir, como mucho RECENT_LIMIT. Los registros no se recuerdan. */
export const rememberCommand = (recent: string[], id: string) => id.startsWith('rec-') ? recent : [id, ...recent.filter(item => item !== id)].slice(0, RECENT_LIMIT);
/** Con el buscador vacío, las órdenes usadas hace poco van primero (grupo «Recientes»); las que ya no existen se ignoran. */
export const withRecent = (commands: Command[], recent: string[], query: string): Command[] => {
  if (query.trim()) return commands;
  const first = recent.map(id => commands.find(command => command.id === id)).filter((command): command is Command => !!command);
  return [...first.map(command => ({ ...command, group: 'Recientes', hint: command.hint ?? command.group })), ...commands.filter(command => !recent.includes(command.id))];
};
