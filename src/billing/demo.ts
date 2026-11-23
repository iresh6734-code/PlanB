export const partsHeaders = ['referencia', 'concepto', 'importe_neto', 'aprobado', 'fuera_de_cuota'];
export const invoiceHeaders = ['factura', 'linea', 'referencia', 'importe_neto', 'estado'];

export const demoParts = [
  partsHeaders.join(';'),
  'PT-1042;Cambio de compresor;1240,00;sí;sí',
  'PT-1045;Sustitución de válvula;650,00;sí;sí',
  'PT-1049;Reparación de la bomba de condensados;320,00;sí;sí',
  'PT-1051;Sustitución de termostato;185,00;no;sí',
  'PT-1054;Revisión mensual de la instalación;180,00;sí;no',
].join('\n');

export const demoInvoices = [
  invoiceHeaders.join(';'),
  'F-0261;1;PT-1045;400,00;emitida',
  'F-0263;1;PT-1049;320,00;emitida',
  'F-0266;1;PT-1042;1240,00;borrador',
].join('\n');

export const demoRecheckedInvoices = demoInvoices.replace('F-0266;1;PT-1042;1240,00;borrador', 'F-0266;1;PT-1042;1240,00;emitida');
