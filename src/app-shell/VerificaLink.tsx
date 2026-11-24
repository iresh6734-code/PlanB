import { BadgeCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { localAvailable } from '../verifica/engagement-client.js';

let availability: Promise<boolean> | undefined;

export function VerificaLink({ className, size }: { className: string; size: number }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    availability ??= localAvailable();
    void availability.then(ok => { if (live) setAvailable(ok); });
    return () => { live = false; };
  }, []);

  if (!available) return null;
  return <a href="/verifica.html" className={className}><BadgeCheck size={size} aria-hidden="true" /><span>Verifica</span></a>;
}
