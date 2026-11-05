import {Capacitor,registerPlugin} from '@capacitor/core';
import {supabase,type Language} from '@/lib/supabase';

const native=registerPlugin<{printHtml(options:{name:string;html:string}):Promise<{opened:boolean}>}>('ReportExport');

export type ReportRole='donor'|'beneficiary';
export type MealTransactionReport={
 id:string;request_id:string;reference:string;role:ReportRole;
 donor_id:string;beneficiary_id:string;meal_id:string|null;
 meal_name:string;meal_description:string;meal_photo_url:string|null;
 quantity:number;sharing_mode:string;published_at:string|null;received_at:string;
 pickup_latitude:number|null;pickup_longitude:number|null;
 pickup_area_name:string;pickup_instructions:string;pickup_country:string;
 donor_name:string;beneficiary_name:string;donor_avatar:string|null;beneficiary_avatar:string|null;
};

export async function fetchMealReports(from:string|null,to:string|null):Promise<MealTransactionReport[]>{
 const {data,error}=await supabase.rpc('my_meal_transaction_reports',{p_from:from,p_to:to});
 if(error)throw error;
 return Array.isArray(data)?data as MealTransactionReport[]:[];
}

const text={
 ar:{
  doc:'تقارير الوجبات',donor:'تقرير المتبرع',beneficiary:'تقرير المستفيد',
  issued:'تاريخ الإصدار',reference:'الرقم المرجعي',period:'الفترة',allTime:'كل الفترات',
  accountHolder:'صاحب هذا التقرير',asDonor:'بصفته المتبرع',asBeneficiary:'بصفته المستفيد',
  donorLabel:'المتبرع',beneficiaryLabel:'المستفيد',mealLabel:'بيانات الوجبة',
  name:'اسم الوجبة',description:'الوصف',quantity:'الكمية المؤكدة',
  published:'تاريخ ووقت النشر',received:'تاريخ ووقت الاستلام الفعلي',
  pickup:'موقع الاستلام الفعلي',area:'المنطقة',country:'الدولة',coords:'الإحداثيات',
  instructions:'تعليمات الاستلام',status:'حالة العملية',received_ok:'تم الاستلام',
  unavailable:'غير متاح',noPhoto:'لا توجد صورة',summary:'ملخص العمليات',
  total:'عدد العمليات المكتملة',mode:'نوع المشاركة',modeRequest:'عبر طلب',modeDirect:'استلام مباشر',
 },
 en:{
  doc:'Meal Reports',donor:'Donor Report',beneficiary:'Beneficiary Report',
  issued:'Issued at',reference:'Reference number',period:'Period',allTime:'All time',
  accountHolder:'This report belongs to',asDonor:'acting as the donor',asBeneficiary:'acting as the beneficiary',
  donorLabel:'Donor',beneficiaryLabel:'Beneficiary',mealLabel:'Meal details',
  name:'Meal name',description:'Description',quantity:'Confirmed quantity',
  published:'Publication date and time',received:'Actual receipt date and time',
  pickup:'Actual pickup location',area:'Area',country:'Country',coords:'Coordinates',
  instructions:'Pickup instructions',status:'Transaction status',received_ok:'Successfully Received',
  unavailable:'Unavailable',noPhoto:'No photo',summary:'Transactions summary',
  total:'Completed transactions',mode:'Sharing type',modeRequest:'Via request',modeDirect:'Direct pickup',
 },
} as const;

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]??ch));
const locale=(language:Language)=>language==='ar'?'ar-EG':'en-US';
const stamp=(value:string|null,language:Language,fallback:string)=>value?new Date(value).toLocaleString(locale(language)):fallback;

async function dataUrl(url:string|null|undefined):Promise<string|null>{
 if(!url)return null;
 try{
  const response=await fetch(url);
  if(!response.ok)return null;
  const blob=await response.blob();
  return await new Promise<string|null>(resolve=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result));
   reader.onerror=()=>resolve(null);
   reader.readAsDataURL(blob);
  });
 }catch{return null;}
}

async function logo():Promise<string|null>{return dataUrl(import.meta.env.BASE_URL+'image.png');}

