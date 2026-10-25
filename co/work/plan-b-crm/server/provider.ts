import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { z } from 'zod';
import { AppError } from './store.js';
import { dirname } from 'node:path';
import { localKey, open, seal } from './crypto.js';

export const AiConfigSchema = z.object({
  preset: z.enum(['openrouter', 'gemini', 'deepseek', 'ollama', 'custom']),
  baseUrl: z.string().url(),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(4096),
  inputUsdPerMillion: z.number().min(0).max(10000).nullable(),
  outputUsdPerMillion: z.number().min(0).max(10000).nullable(),
  outputMode: z.enum(['json_schema', 'json_object']),
  maxOutputTokens: z.number().int().min(1024).max(24000)
}).strict();
export type AiConfig = z.infer<typeof AiConfigSchema>;
export function validateAiDestination(config: AiConfig) {
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.search || url.hash) throw new AppError(422, 'La dirección de la API no puede incluir credenciales, parámetros ni fragmentos.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && config.preset === 'ollama')) {
    throw new AppError(422, 'Usa HTTPS para proveedores externos. HTTP solo está disponible para Ollama local.');
  }
  if (config.preset === 'ollama' && !local) throw new AppError(422, 'El preset local solo permite direcciones de este ordenador.');
  const expected: Record<string, string> = {
    openrouter: 'openrouter.ai', gemini: 'generativelanguage.googleapis.com', deepseek: 'api.deepseek.com'
  };
  if (expected[config.preset] && expected[config.preset] !== url.hostname) throw new AppError(422, 'La dirección no corresponde al proveedor seleccionado.');
  if (!local && !config.apiKey) throw new AppError(422, 'Introduce la clave de este proveedor.');
}
export class ProviderSettings {
  constructor(public filename: string) {}
  private key() { return localKey(dirname(this.filename)); }
  read(): AiConfig | null {
    if (!existsSync(this.filename)) return null;
    try {
      const raw = readFileSync(this.filename,'utf8');
      const config = AiConfigSchema.parse(JSON.parse(raw.startsWith('enc1:') ? open(raw,this.key()) : raw));
      validateAiDestination(config);
      if(!raw.startsWith('enc1:'))this.write(config);
      return config;
    }
    catch { return null; }
  }
  public() {
    const config = this.read();
    if (!config) return null;
    const { apiKey, ...rest } = config;
    return { ...rest, hasKey: !!apiKey };
  }
  save(raw: unknown) {
    const parsed = AiConfigSchema.safeParse(raw);
    if (!parsed.success) throw new AppError(422, 'Revisa la configuración del proveedor.', parsed.error.flatten());
    const config = parsed.data, previous = this.read();
    if (!config.apiKey && previous && config.baseUrl.replace(/\/$/, '') === previous.baseUrl.replace(/\/$/, '') && config.preset === previous.preset) {
      config.apiKey = previous.apiKey;
    }
    validateAiDestination(config);
    this.write(config);
    return this.public();
  }
  private write(config:AiConfig) {
    const temp = this.filename + '.tmp';
    writeFileSync(temp, seal(JSON.stringify(config),this.key()), { mode: 0o600 });
    renameSync(temp, this.filename);
    try { chmodSync(this.filename, 0o600); } catch { /* Windows permissions are inherited. */ }
  }
}
