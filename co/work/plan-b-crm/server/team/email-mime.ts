import { randomBytes } from 'node:crypto';
import type { CommercialContent } from '../../shared/commercial.js';
import { renderCommercialEmail } from '../../shared/commercial-email.js';
const base64=(text:string)=>(Buffer.from(text).toString('base64').match(/.{1,76}/g)??[]).join('\r\n');
export function commercialMime(id:string,content:CommercialContent){
  const characters=Array.from(content.subject),words:string[]=[];
  for(let i=0;i<characters.length;i+=10)words.push('=?UTF-8?B?'+Buffer.from(characters.slice(i,i+10).join('')).toString('base64')+'?=');
  const headers=['To: '+content.recipient,'Subject: '+words.join('\r\n '),'Message-ID: <planb-'+id+'@planb.local>','MIME-Version: 1.0'];
  const rendered=renderCommercialEmail(content);
  if(content.emailFormat!=='html')return [...headers,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(rendered.plain)].join('\r\n');
  const boundary='planb_'+randomBytes(18).toString('hex');
  return [...headers,'Content-Type: multipart/alternative; boundary="'+boundary+'"','',
    '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(rendered.plain),
    '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(rendered.html),'--'+boundary+'--',''].join('\r\n');
}