const styles=(rtl:boolean)=>`
@page{size:A4;margin:16mm}
*{box-sizing:border-box}
body{font-family:Arial,"Noto Kufi Arabic","Segoe UI",sans-serif;color:#342821;background:#fff;margin:0;direction:${rtl?'rtl':'ltr'};text-align:start}
.sheet{page-break-after:always}
.sheet:last-child{page-break-after:auto}
header.brand{display:flex;align-items:center;gap:14px;border-bottom:3px solid #f06427;padding-bottom:10px;margin-bottom:16px}
header.brand img{width:70px;height:auto}
header.brand h1{font-size:20px;margin:0;color:#8d3e19}
header.brand small{display:block;color:#684c3c;font-size:11px;margin-top:3px}
.holder{background:#fff1e8;border:1px solid #f7cdb4;border-radius:10px;padding:9px 12px;font-size:12px;margin-bottom:14px}
.holder b{color:#8d3e19}
.parties{display:flex;gap:10px;margin-bottom:14px}
.party{flex:1;border:1px solid #e8ded6;border-radius:10px;padding:10px;display:flex;align-items:center;gap:10px;min-width:0}
.party img,.party .ph{width:46px;height:46px;border-radius:50%;object-fit:cover;flex:0 0 46px;background:#f3e9e2;border:1px solid #e8ded6}
.party .ph{display:flex;align-items:center;justify-content:center;font-size:9px;color:#8c8078;text-align:center;line-height:1.1}
.party span{min-width:0}
.party small{display:block;color:#8c8078;font-size:10px}
.party strong{font-size:13px;overflow-wrap:anywhere}
.meal{display:flex;gap:12px;margin-bottom:14px}
.meal img{width:150px;height:110px;object-fit:cover;border-radius:10px;border:1px solid #e8ded6;flex:0 0 150px}
.meal .ph{width:150px;height:110px;border-radius:10px;border:1px dashed #d8cbc1;flex:0 0 150px;display:flex;align-items:center;justify-content:center;color:#8c8078;font-size:11px}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th,td{border:1px solid #e8ded6;padding:7px 9px;text-align:start;overflow-wrap:anywhere;vertical-align:top}
th{background:#fff6f0;color:#8d3e19;width:38%;font-weight:700}
tr{break-inside:avoid}
h2{font-size:13px;color:#8d3e19;margin:16px 0 7px}
.status{display:inline-block;background:#e9f7ec;border:1px solid #bfe3c8;color:#1f6b35;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700}
footer{margin-top:16px;border-top:1px solid #e8ded6;padding-top:7px;color:#8c8078;font-size:9.5px}
.na{color:#8c8078}
`;

function partyBlock(label:string,name:string,photo:string|null,noPhoto:string,unavailable:string){
 const avatar=photo?`<img src="${photo}" alt="">`:`<span class="ph">${escape(noPhoto)}</span>`;
 return `<div class="party">${avatar}<span><small>${escape(label)}</small><strong>${name?escape(name):`<i class="na">${escape(unavailable)}</i>`}</strong></span></div>`;
}

function row(label:string,value:string|null,unavailable:string){
 const shown=value&&value.trim()?escape(value):`<i class="na">${escape(unavailable)}</i>`;
 return `<tr><th>${escape(label)}</th><td>${shown}</td></tr>`;
}

type Assets={logo:string|null;meal:string|null;donor:string|null;beneficiary:string|null};

