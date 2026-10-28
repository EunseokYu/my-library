// 나의 서재 — 원작(작품) 판별. 서재 앱(js/app.js)과 관리자 페이지(js/admin.js)가 함께 씁니다.
// v2.15.0에서 js/app.js의 같은 코드를 그대로 옮겼습니다(내용 변경 없음). 이 규칙을 바꾸면 work_cache의 작품 키가 달라지니 조심하세요.
function titleKey(s){return String(s||'').normalize('NFKC').toLocaleLowerCase('ko').replace(/[《》〈〉『』「」“”"'‘’]/g,'').replace(/[\s.,·:：!?！？()\[\]{}\-–—_]/g,'')}
// Remove only edition markers in titles; never drop arbitrary trailing digits in unrelated works.
function baseWorkTitle(s){
 let t=String(s||'').normalize('NFKC').trim();
 t=t.replace(/^\s*[\[【(（](?:세계문학(?:전집)?|문학전집|고전문학|양장본|문고판)[^\]】)）]*[\]】)）]\s*/i,'');
 t=t.replace(/\s*[\[【(（][^\]】)）]*(?:완역|무삭제|개정|합본|세트|특별|양장|전집|상권|하권|제?[12]권)[^\]】)）]*[\]】)）]\s*$/gi,'');
 t=t.replace(/\s*[:：\-–—]\s*(?:상|하|[12]|제?[12]권|합본(?:판)?|전[12]권|세트|완역본|개정판)\s*$/i,'');
 t=t.replace(/\s*(?:\(?(?:제?[12]권|[12]권|[12]부|상권|하권|상|하|합본(?:판)?|전[12]권|세트|전권|완역본)\)?)\s*$/i,'');
 // Common volume suffix with no whitespace (죄와벌1, 죄와 벌2).
 t=t.replace(/(?<=[가-힣])\s*[12]\s*$/,'');
 return t.trim()||String(s||'').trim();
}
function authorKey(s){
 const a=cleanAuthor(s).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 if(/도스토|도스또|достоев|dostoev|dostoyev|dostoiev|dostoeff/.test(a))return '도스토예프스키';
 return a;
}
// 작품 검색 단계의 표시만 정제합니다. 원본 판본명은 editionTitle로 보존합니다.
function cleanDisplayTitle(raw){
 let t=String(raw||'').normalize('NFKC').trim();
 t=t.replace(/\s*[\(（\[【][^\)）\]】]*[\)）\]】]\s*/g,' ').trim();
 t=t.replace(/\s*(?:[:：\-–—]\s*)?(?:합본(?:판)?|세트|양장(?:본)?|개정(?:판)?|완역(?:본)?|상권|하권|[12]권|제?[12]권|전[12]권|상|하)\s*$/i,'').trim();
 t=t.replace(/(?<=[가-힣])\s*[12]\s*$/,'').trim();
 return t||String(raw||'').trim();
}
function cleanAuthor(raw){
 let a=String(raw||'').normalize('NFKC').trim();
 a=a.split(/\s*(?:,|;|；|\/|\||·|\n|＆|&)\s*/)[0];
 // v2.12.0: 괄호 속 원어 이름·역할 표기는 모두 뗍니다. 예: 헤르만 헤세(Hermann Hesse)
 a=a.replace(/\s*[\(（][^)）]*[\)）]/g,'');
 a=a.replace(/\s*(?:지은이|글쓴이|엮은이|그린이|옮긴이|역자|저자|지음|저\.?|글|원작|엮음|편저|편집|번역|옮김|그림|해설)\s*$/gi,'').trim();
 a=a.replace(/^(?:지은이|저자|글쓴이)\s*[:：]\s*/,'').trim();
 const k=a.toLocaleLowerCase().replace(/[^\p{L}]/gu,'');
 const aliases=[[/도스토|도스또|dostoev|dostoyev|dostoiev|достоев/,'표도르 도스토예프스키'],[/나쓰메소세키|나츠메소세키|natsumesoseki|夏目漱石/,'나쓰메 소세키'],[/헤밍웨이|hemingway/,'어니스트 헤밍웨이'],[/헤르만헤세|^헤세$|hesse/,'헤르만 헤세'],[/알베르카뮈|^카뮈$|camus/,'알베르 카뮈'],
  [/생텍쥐페리|생떽쥐뻬리|생텍쥐베리|exup[eé]ry/,'앙투안 드 생텍쥐페리'],[/^(?:레프|레오|리오|lev|leo)?(?:톨스토이|tolstoy|tolstoi)$/,'레프 톨스토이'],[/^(?:프란츠)?카프카$|kafka/,'프란츠 카프카'],[/^(?:조지)?오웰$|orwell/,'조지 오웰'],
  [/셰익스피어|세익스피어|쉐익스피어|shakespeare/,'윌리엄 셰익스피어'],[/^(?:요한볼프강폰|요한볼프강)?괴테$|goethe/,'요한 볼프강 폰 괴테'],[/^(?:프리드리히)?니체$|nietzsche/,'프리드리히 니체'],[/무라카미하루키|harukimurakami|murakamiharuki/,'무라카미 하루키'],
  [/다자이오사무|dazaiosamu|osamudazai/,'다자이 오사무'],[/^(?:빅토르|빅토어)?위고$|victorhugo/,'빅토르 위고'],[/서머싯몸|서머셋몸|서머셋모옴|somersetmaugham/,'서머싯 몸'],[/피츠제럴드|피츠제랄드|fitzgerald/,'F. 스콧 피츠제럴드'],
  [/제인오스틴|janeausten/,'제인 오스틴'],[/샐린저|salinger/,'J. D. 샐린저'],[/마르케스|marquez|márquez/,'가브리엘 가르시아 마르케스'],[/쿤데라|kundera/,'밀란 쿤데라'],[/히가시노게이고|higashino/,'히가시노 게이고'],[/버지니아울프|virginiawoolf/,'버지니아 울프']];
 for(const [re,name] of aliases)if(re.test(k))return name;
 return a;
}
// v2.12.0: 작품 이름 정리. 판본 낱말(에디션·초판본·리커버·양장…)과 부제(":" 또는 " - " 뒤)를 떼어 같은 작품을 하나로 묶습니다.
// 판본 낱말은 제목 앞뒤에 이어 붙은 묶음만 떼고, 그 묶음에 판본을 뜻하는 낱말이 하나 이상 있을 때만 뗍니다("블랙 스완"의 "블랙"은 남습니다).
// 판본을 뜻하는 낱말 조각. 붙어 쓴 묶음(블랙에디션)과 같은 저자 작품끼리 합칠 때 씁니다.
const ED_MORPHS='\\d+주년|\\d+|세계문학전집|세계문학|문학전집|고전문학|전집|에디션|edition|블랙|화이트|골드|실버|리커버|특별판|한정판|기념판|소장판|보급판|개정증보판|개정판|증보판|초판본|초판|양장본|양장|반양장|완역본|완역|무삭제|합본|큰글자책|큰글자|미니북|세트|영문판|한글판|오리지널|표지디자인|기념|특별|한정|스페셜|리미티드|디럭스|클래식|hardcover|paperback|권|판|본';
const ED_ANCHOR_MORPHS='전집|에디션|edition|리커버|특별판|한정판|기념판|소장판|보급판|개정|증보|초판|양장|완역|무삭제|합본|큰글자|미니북|세트|영문판|한글판|표지디자인|hardcover|paperback';
function workBaseTitle(raw){
 const ANCHOR=/^(?:(?:\d+주년)?(?:기념|특별|한정|소장|보급|신장|개정|개정증보|증보|완역|무삭제|무삭제완역|리커버|일러스트|컬러|포켓|문고|양장|반양장|큰글자|큰글씨|합본|특장|초|신|영문|국문|원전|스페셜|리미티드|디럭스|컬렉터스|아트|에센셜|한정특별)(?:판|본|판본|에디션)|에디션|edition|editions|초판본|미니북|세트|전집|양장|양장본|합본|완역|완역본|무삭제|무삭제판|큰글자책|리커버|한영대역|영한대역|hardcover|paperback)$/i;
 const MOD=/^(?:\d+주년|\d{4}년?|기념|특별|한정|오리지널|original|스페셜|special|리미티드|limited|디럭스|deluxe|블랙|black|화이트|white|골드|gold|실버|silver|레드|블루|그린|네이비|핑크|퍼플|클래식|classic|뉴|new|한글판|영문판|원서|표지|표지디자인|디자인|초판|기념판)$/i;
 // v2.13.0: 띄어 쓰지 않은 판본 낱말 묶음(세계문학전집, 블랙에디션, 무삭제완역본…)과 판본 묶음 속 숫자(전집 101, 1권)도 판본 표시로 봅니다.
 const GLUE=new RegExp('^(?:'+ED_MORPHS+')+$','i'),GLUE_ANCHOR=new RegExp(ED_ANCHOR_MORPHS,'i');
 const tok=w=>w.replace(/^[,.·+\-–—:：…]+|[,.·+\-–—:：…]+$/g,'');
 const isAnchor=w=>{const x=tok(w);return ANCHOR.test(x)||(GLUE.test(x)&&GLUE_ANCHOR.test(x))};
 const isEd=w=>{const x=tok(w);return !!x&&(isAnchor(w)||MOD.test(x)||GLUE.test(x)||/^\d{1,4}$/.test(x))};
 let t=String(raw||'').normalize('NFKC');
 // 〈 〉《 》 로 감싼 부분(총서·판본 이름)은 지우되, 그 부분이 제목 전부이면 괄호만 뗍니다.
 {const cut=t.replace(/\s*[〈《][^〉》]*[〉》]\s*/g,' ').trim();t=cut?cut:t.replace(/[〈〉《》]/g,'')}
 // 잘려서 닫히지 않은 괄호: "데미안(세계문학전집101" → "데미안"
 {const cut=t.replace(/\s*[\(（\[【][^\)）\]】]*$/,'').replace(/[.…]+$/,'').trim();if(titleKey(cut).length>=1)t=cut}
 t=cleanDisplayTitle(baseWorkTitle(t));
 const sub=t.match(/^(.+?)\s*(?:[:：]|\s[-–—]\s)\s*\S.*$/);
 if(sub&&titleKey(sub[1]).length>=2)t=sub[1].trim();
 const w=t.split(/\s+/).filter(Boolean);
 let z=w.length,hit=false;while(z>1&&isEd(w[z-1])){if(isAnchor(w[z-1]))hit=true;z--}
 const end=hit?z:w.length;
 let a=0;hit=false;while(a<end-1&&isEd(w[a])&&!/^\d+$/.test(tok(w[a]))){if(isAnchor(w[a]))hit=true;a++}
 t=w.slice(hit?a:0,end).join(' ');
 t=cleanDisplayTitle(baseWorkTitle(t));
 return t||String(raw||'').trim();
}
function canonicalWork(b){
 let t=workBaseTitle(b.title),k=titleKey(t),a=authorKey(cleanAuthor(b.author));
 // Named literary work aliases: only use the known author or an explicitly matching search query.
 if((/^죄와?벌$/.test(k)||/^죄와벌(?:전집)?$/.test(k)) && (a==='도스토예프스키'||!a)){
  return {key:'죄와벌',title:'죄와 벌',author:'표도르 도스토예프스키',authorKey:'도스토예프스키'};
 }
 return {key:k,title:t,author:cleanAuthor(b.author),authorKey:a};
}
function workKeyOf(b){
 try{const c=canonicalWork({title:b.workTitle||b.title,author:b.author});return c.key&&c.authorKey?`${c.key}|${c.authorKey}`.replace(/["\\]/g,'').slice(0,200):''}catch{return ''}
}
export {titleKey,baseWorkTitle,authorKey,cleanDisplayTitle,cleanAuthor,ED_MORPHS,ED_ANCHOR_MORPHS,workBaseTitle,canonicalWork,workKeyOf};
