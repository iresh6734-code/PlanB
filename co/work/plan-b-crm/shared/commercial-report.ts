import type { CommercialContent } from './commercial.js';
export function commercialReportRows(content:CommercialContent):string[][]{
  return content.reportRows??[['Destinatario','Asunto','Reunión'],[content.recipient,content.subject,content.meeting?content.start:'Pendiente']];
}
export function commercialReportRange(content:CommercialContent){const rows=commercialReportRows(content),columns=Math.max(...rows.map(row=>row.length));return 'Seguimiento!A1:'+String.fromCharCode(64+columns)+rows.length;}