function sheet(report:MealTransactionReport,language:Language,assets:Assets){
 const t=text[language],rtl=language==='ar';
 const title=report.role==='donor'?t.donor:t.beneficiary;
 const holder=report.role==='donor'
  ?`<b>${escape(report.donor_name||t.unavailable)}</b> — ${escape(t.asDonor)}`
  :`<b>${escape(report.beneficiary_name||t.unavailable)}</b> — ${escape(t.asBeneficiary)}`;
 const coords=report.pickup_latitude!=null&&report.pickup_longitude!=null
  ?`${report.pickup_latitude.toFixed(6)}, ${report.pickup_longitude.toFixed(6)}`:'';
 const mode=report.sharing_mode==='direct'?t.modeDirect:t.modeRequest;
 const mealPhoto=assets.meal?`<img src="${assets.meal}" alt="">`:`<span class="ph">${escape(t.noPhoto)}</span>`;
 const first=report.role==='donor'
  ?partyBlock(t.donorLabel,report.donor_name,assets.donor,t.noPhoto,t.unavailable)+partyBlock(t.beneficiaryLabel,report.beneficiary_name,assets.beneficiary,t.noPhoto,t.unavailable)
  :partyBlock(t.beneficiaryLabel,report.beneficiary_name,assets.beneficiary,t.noPhoto,t.unavailable)+partyBlock(t.donorLabel,report.donor_name,assets.donor,t.noPhoto,t.unavailable);
 return `<section class="sheet" dir="${rtl?'rtl':'ltr'}">
 <header class="brand">${assets.logo?`<img src="${assets.logo}" alt="SHARek">`:''}<div><h1>${escape(title)}</h1><small>${escape(t.reference)}: ${escape(report.reference)} · ${escape(t.issued)}: ${escape(new Date().toLocaleString(locale(language)))}</small></div></header>
 <div class="holder">${escape(t.accountHolder)}: ${holder}</div>
 <div class="parties">${first}</div>
 <h2>${escape(t.mealLabel)}</h2>
 <div class="meal">${mealPhoto}<table><tbody>
  ${row(t.name,report.meal_name,t.unavailable)}
  ${row(t.quantity,String(report.quantity),t.unavailable)}
  ${row(t.mode,mode,t.unavailable)}
 </tbody></table></div>
 <table><tbody>
  ${row(t.description,report.meal_description,t.unavailable)}
  ${row(t.published,stamp(report.published_at,language,''),t.unavailable)}
  ${row(t.received,stamp(report.received_at,language,''),t.unavailable)}
 </tbody></table>
 <h2>${escape(t.pickup)}</h2>
 <table><tbody>
  ${row(t.area,report.pickup_area_name,t.unavailable)}
  ${row(t.country,report.pickup_country,t.unavailable)}
  ${row(t.coords,coords,t.unavailable)}
  ${row(t.instructions,report.pickup_instructions,t.unavailable)}
 </tbody></table>
 <h2>${escape(t.status)}</h2>
 <p><span class="status">${escape(t.received_ok)}</span></p>
 <footer>SHARek · ${escape(t.reference)}: ${escape(report.reference)}</footer>
</section>`;
}

async function assetsFor(report:MealTransactionReport,shared:string|null):Promise<Assets>{
 const [meal,donor,beneficiary]=await Promise.all([
  dataUrl(report.meal_photo_url),dataUrl(report.donor_avatar),dataUrl(report.beneficiary_avatar)]);
 return {logo:shared,meal,donor,beneficiary};
}

async function document_(reports:MealTransactionReport[],language:Language,period:string){
 const t=text[language],rtl=language==='ar',shared=await logo();
 const sheets=await Promise.all(reports.map(async report=>sheet(report,language,await assetsFor(report,shared))));
 const cover=reports.length>1?`<section class="sheet" dir="${rtl?'rtl':'ltr'}">
  <header class="brand">${shared?`<img src="${shared}" alt="SHARek">`:''}<div><h1>${escape(t.summary)}</h1><small>${escape(t.period)}: ${escape(period)} · ${escape(t.issued)}: ${escape(new Date().toLocaleString(locale(language)))}</small></div></header>
  <table><tbody>${row(t.total,String(reports.length),t.unavailable)}</tbody></table>
  <h2>${escape(t.doc)}</h2>
  <table><thead><tr><th>${escape(t.reference)}</th><td>${escape(t.name)}</td></tr></thead><tbody>
  ${reports.map(r=>`<tr><th>${escape(r.reference)}</th><td>${escape(r.meal_name||t.unavailable)} · ${escape(stamp(r.received_at,language,t.unavailable))}</td></tr>`).join('')}
  </tbody></table></section>`:'';
 return `<!doctype html><html dir="${rtl?'rtl':'ltr'}" lang="${language}"><head><meta charset="utf-8"><title>${escape(t.doc)}</title><style>${styles(rtl)}</style></head><body>${cover}${sheets.join('')}</body></html>`;
}

async function present(name:string,html:string){
 if(Capacitor.getPlatform()==='android'){await native.printHtml({name,html});return;}
 const frame=document.createElement('iframe');
 frame.style.position='fixed';frame.style.width='0';frame.style.height='0';frame.style.border='0';
 document.body.append(frame);
 let printed=false;
 frame.onload=()=>{if(printed)return;printed=true;frame.contentWindow?.focus();frame.contentWindow?.print();window.setTimeout(()=>frame.remove(),60000);};
 const doc=frame.contentDocument;
 if(!doc){frame.remove();throw new Error('PRINT_UNAVAILABLE');}
 doc.open();doc.write(html);doc.close();
}

export async function printMealReport(report:MealTransactionReport,language:Language){
 const t=text[language];
 await present(`${report.reference}`,await document_([report],language,t.allTime));
}

export async function printMealReports(reports:MealTransactionReport[],language:Language,period:string){
 if(reports.length===0)return;
 await present(text[language].doc,await document_(reports,language,period));
}

export const reportLabels=text;
