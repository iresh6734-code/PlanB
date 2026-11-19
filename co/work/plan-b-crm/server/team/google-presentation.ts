import type { CommercialContent } from '../../shared/commercial.js';
import { commercialReportRows } from '../../shared/commercial-report.js';

const ink={red:0.12,green:0.19,blue:0.31};
const blue={red:0.16,green:0.28,blue:0.55};

// Formatting never rewrites approved text. Docs ranges use UTF-16 offsets,
// matching JavaScript string lengths, including accents and surrogate pairs.
export function documentRequests(text:string){
  const range={startIndex:1,endIndex:1+text.length};
  const requests:Record<string,unknown>[]=[
    {insertText:{location:{index:1},text}},
    {updateTextStyle:{range,textStyle:{weightedFontFamily:{fontFamily:'Arial'},fontSize:{magnitude:10.5,unit:'PT'},foregroundColor:{color:{rgbColor:ink}}},fields:'weightedFontFamily,fontSize,foregroundColor'}},
    {updateParagraphStyle:{range,paragraphStyle:{lineSpacing:115,spaceAbove:{magnitude:0,unit:'PT'},spaceBelow:{magnitude:5,unit:'PT'}},fields:'lineSpacing,spaceAbove,spaceBelow'}},
  ];
  let offset=1,titleApplied=false,headingCount=0;
  for(const line of text.split('\n')){
    const heading=line.trim();
    const first=!!heading&&!titleApplied;
    const title=first&&heading.length<=180;
    const section=!first&&heading.length<=100&&(/^\d{1,2}[.)]\s+\S/.test(heading)||/^(Objetivo|Alcance y condiciones|Próxima acción)$/i.test(heading));
    if((title||section)&&headingCount<30){
      const headingRange={startIndex:offset,endIndex:offset+line.length};
      requests.push({updateParagraphStyle:{range:headingRange,paragraphStyle:{namedStyleType:title?'TITLE':'HEADING_2',keepWithNext:true,spaceAbove:{magnitude:title?0:12,unit:'PT'},spaceBelow:{magnitude:6,unit:'PT'}},fields:'namedStyleType,keepWithNext,spaceAbove,spaceBelow'}});
      requests.push({updateTextStyle:{range:headingRange,textStyle:{bold:true,fontSize:{magnitude:title?20:12,unit:'PT'},foregroundColor:{color:{rgbColor:blue}}},fields:'bold,fontSize,foregroundColor'}});
      headingCount++;
    }
    if(first)titleApplied=true;
    offset+=line.length+1;
  }
  return requests;
}

export function spreadsheetPayload(content:CommercialContent){
  const rows=commercialReportRows(content),columns=rows[0].length;
  // Context reports are label/detail pairs. Other reports retain their original
  // columns, with bounded widths so long text wraps rather than filling a screen.
  const widths=Array.from({length:columns},(_,column)=>columns===2?(column===0?180:440):Math.min(360,Math.max(160,...rows.map(row=>Math.min((row[column]?.length??0)*7+24,360)))));
  return {
    properties:{title:content.documentTitle},
    sheets:[{properties:{title:'Seguimiento',gridProperties:{frozenRowCount:1}},data:[{
      columnMetadata:widths.map(pixelSize=>({pixelSize})),
      rowMetadata:rows.map((row,index)=>({pixelSize:Math.min(180,Math.max(index===0?30:28,...row.map((cell,column)=>Math.ceil((cell.length||1)/Math.max(10,Math.floor(widths[column]/7)))*17+10)))})),
      rowData:rows.map((row,index)=>({values:row.map(stringValue=>({
        userEnteredValue:{stringValue},
        userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP',backgroundColor:index===0?{red:0.91,green:0.94,blue:0.98}:index%2?{red:1,green:1,blue:1}:{red:0.97,green:0.98,blue:0.99},textFormat:{fontFamily:'Arial',fontSize:10,bold:index===0,foregroundColor:ink}},
      }))})),
    }]}],
  };
}
