// HubSpot activity timestamps may be ISO instants or Unix milliseconds.
// Reject ambiguous local times and impossible calendar dates rather than let
// Date.parse silently roll them into another day.
export function normalizeHubspotActivityTime(value:unknown):string|null {
  let milliseconds:number;
  if(typeof value==='number'||(typeof value==='string'&&/^-?\d+$/.test(value))){
    milliseconds=Number(value);
    if(!Number.isSafeInteger(milliseconds))return null;
  }else if(typeof value==='string'){
    const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if(!match)return null;
    const [,yearText,monthText,dayText,hourText,minuteText,secondText,,zone]=match;
    const year=Number(yearText),month=Number(monthText),day=Number(dayText);
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(month<1||month>12||day<1||day>days[month-1]||Number(hourText)>23||Number(minuteText)>59||Number(secondText)>59)return null;
    if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4,6))>59))return null;
    milliseconds=Date.parse(value);
  }else return null;
  const date=new Date(milliseconds);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}

// Inputs have already been normalized above. Stable sort keeps the sampling
// order on ties and between unknown dates; it does not change which IDs we read.
export function compareHubspotActivityTime(a:{at:string|null},b:{at:string|null}):number {
  if(a.at===null)return b.at===null?0:1;
  if(b.at===null)return -1;
  return Date.parse(b.at)-Date.parse(a.at);
}
