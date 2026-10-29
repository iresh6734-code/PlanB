import test from 'node:test';
import assert from 'node:assert/strict';
import { documentRequests,spreadsheetPayload } from '../server/team/google-presentation.js';
import { CommercialContentSchema } from '../shared/commercial.js';

test('Docs: formato por rangos conserva el texto aprobado, Unicode y separación de secciones',()=>{
  const text='Propuesta · Ensayo 🚀\n\n1. Objetivo\nTexto literal <no ejecutar>.\n\n2. Condiciones\nSin compromiso.';
  const requests=documentRequests(text) as any[];
  assert.deepEqual(requests[0],{insertText:{location:{index:1},text}});
  assert.equal(requests.filter(r=>r.insertText).length,1);
  assert.ok(requests.slice(1).every(r=>r.updateTextStyle||r.updateParagraphStyle));
  const styles=requests.filter(r=>r.updateParagraphStyle?.paragraphStyle.namedStyleType);
  assert.deepEqual(styles.map(r=>r.updateParagraphStyle.paragraphStyle.namedStyleType),['TITLE','HEADING_2','HEADING_2']);
  for(const r of requests.slice(1)){
    const update=r.updateTextStyle??r.updateParagraphStyle;
    assert.ok(update.range.startIndex>=1&&update.range.endIndex<=text.length+1);
    assert.ok(update.range.endIndex>update.range.startIndex);
  }
  assert.equal(text.slice(styles[1].updateParagraphStyle.range.startIndex-1,styles[1].updateParagraphStyle.range.endIndex-1),'1. Objetivo');
  assert.equal(documentRequests('Propuesta\nObjetivo\nRevisión.').length,7);
  assert.ok(documentRequests('Título\n'+Array.from({length:100},()=> '1. Apartado').join('\n')).length<=63);
});

test('Sheets: contexto legible desde su creación, valores literales y sin compartir archivos',()=>{
  const content=CommercialContentSchema.parse({recipient:'propio@ficticio.example',subject:'Ensayo',body:'Texto aprobado',meeting:false,email:false,document:false,spreadsheet:true,start:'2026-10-29T10:00:00Z',end:'2026-10-29T10:30:00Z',timeZone:'Europe/Madrid',documentTitle:'Informe ficticio',documentBody:'Propuesta ficticia',reportRows:[['Campo','Detalle'],['Cliente','=IMPORTXML("no ejecutar")'],['Próxima acción','Revisar el alcance antes de enviar.']]});
  const payload=spreadsheetPayload(content),sheet=payload.sheets[0],grid=sheet.data[0];
  assert.equal(sheet.properties.gridProperties.frozenRowCount,1);
  assert.deepEqual(grid.columnMetadata.map(c=>c.pixelSize),[180,440]);
  assert.deepEqual(grid.rowData.map(row=>row.values.map(cell=>cell.userEnteredValue.stringValue)),content.reportRows);
  assert.equal(grid.rowData[0].values[0].userEnteredFormat.textFormat.bold,true);
  assert.equal(grid.rowData[1].values[0].userEnteredFormat.textFormat.bold,false);
  assert.equal(grid.rowData[1].values[1].userEnteredFormat.wrapStrategy,'WRAP');
  assert.ok(!JSON.stringify(payload).includes('formulaValue'));
  assert.ok(!JSON.stringify(payload).includes('permissions'));
  const legacy=spreadsheetPayload({...content,reportRows:undefined});
  assert.equal(legacy.sheets[0].data[0].columnMetadata.length,3);
});
