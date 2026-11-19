import type { CommercialContent } from './commercial.js';

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function meetingLabel(content:Pick<CommercialContent,'start'|'end'|'timeZone'>){
  const day=new Intl.DateTimeFormat('es-ES',{timeZone:content.timeZone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(content.start));
  const clock=new Intl.DateTimeFormat('es-ES',{timeZone:content.timeZone,hour:'2-digit',minute:'2-digit',hour12:false});
  return `${day} · ${clock.format(new Date(content.start))}–${clock.format(new Date(content.end))} (hora de Madrid)`;
}
// Shared by the review preview and the MIME sender. No remote assets or arbitrary HTML.
export function renderCommercialEmail(content:CommercialContent){
  const meeting=content.meeting?meetingLabel(content):'';
  const plain=[content.body,content.emailFormat&&meeting?'Propuesta de reunión\n'+meeting:'',content.signature??''].filter(Boolean).join('\n\n');
  const paragraphs=content.body.split(/\n\s*\n/).map(p=>`<p style="margin:0 0 18px">${escape(p).replaceAll('\n','<br>')}</p>`).join('');
  const slot=meeting?`<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0"><tr><td style="padding:16px 18px;background:#f2f5f9;border:1px solid #dde4ed;border-radius:4px"><p style="margin:0 0 5px;font-size:13px;font-weight:600;color:#284a70">Propuesta de reunión</p><p style="margin:0;font-size:14px;color:#24374c">${escape(meeting)}</p></td></tr></table>`:'';
  const signature=content.signature?`<div style="margin-top:24px;padding-top:18px;border-top:1px solid #dde4ed;font-size:13px;line-height:1.65;color:#44556c">${escape(content.signature).replaceAll('\n','<br>')}</div>`:'';
  // Inline email styles are intentional for mail-client compatibility; app tokens stay in CSS.
  const fragment=`<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px 20px"><div style="max-width:600px;margin:0 auto">${paragraphs}${slot}${signature}</div></td></tr></table>`;
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;color:#24374c;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;overflow-wrap:anywhere">${fragment}</body></html>`;
  return {plain,html,fragment};
}
