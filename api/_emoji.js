// GENERATED from project/src/lib/market-emoji.ts (node scripts/sync-emoji.mjs). Do not edit by hand.
// Automatic emoji for donated items that have no photo. Chosen from the item's title first
// (Arabic or English), then its category/subtype, then 🎁. The donor never picks one.
// The same rules exist in sharek-site/api/_emoji.js for the public page; a test keeps them equal.

                                                              

const norm=(value       )=>value.toLowerCase()
  .replace(/[ً-ٰٟـ]/g,'')   // tashkeel, tatweel
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/[^a-z0-9؀-ۿ]+/g,' ').trim();

// Most specific first; the first rule with a matching keyword wins.
const TITLE_RULES                    =[
  ['🎒',['شنطه مدرسيه','حقيبه مدرسيه','شنطه ظهر','school bag','schoolbag','backpack','back pack']],
  ['🧥',['جاكيت','جاكت','جاكيت','معطف','بالطو','كوت','سترة','سترات','هودي','jacket','coat','hoodie','sweater','بلوفر','كارديجان']],
  ['👖',['بنطلون','بنطال','جينز','jeans','pants','trousers']],
  ['👗',['فستان','جيبه','عباي','dress','skirt','gown']],
  ['🧦',['جوارب','شراب','sock']],
  ['🧣',['وشاح','كوفيه','شال','scarf']],
  ['🧤',['قفاز','جوانتي','gloves']],
  ['🧢',['كاب','قبعه','طاقيه','hat','cap']],
  ['👟',['حذاء','احذيه','جزمه','جزم','كوتشي','صندل','شبشب','صنادل','shoe','sneaker','boot','sandal','slipper','trainer']],
  ['👜',['شنطه','شنط','حقيبه','حقائب','محفظه','bag','purse','wallet','handbag']],
  ['📚',['كتب','كتاب مدرسي','مناهج','textbook','books','encyclopedia','موسوعه']],
  ['📖',['كتاب','قصه','قصص','روايه','مصحف','قران','book','novel','story']],
  ['✏️',['قلم','اقلام','كراس','كراسه','دفتر','دفاتر','ادوات مكتبيه','مقلمه','pencil','pen','notebook','stationery','crayon','الوان']],
  ['📏',['مسطره','فرجار','ruler','compass']],
  ['🧊',['ثلاجه','فريزر','فريزير','fridge','refrigerator','freezer']],
  ['📺',['تلفزيون','تليفزيون','تلفاز','تلفزيون','شاشه','tv','television','screen']],
  ['💻',['لابتوب','لاب توب','كمبيوتر','حاسوب','laptop','computer','pc']],
  ['📱',['موبايل','هاتف','تليفون','جوال','phone','mobile','smartphone','تابلت','tablet','ايباد','ipad']],
  ['🎧',['سماعه','سماعات','headphone','earphone','headset']],
  ['🔌',['شاحن','كابل','charger','cable','adapter','محول']],
  ['📷',['كاميرا','camera']],
  ['🌀',['مروحه','fan']],
  ['🧺',['غساله','washing machine','washer']],
  ['🔥',['بوتاجاز','موقد','فرن','stove','oven','cooker']],
  ['🍴',['معلقه','ملعقه','ملاعق','شوكه','شوك','سكين','سكاكين','ادوات مطبخ','utensil','cutlery','spoon','fork','knife']],
  ['🍳',['حله','حلل','طنجره','مقلاه','طاسه','pot','pan','frying']],
  ['🍽️',['طبق','اطباق','صحن','صحون','كوب','اكواب','فنجان','plate','dish','cup','mug','glass','bowl']],
  ['🛋️',['كنبه','اريكه','انتريه','sofa','couch']],
  ['🛏️',['سرير','تخت','مرتبه','بطانيه','لحاف','ملايه','ملاءه','مخده','وسايد','bed','mattress','blanket','quilt','pillow','duvet','bedding']],
  ['🍼',['رضاعه','رضاعات','حفاضات','حفاض','عربه اطفال','عربة اطفال','كرسي سياره اطفال','baby','stroller','diaper','crib','pacifier']],
  ['🧸',['لعبه','العاب','دميه','عروسه','تيدي','toy','teddy','doll','lego','puzzle']],
  ['🧴',['شامبو','صابون','عطر','كريم','لوشن','معجون','فرشاه اسنان','shampoo','soap','perfume','lotion','cream','toothpaste','deodorant']],
  ['🥫',['طعام','اكل','معلبات','علب','سكر','ارز','زيت','food','canned','rice','sugar','oil','flour','دقيق']],
  ['🪑',['كرسي','كراسي','ترابيزه','طاوله','مكتب','دولاب','خزانه','اثاث','رف','chair','table','desk','wardrobe','cabinet','shelf','furniture','drawer','دروج']],
  ['👕',['قميص','تيشرت','تي شيرت','بلوزه','بلوزة','ملابس','هدوم','shirt','t shirt','tshirt','blouse','top','clothes','clothing','طقم']],
];

const BY_SUBTYPE                      ={
  'clothing:children':'👕','clothing:men':'👕','clothing:women':'👕','clothing:other':'👕',
  'school:bags':'🎒','school:books':'📖','school:stationery':'✏️','school:other':'📚',
  'household:kitchen':'🍽️','household:bedding':'🛏️','household:appliances':'🔌','household:other':'🏠',
};
const BY_CATEGORY                      ={clothing:'👕',school:'📚',household:'🏠'};

// Soft, category-appropriate backgrounds (SHARek orange / yellow / green family).
export const EMOJI_TINT                               ={clothing:['#fff1e8','#ffe0cf'],school:['#fff7dc','#ffecb0'],household:['#eaf6ec','#d6ecd9']};

const PREFIX=/^(وال|بال|كال|فال|لل|ال|و|ب|ل)/;
const tokenMatches=(token       ,word       )=>{
  if(!/[؀-ۿ]/.test(word))return token===word||token===`${word}s`||token===`${word}es`;
  const bare=token.replace(PREFIX,'');
  // Arabic: same word with an optional prefix (ال، و، ب، ل) and up to two suffix letters (ات، ين، ان، ه).
  for(const candidate of new Set([token,bare]))if(candidate.startsWith(word)&&candidate.length-word.length<=2)return true;
  return false;
};
export function marketEmoji(category                      ,subtype                      ,title                      )       {
  const text=norm(title??'');
  if(text){
    const tokens=text.split(' ');const padded=` ${text} `;
    for(const [emoji,words] of TITLE_RULES){
      for(const raw of words){
        const word=norm(raw);if(!word)continue;
        if(word.includes(' ')?padded.includes(` ${word} `)||padded.includes(` ${word}`):tokens.some(token=>tokenMatches(token,word)))return emoji;
      }
    }
  }
  return (category&&subtype&&BY_SUBTYPE[`${category}:${subtype}`])||(category&&BY_CATEGORY[category])||'🎁';
}

export const ALL_MARKET_EMOJI         =[...new Set([...TITLE_RULES.map(([e])=>e),...Object.values(BY_SUBTYPE),...Object.values(BY_CATEGORY),'🎁'])];
