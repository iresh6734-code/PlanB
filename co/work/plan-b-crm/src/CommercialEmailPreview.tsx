import type { CommercialContent } from '../shared/commercial.js';
import { renderCommercialEmail } from '../shared/commercial-email.js';

export function CommercialEmailPreview({content}:{content:CommercialContent}){
  const rendered=renderCommercialEmail(content);
  return <section className="commercial-mail-preview" aria-label="Vista previa del correo">
    <dl className="commercial-mail-envelope"><div><dt>Para</dt><dd>{content.recipient}</dd></div><div><dt>Asunto</dt><dd>{content.subject}</dd></div></dl>
    {content.emailFormat==='html'
      // Only the shared renderer creates this fragment. Every user/CRM string is escaped.
      ?<div className="commercial-mail-content" dangerouslySetInnerHTML={{__html:rendered.fragment}}/>
      :<div className="commercial-mail-plain">{rendered.plain}</div>}
  </section>;
}
