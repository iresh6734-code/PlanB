import { useState } from 'react';
import { KeyRound, Info } from 'lucide-react';
import { Modal, Spinner } from './components.js';
import { api } from './api.js';
import type { AppState } from '../shared/model.js';
const presets = {
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', outputMode: 'json_schema' as const },
  gemini: { name: 'Google Gemini · API compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', outputMode: 'json_schema' as const },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', outputMode: 'json_object' as const },
  ollama: { name: 'Ollama · Modelo local', baseUrl: 'http://127.0.0.1:11434/v1', outputMode: 'json_schema' as const },
  custom: { name: 'Otra API compatible', baseUrl: '', outputMode: 'json_schema' as const }
};
export function Settings({ state, close, done }: { state: AppState; close: () => void; done: () => Promise<void> }) {
  const previous = state.aiSettings;
  const [preset, setPreset] = useState<keyof typeof presets>((previous?.preset as keyof typeof presets) ?? 'openrouter');
  const [baseUrl, setBaseUrl] = useState(previous?.baseUrl ?? presets.openrouter.baseUrl);
  const [model, setModel] = useState(previous?.model ?? '');
  const [apiKey, setKey] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(previous?.hasKey ?? false);
  const [inputRate, setInputRate] = useState(previous?.inputUsdPerMillion?.toString() ?? '');
  const [outputRate, setOutputRate] = useState(previous?.outputUsdPerMillion?.toString() ?? '');
  const [outputMode, setOutputMode] = useState<'json_schema' | 'json_object'>(previous?.outputMode ?? 'json_schema');
  const [maxOutputTokens, setMaxOutputTokens] = useState(previous?.maxOutputTokens ?? 8192);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const changePreset = (value: keyof typeof presets) => {
    setPreset(value); setBaseUrl(presets[value].baseUrl); setOutputMode(presets[value].outputMode); setKey(''); setHasSavedKey(false); setModel('');
    setInputRate(value === 'ollama' ? '0' : ''); setOutputRate(value === 'ollama' ? '0' : '');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/settings/ai', { method: 'PUT', body: JSON.stringify({
        preset, baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim(),
        inputUsdPerMillion: inputRate === '' ? null : Number(inputRate), outputUsdPerMillion: outputRate === '' ? null : Number(outputRate),
        outputMode, maxOutputTokens
      }) });
      await done(); close();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar la configuración.'); }
    finally { setBusy(false); }
  };
  return <Modal title="Tu proveedor de IA" close={close} wide>
    <form className="settings-form" onSubmit={save}>
      <p className="muted">Configúralo cuando quieras. La aplicación de continuidad seguirá funcionando sin una API.</p>
      <p className="helper">Este mes: {state.usage.usedUsd.toFixed(4)} USD estimados · {state.usage.reservedUsd.toFixed(4)} USD reservados · límite {state.usage.limitUsd} USD. El bloqueo utiliza las tarifas que indiques; no sustituye la factura del proveedor.</p>
      <div className="settings-grid">
        <label className="field"><span>Proveedor</span><select value={preset} onChange={event => changePreset(event.target.value as keyof typeof presets)}>
          {Object.entries(presets).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></label>
        <label className="field"><span>Modelo</span><input value={model} onChange={event => setModel(event.target.value)} placeholder="Identificador de tu modelo" required autoComplete="off" /></label>
      </div>
      <label className="field"><span>Dirección de la API</span><input type="url" value={baseUrl} onChange={event => { setBaseUrl(event.target.value); setHasSavedKey(false); setKey(''); }} required autoComplete="off" /></label>
      <label className="field"><span><KeyRound size={15} /> Clave API</span><input type="password" value={apiKey} onChange={event => setKey(event.target.value)}
        placeholder={hasSavedKey ? 'Clave guardada · deja vacío para conservarla' : preset === 'ollama' ? 'No necesaria para el modelo local' : 'Tu clave de este proveedor'}
        autoComplete="new-password" required={!hasSavedKey && preset !== 'ollama'} /></label>
      <div className="settings-grid">
        <label className="field"><span>Entrada · USD por millón de tokens</span><input type="number" min="0" max="10000" step="any" value={inputRate} onChange={event => setInputRate(event.target.value)} placeholder="Tarifa del modelo" /></label>
        <label className="field"><span>Salida · USD por millón de tokens</span><input type="number" min="0" max="10000" step="any" value={outputRate} onChange={event => setOutputRate(event.target.value)} placeholder="Tarifa del modelo" /></label>
      </div>
      <p className="helper"><Info size={15} /> El límite local de 25 USD se calcula con estas tarifas. Indica 0 si tu modelo es gratuito y comprueba también el límite de tu proveedor.</p>
      <div className="settings-grid">
        <label className="field"><span>Formato de salida</span><select value={outputMode} onChange={event => setOutputMode(event.target.value as typeof outputMode)}>
          <option value="json_schema">JSON Schema · si el modelo lo admite</option><option value="json_object">JSON · validado por Plan B</option></select></label>
        <label className="field"><span>Máximo de tokens de salida</span><input type="number" min="1024" max="24000" step="1" value={maxOutputTokens} onChange={event => setMaxOutputTokens(Number(event.target.value))} /></label>
      </div>
      <p className="helper">La clave se guarda en este ordenador y se envía únicamente a la dirección que indiques. No se incluye en las exportaciones.</p>
      {error ? <p className="error-box" role="alert">{error}</p> : null}
      <footer className="modal-footer"><button type="button" className="button secondary" onClick={close}>Ahora no</button>
        <button className="button primary" disabled={busy}>{busy ? <Spinner text="Guardando…" /> : 'Guardar configuración'}</button></footer>
    </form>
  </Modal>;
}
