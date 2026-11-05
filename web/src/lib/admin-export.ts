import {Capacitor,registerPlugin} from '@capacitor/core';
const native=registerPlugin<{saveCsv(options:{name:string;csv:string}):Promise<{saved?:boolean;cancelled?:boolean}>;printHtml(options:{name:string;html:string}):Promise<{opened:boolean}>}>('ReportExport');
export function csvCell(value:unknown):string{
 const raw=String(value??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,match=>`'${match}`);
 return `"${raw.replace(/"/g,'""')}"`;
}
export async function downloadCsv(name:string,title:string,language:'ar'|'en',headers:string[],rows:unknown[][],period:string){
 const content='\uFEFF'+[
  ['SHARek',title].map(csvCell).join(','),
  [(language==='ar'?'تاريخ الإصدار':'Issued at'),new Date().toLocaleString(language==='ar'?'ar-EG':'en-US')].map(csvCell).join(','),
  [(language==='ar'?'الفترة':'Period'),period].map(csvCell).join(','),
  headers.map(csvCell).join(','),
  ...rows.map(row=>row.map(csvCell).join(','))
 ].join('\r\n');
 if(Capacitor.getPlatform()==='android'){await native.saveCsv({name,csv:content});return;}
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const htmlEscape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]??ch));
async function logoData(){
 const response=await fetch(import.meta.env.BASE_URL+'image.png');if(!response.ok)throw new Error('LOGO_UNAVAILABLE');
 const blob=await response.blob();
 return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
}
export async function printTablePdf(title:string,language:'ar'|'en',headers:string[],rows:unknown[][],period:string){
 const logo=await logoData(),rtl=language==='ar',issued=new Date().toLocaleString(rtl?'ar-EG':'en-US');
 const html=`<!doctype html><html dir="${rtl?'rtl':'ltr'}" lang="${language}"><head><meta charset="utf-8"><style>
 @page{size:A4;margin:18mm}body{font-family:Arial,"Noto Kufi Arabic",sans-serif;color:#342821}
 header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #f06427;padding-bottom:12px}
 header img{width:75px;height:auto}h1{font-size:22px;margin:0}small{color:#684c3c}
 table{width:100%;border-collapse:collapse;margin-top:20px;direction:${rtl?'rtl':'ltr'}}
 th,td{border:1px solid #e8ded6;padding:8px;text-align:start;overflow-wrap:anywhere;font-size:11px}
 th{background:#fff1e8;color:#8d3e19}tr{break-inside:avoid}footer{margin-top:20px;color:#8c8078;font-size:10px}
 </style></head><body><header><img src="${logo}" alt="SHARek"><div><h1>${htmlEscape(title)}</h1><small>${htmlEscape(period)} · ${htmlEscape(issued)}</small></div></header>
 <table><thead><tr>${headers.map(cell=>`<th>${htmlEscape(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
 <footer>SHARek · ${htmlEscape(issued)}</footer></body></html>`;
 if(Capacitor.getPlatform()==='android'){await native.printHtml({name:title,html});return;}
 const frame=document.createElement('iframe');frame.style.position='fixed';frame.style.width='0';frame.style.height='0';frame.style.border='0';document.body.append(frame);
 let printed=false;frame.onload=()=>{if(printed)return;printed=true;frame.contentWindow?.focus();frame.contentWindow?.print();window.setTimeout(()=>frame.remove(),60000);};
 const doc=frame.contentDocument;if(!doc)throw new Error('PRINT_UNAVAILABLE');doc.open();doc.write(html);doc.close();
}
