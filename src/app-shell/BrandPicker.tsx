import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, Stamp, Trash2 } from 'lucide-react';
import { BRAND_LOGO_MAX_BYTES, BRAND_LOGO_TYPES, BRAND_NAME_MAX, cleanBrandName, logoProblem, type ReportBrand } from '../../shared/report-brand.js';
import { readBrand, saveBrand } from './brand-store.js';

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  reader.readAsDataURL(file);
});

/** N2 · «Tu marca»: nombre y logotipo que encabezan el parte, el informe del mes, el expediente y el pasaporte. */
export function BrandPicker() {
  const [brand, setBrand] = useState<ReportBrand | null>(readBrand);
  const [name, setName] = useState(brand?.name ?? '');
  const [problem, setProblem] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const store = (next: ReportBrand | null) => {
    try { setBrand(saveBrand(next)); setProblem(''); return true; } catch (failure) { setProblem((failure as Error).message); return false; }
  };
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (!(BRAND_LOGO_TYPES as readonly string[]).includes(chosen.type)) { setProblem('El logotipo tiene que ser una imagen PNG, JPEG o WebP.'); return; }
    if (chosen.size > BRAND_LOGO_MAX_BYTES) { setProblem('El logotipo ocupa más de 200 KB. Usa una versión más ligera.'); return; }
    try {
      const logo = await readAsDataUrl(chosen), reason = logoProblem(logo);
      if (reason) setProblem(reason); else store({ name: cleanBrandName(name), logo });
    } catch (failure) { setProblem((failure as Error).message); }
  };
  return <details className="ct-brand">
    <summary className="button secondary">{brand?.logo ? <img className="ct-brand-thumb" src={brand.logo} alt="" /> : <Stamp size={15} aria-hidden="true" />}Tu marca</summary>
    <div className="ct-brand-pop">
      <p className="ct-brand-lede">Encabeza el parte, el informe del mes, el expediente y el pasaporte. Se guarda solo en este navegador.</p>
      <label className="ct-brand-name">Nombre de la empresa
        <input value={name} maxLength={BRAND_NAME_MAX + 20} placeholder="Tu empresa, S. L." autoComplete="organization"
          onChange={event => { setName(event.target.value); store({ name: cleanBrandName(event.target.value), logo: brand?.logo ?? '' }); }} />
      </label>
      <div className="ct-brand-logo">
        {brand?.logo ? <img src={brand.logo} alt="Logotipo actual" /> : <span>Sin logotipo</span>}
        <button type="button" className="text-button" onClick={() => file.current?.click()}><ImagePlus size={15} aria-hidden="true" />{brand?.logo ? 'Cambiar' : 'Elegir logotipo'}</button>
        {brand?.logo ? <button type="button" className="text-button" onClick={() => store({ name: cleanBrandName(name), logo: '' })}>Quitar</button> : null}
        <input ref={file} type="file" accept={BRAND_LOGO_TYPES.join(',')} hidden onChange={event => void pick(event)} />
      </div>
      <small>PNG, JPEG o WebP de hasta 200 KB. Sin SVG.</small>
      {problem ? <p className="ct-brand-problem" role="alert">{problem}</p> : null}
      {brand ? <button type="button" className="text-button ct-brand-clear" onClick={() => { if (store(null)) setName(''); }}><Trash2 size={14} aria-hidden="true" />Quitar la marca</button> : null}
    </div>
  </details>;
}
