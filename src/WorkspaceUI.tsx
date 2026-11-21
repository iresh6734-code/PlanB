import type { ReactNode } from 'react';
export function InlineEmpty({title,children,action}:{title:string;children?:ReactNode;action?:ReactNode}){return <div className="inline-empty"><div><h3>{title}</h3>{children?<p>{children}</p>:null}</div>{action?<div>{action}</div>:null}</div>;}
export function StatusTag({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'warning'|'success'|'info'}){return <span className={'status-tag '+tone}>{children}</span>;}
