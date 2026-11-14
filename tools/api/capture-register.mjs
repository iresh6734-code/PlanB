// Activa el gancho del inventario de la API. Se carga con --import solo en los procesos que lanza inventory.mjs.
import { registerHooks } from 'node:module';
import { resolve } from './capture-hooks.mjs';
registerHooks({ resolve });
