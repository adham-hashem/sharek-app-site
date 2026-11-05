import {useState} from 'react';
import {ArrowLeft,Heart} from 'lucide-react';
import type {Language} from '@/lib/supabase';

export function FinancialSupportScreen({language,onBack}:{language:Language;onBack:()=>void}){
 const ar=language==='ar',[message,setMessage]=useState(false);
 return <div className="notif-settings-page financial-support-page" dir={ar?'rtl':'ltr'}>
  <header className="notif-center-header"><button className="icon-button" onClick={onBack} aria-label={ar?'رجوع':'Back'}><ArrowLeft size={20}/></button><h2>{ar?'دعم SHARek ماليًا':'Support SHARek'}</h2></header>
  <main className="financial-support-body">
   <span className="financial-support-heart"><Heart size={34} fill="currentColor"/></span>
   <h1>{ar?'❤️ ساهم في استمرار SHARek ونشر الخير':'❤️ Help SHARek keep sharing goodness'}</h1>
   {ar?<div className="financial-support-copy">
    <p>استمرار SHARek وتطويره محتاج دعمكم ❤️</p>
    <p>SHARek مش مجرد تطبيق لمشاركة الطعام، لكنه رسالة خير هدفها توصيل الوجبات للمحتاجين، وتقليل هدر الطعام، وربط أصحاب الخير بالناس اللي محتاجة المساعدة.</p>
    <p>دعمك المالي بيساعد التطبيق يستمر، ويغطّي تكاليف تشغيله وتطويره، ويحسّن خدماته، ويوصل لعدد أكبر من المحتاجين ومقدّمي المساعدة.</p>
    <p>كل مساهمة، مهما كان حجمها، ممكن تساعدنا نكمّل الطريق ونخلي مشاركة الخير أسهل، ونوصل وجبات أكتر للناس اللي محتاجاها.</p>
    <p><strong>بدعمكم، SHARek يقدر يستمر ويكبر، والخير يوصل لناس أكتر. ❤️</strong></p>
    <p>شكرًا لكل شخص بيساهم في استمرار رسالتنا.</p>
   </div>:<div className="financial-support-copy">
    <p>Your support helps SHARek continue and grow ❤️</p>
    <p>SHARek is more than a food sharing app. It connects available meals with people who need them, reduces food waste, and brings caring people together.</p>
    <p>Financial support can help cover operating and development costs, improve our services, and reach more people who need meals and more people who can help.</p>
    <p>Every contribution, whatever its size, can help us keep food sharing simple and deliver more meals.</p>
    <p><strong>With your support, SHARek can keep growing and help goodness reach more people. ❤️</strong></p>
    <p>Thank you for supporting our mission.</p>
   </div>}
   <button className="primary-button" onClick={()=>setMessage(true)}>{ar?'ادعم استمرار SHARek ❤️':'Support SHARek ❤️'}</button>
   {message&&<div className="feedback" role="status">{ar?'شكرًا لرغبتك في دعم SHARek ❤️ استقبال المساهمات المالية هيكون متاح قريبًا. دعمك واهتمامك بيساعدونا نكمّل رسالتنا وننشر الخير.':'Thank you for wanting to support SHARek ❤️ Financial contributions will be available soon. Your interest helps us continue our mission and share more goodness.'}</div>}
  </main>
 </div>;
}
