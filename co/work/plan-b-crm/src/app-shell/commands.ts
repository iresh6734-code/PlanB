/** Una orden de la paleta: lo mismo que ya hace un botón o un enlace del menú. */
export type Command = { id: string; label: string; hint?: string; group: string; run: () => void };

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Órdenes cuyo nombre o grupo contienen todas las palabras escritas, sin distinguir acentos ni mayúsculas. */
export const matchCommands = (commands: Command[], query: string) => { const words = plain(query).split(/\s+/).filter(Boolean); return commands.filter(command => words.every(word => plain(command.label + ' ' + command.group).includes(word))); };
