// 나의 서재 — 앱 코드 (T2에서 index.html에서 옮김. 실행 순서·IIFE 그대로)
(()=>{
'use strict';
const THEME_KEY='my-library-theme-v1', KEY='mnemosyne-library-v1', statuses={want:'읽고 싶은 책',reading:'읽는 중',done:'완독'}, colors=['#2f4a3d','#38503c','#44533f','#5e6e55','#6c7a5e','#a4ae95','#5a2e33','#6b3438','#6e3f36','#8c5545','#9a6650','#c49c88','#26344a','#2f3d4f','#384656','#56657a','#66758a','#a6b0bd','#4a3527','#5a4130','#6a4d36','#8a6a4c','#9c7f5e','#d3c2a2','#3f2d3f','#4d3647','#574250','#786273','#857870','#b9a9b1'];
let apiResults=[],apiPending=false,apiError='',apiNote='',theme='ivory',apiStage='works',apiActiveWork='',apiQueryText='',apiBindSource='';
const apiCache=new Map();let apiCooldownUntil=0;const API_CACHE_MS=30*60*1000;
function getCachedSearch(key){const item=apiCache.get(key);if(item&&Date.now()-item.time<API_CACHE_MS)return item.books;apiCache.delete(key);return null}
function cacheSearch(key,items){if(apiCache.size>=30)apiCache.delete(apiCache.keys().next().value);apiCache.set(key,{time:Date.now(),books:items})}
let books=[],view='library',filter='all',search='',sort='new',dialog=null,editing=null,importCandidate=null,tagFilter='';
const $=s=>document.querySelector(s);
window.addEventListener('error',e=>{const el=document.getElementById('fatal-error');if(el){el.hidden=false;el.textContent='앱 실행 오류: '+(e.message||'알 수 없는 오류')+' — 새로고침 후에도 반복되면 이 메시지를 알려주세요.'}});
window.addEventListener('unhandledrejection',e=>{const el=document.getElementById('fatal-error');if(el){el.hidden=false;el.textContent='비동기 처리 오류: '+(e.reason?.message||String(e.reason))}});

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validUrl=u=>{if(!u)return true;try{const x=new URL(u);return x.protocol==='https:'&&(['notion.so','www.notion.so'].includes(x.hostname)||x.hostname.endsWith('.notion.site'))}catch{return false}};
const safeColor=c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c)?c:colors[0];
const safeCover=u=>{try{let x=new URL(u);return x.protocol==='https:'&&['books.google.com','books.google.co.kr','books.googleusercontent.com','covers.openlibrary.org'].includes(x.hostname)||x.protocol==='https:'&&(x.hostname.endsWith('.googleusercontent.com')||x.hostname.endsWith('.kakaocdn.net')||x.hostname.endsWith('.daumcdn.net'))?x.href:''}catch{return ''}};
const themeNames={ivory:'아이보리 · 월넛',forest:'세이지 · 포레스트',night:'잉크 · 다크',rose:'로즈 · 샌드'};
function setTheme(t){if(!themeNames[t])return;theme=t;document.documentElement.dataset.theme=t;try{localStorage.setItem(THEME_KEY,t)}catch{flash('테마 설정을 저장하지 못했습니다.')}}
function initTheme(){try{const t=localStorage.getItem(THEME_KEY);if(themeNames[t])theme=t}catch{}document.documentElement.dataset.theme=theme}
const coverHTML=(b,cls='cover')=>safeCover(b.coverUrl)?`<div class="${cls} photo-cover" style="--color:${spineColorOf(b)}"><img src="${esc(safeCover(b.coverUrl))}" alt="${esc(b.title)} 표지" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="cover-fallback" style="display:none"><strong>${esc(b.title)}</strong><small>${esc(b.author||'작가 미상')}</small></div></div>`:`<div class="${cls}${isLightColor(spineColorOf(b))?' light':''}" style="--color:${spineColorOf(b)}"><div class="cover-motif">${spineMotif(b,46)||'✦'}</div><strong>${esc(b.title)}</strong><small>${esc(b.author||'작가 미상')}</small><div>MY LIBRARY</div></div>`;

const id=()=>globalThis.crypto?.randomUUID?.()||('book-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const cleanDate=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v))?v:new Date().toISOString();
// 장르 태그는 제목·소개·번역자 정보로 추정합니다. 나중에 태그 단위 추천을 붙일 때 이 결과를 그대로 쓰면 됩니다.
const GENRE_RULES=[
 ['SF',['sf','공상과학','우주선','외계','로봇','안드로이드','인공지능','사이보그','디스토피아','가상현실','타임머신','시간여행']],
 ['추리·미스터리',['추리','미스터리','탐정','살인','범인','연쇄','사건의 진상','수사','트릭','형사']],
 ['스릴러',['스릴러','서스펜스','쫓기','음모','납치','복수']],
 ['판타지',['판타지','마법','마법사','마녀','드래곤','용과','요정','기사단','이세계']],
 ['공포',['공포','호러','괴담','유령','저주','귀신']],
 ['로맨스',['로맨스','연애','사랑에 빠','첫사랑','연인','애틋']],
 ['역사',['역사','조선','고려','근대사','왕조','전쟁의','식민','사료','고대']],
 ['고전',['고전','세계문학','명작','19세기','18세기','불후의']],
 ['성장',['성장소설','청춘','소년','소녀','사춘기','어른이 되','자아를 찾']],
 ['가족',['가족','어머니','아버지','자매','형제','할머니','3대']],
 ['철학',['철학','존재론','윤리','형이상학','사유의','인식론','실존','니체','소크라테스']],
 ['심리',['심리학','무의식','트라우마','애착','자존감','심리적']],
 ['과학',['과학','물리학','양자','진화','유전자','뇌과학','우주의 기원','생물학','화학']],
 ['경제·경영',['경제','경영','투자','주식','마케팅','기업','자본주의','금융','스타트업']],
 ['자기계발',['자기계발','습관','성공하는','동기부여','목표 달성','생산성','시간 관리']],
 ['사회',['사회학','정치','불평등','계급','노동','페미니즘','차별','공동체','빈곤']],
 ['에세이',['에세이','산문집','산문','기록한 글','일상의 기록']],
 ['시',['시집','시인의','詩','연작시']],
 ['예술',['미술','회화','건축','음악가','영화사','디자인','사진집']],
 ['여행',['여행기','기행','순례','배낭','여정을']],
 ['자연',['자연','생태','숲과','동물의','식물','바다의','환경']],
 ['전기·회고',['자서전','회고록','평전','일대기','인생을 돌아']]
];
function autoTags(b){
 const text=`${b.workTitle||''} ${b.title||''} ${b.summary||''}`.normalize('NFKC').toLocaleLowerCase();
 const hits=[];
 if(text.trim()){
  for(const [tag,words] of GENRE_RULES){
   // 긴 낱말일수록 그 장르에만 쓰이는 말이라 가중치를 더 줍니다.
   let n=0;for(const w of words)if(text.includes(w))n+=w.length>=3?2:1;
   if(n)hits.push([tag,n]);
  }
 }
 hits.sort((a,b)=>b[1]-a[1]);
 // 특징적인 낱말이 걸린 장르만 남기고, 한 낱말만 스친 장르는 버립니다.
 let out=hits.filter(x=>x[1]>=3).slice(0,2).map(x=>x[0]);
 if(!out.length&&hits.length)out=[hits[0][0]];
 if(String(b.translator||'').trim()&&!out.includes('번역서'))out.push('번역서');
 return out;
}
// 사용자가 직접 적은 태그가 먼저, 자동 분석 태그가 뒤에 붙습니다.
function tagsOf(b){
 const out=[];
 const ai=Array.isArray(b.aiTags)&&b.aiTags.length?[...b.aiTags,...(String(b.translator||'').trim()?['번역서']:[])]:autoTags(b);
 for(const t of [...(Array.isArray(b.tags)?b.tags:[]),...ai]){
  const v=String(t||'').trim();
  if(v&&!out.includes(v))out.push(v);
 }
 return out.slice(0,10);
}
const MOTIF_TAGS=new Set(['path','circle','ellipse','line','polyline','polygon','rect']);
const MOTIF_ATTRS=new Set(['d','cx','cy','r','rx','ry','x','y','x1','y1','x2','y2','width','height','points','transform','stroke-width','stroke-linecap','stroke-linejoin','opacity']);
// AI가 돌려준 마크업은 신뢰하지 않습니다. 허용된 도형과 속성만 남기고 전부 버립니다.
// 같은 그림을 매번 다시 검사하지 않도록 결과를 기억합니다(입력이 같으면 결과도 같습니다).
const motifCleanCache=new Map();
function sanitizeMotifSvg(raw){
 const key=String(raw||'');
 if(motifCleanCache.has(key))return motifCleanCache.get(key);
 const out=sanitizeMotifSvgRaw(key);
 if(motifCleanCache.size>2000)motifCleanCache.clear();
 motifCleanCache.set(key,out);
 return out;
}
function sanitizeMotifSvgRaw(raw){
 const text=String(raw||'').slice(0,4000).trim();
 if(!text)return '';
 if(typeof DOMParser==='undefined')return '';
 if(/<\s*\/?\s*(script|style|foreignobject|image|use|a|animate|animatetransform|set|handler|iframe|audio|video|text|tspan)\b/i.test(text))return '';
 if(/\son\w+\s*=/i.test(text))return '';
 const collect=doc=>{
  const out=[];
  for(const el of Array.from(doc.querySelectorAll('*'))){
   const tag=(el.tagName||'').toLowerCase();
   if(!MOTIF_TAGS.has(tag))continue;
   const attrs=[];
   for(const a of Array.from(el.attributes||[])){
    const name=(a.name||'').toLowerCase();
    if(!MOTIF_ATTRS.has(name))continue;
    const v=String(a.value||'').slice(0,900);
    if(!v||/[<>"]/.test(v)||/url\(|javascript:|data:|expression/i.test(v))continue;
    attrs.push(`${name}="${v}"`);
   }
   if(!attrs.length)continue;
   out.push(`<${tag} ${attrs.join(' ')}/>`);
   if(out.length>=14)break;
  }
  return out.join('');
 };
 try{
  const xml=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">'+text+'</svg>','image/svg+xml');
  if(!xml.getElementsByTagName('parsererror').length){const got=collect(xml);if(got)return got}
 }catch{}
 try{
  const html=new DOMParser().parseFromString('<svg>'+text+'</svg>','text/html');
  return collect(html.body||html);
 }catch{return ''}
}
const AI_KEY_STORE='my-library-gemini-key-v1';
// Google AI Studio 무료 등급에서 쓸 수 있는 모델입니다. 바꾸려면 이 줄만 고치면 됩니다.
const AI_MODEL='gemini-3.8-flash';
// 소개 정리처럼 가벼운 일은 가장 빠른 모델로 처리합니다.
const AI_FAST_MODEL='gemini-3.5-flash-lite';
// v2.14.1: 상징 SVG 코드도 빠른 모델이 씁니다(무료 한도가 더 넉넉함). 위의 AI_MODEL은 앱이 더 이상 부르지 않습니다.
const AI_DRAW_MODEL=AI_FAST_MODEL;
const getAiKey=()=>{try{return(localStorage.getItem(AI_KEY_STORE)||'').trim()}catch{return ''}};
let aiPending=false;
function extractSvgInner(text){
 let t=String(text||'').replace(/```[a-zA-Z]*/g,'').trim();
 const m=t.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
 return m?m[1]:t;
}
// v2.14.1까지의 규칙. 이제는 '상징 비교 시험'에서 새 규칙과 나란히 비교할 때만 씁니다.
const MOTIF_DRAW_RULES_V1=`출력 규칙:
- 좌표계는 viewBox "0 0 40 40" 기준이며, 도형은 대략 4~36 범위 안에 들어와야 합니다
- <svg> 태그는 쓰지 말고 내부 도형 요소만 출력하세요
- <path>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <rect>만 사용하세요
- 요소는 최대 6개이고 모두 자체 닫힘 형태여야 합니다 (<path d="..."/>)
- fill, stroke, style, class, id 속성은 넣지 마세요. 선 색과 굵기는 바깥에서 지정합니다
- 글자나 <text>는 절대 쓰지 마세요
- 설명이나 코드 블록 없이 도형 요소만 출력하세요

출력 예시: <circle cx="20" cy="15" r="7"/><path d="M20 22v13"/>`;
// v2.14.2: 책등(약 22px)에서도 알아보게 '적게, 크게, 특징 하나'로 그리게 합니다. 잘 그린 예는 실제 서재의 도끼·알·티백입니다.
const MOTIF_DRAW_RULES=`[좋은 상징의 조건 — 책등에서는 약 22px로 아주 작게 보입니다]
- 도형은 1~4개만 씁니다. 적을수록 좋습니다
- 사물의 큰 윤곽 하나가 칸의 대부분(대략 6~34 범위)을 차지하게 크게 그립니다
- 그 사물임을 알아보게 하는 특징은 하나만 더합니다(예: 알의 금, 티백의 줄과 꼬리표, 도끼의 날)
- 사물 전체를 다 그리지 말고, 알아보는 데 꼭 필요한 부분만 그립니다
- 반지름 2 미만의 작은 원이나 점, 격자, 같은 모양의 반복(잎 여러 장, 칸 여러 줄)은 쓰지 않습니다
- 곧은 사물은 비스듬히 놓아도 좋고, 둥근 사물은 곡선(path의 c, a)으로 매끄럽게 그립니다

[잘 그린 예]
도끼 — <path d="M10 33 27 7M22 8c5-3 10-2 13 1l-7 9-8-4"/>
알 — <path d="M20 7c-6.3 0-10.8 10-10.8 18a10.8 12 0 0 0 21.6 0c0-8-4.5-18-10.8-18Z"/><path d="m15 23 4-3 3 3 4-4"/>
티백 — <path d="M12 7h16v16H12z"/><path d="M20 7V4"/><path d="M20 23v10"/><path d="M17 33h6v4h-6z"/>

[피할 예] 모니터에 작은 점 버튼 붙이기, 주판처럼 칸을 여러 줄 긋기, 같은 잎을 네 장 반복하기

출력 규칙:
- 좌표계는 viewBox "0 0 40 40" 기준이며, 도형은 대략 4~36 범위 안에 들어와야 합니다
- <svg> 태그는 쓰지 말고 내부 도형 요소만 출력하세요
- <path>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <rect>만 사용하세요
- 요소는 최대 4개이고 모두 자체 닫힘 형태여야 합니다 (<path d="..."/>)
- fill, stroke, style, class, id, transform 속성은 넣지 마세요. 선 색과 굵기는 바깥에서 지정합니다
- 글자나 <text>는 절대 쓰지 마세요
- 설명이나 코드 블록 없이 도형 요소만 출력하세요`;
// 상징이 정해져 있으면 그 사물을 그리는 데만 집중시키고, 없으면 예전처럼 직접 고르게 합니다.
function motifPrompt(title,author,summary,idea,rules=MOTIF_DRAW_RULES){
 if(idea){
  const [thing,why]=String(idea).split(/\s*[—–-]\s*/);
  return `책등에 새길 아주 단순한 선 아이콘(line icon)을 SVG로 그려 주세요.

그릴 사물: ${thing}
이 사물을 고른 이유: ${why||'(없음)'}
책: ${title}${author?` — ${author}`:''}

그릴 사물을 한눈에 알아볼 수 있게, 그 사물의 가장 특징적인 윤곽만 선 몇 개로 그리세요. 다른 사물을 덧붙이지 말고 장식도 넣지 마세요. 좌우 대칭이 아니어도 되지만 화면 가운데에 놓이게 하세요.

${rules}`;
 }
 return `다음 책의 핵심 주제를 나타내는, 아주 단순한 선 아이콘(line icon)을 SVG로 그려 주세요.

책 제목: ${title}
저자: ${author||'(미상)'}
책 소개: ${summary||'(제공되지 않음)'}

이 책을 읽은 사람이 보면 "아, 그 책"이라고 알아볼 만한 상징적인 사물이나 형상 하나를 고르세요. 책 표지를 베끼지 말고, 작품의 내용에서 나온 상징이어야 합니다.

${MOTIF_DRAW_RULES}`;
}
const MOTIF_IDEA_RULES=`[motifIdea 규칙 — 책등에 새길 상징]
- 작은 선 아이콘으로 그릴 사물 하나와 고른 이유를 "사물 — 이유" 형식, 30자 이내로 씁니다. 예: "도끼 — 라스콜니코프의 범행", "알 — 새는 알을 깨고 나온다", "청새치 — 노인이 홀로 맞선 거대한 물고기"
- 사물은 선 몇 개로 그릴 수 있는 구체적인 것 하나입니다. 사람 얼굴, 글자, 넓은 풍경, 추상 개념은 피합니다
- 아주 작게 새겨도 윤곽만으로 알아볼 수 있는 단순한 사물을 고릅니다. 부품이 많은 기계·도구, 나무 전체, 여러 개가 모인 물건은 피합니다
- 그 작품을 읽은 사람이 "아, 그 책" 할 만큼 작품 안에서 중요한 사물을 고릅니다. 제목에 나온 낱말을 그대로 그리는 것은 마땅한 것이 없을 때만 합니다
- 결말이나 반전을 드러내는 사물은 고르지 않습니다`;
function ideaPrompt(title,author,summary){
 return `아래 책의 책등에 새길 상징을 정해 JSON 하나만 출력하세요.

제목: ${title}
저자: ${author||'(미상)'}
소개: ${summary||'(없음)'}

[출력 형식]
{"motifIdea":"사물 — 이유"}

${MOTIF_IDEA_RULES}`;
}
function cleanIdea(v){
 const t=String(v||'').replace(/\s+/g,' ').trim().replace(/^["'“‘「『]+|["'”’」』]+$/g,'').trim().slice(0,60);
 return t&&!t.includes('?')&&!/[<>]/.test(t)?t:'';
}
// ---------- Gemini 무료 한도 (v2.5.2) ----------
// 하루 한도를 다 쓴 모델은 초기화 시각까지 요청을 아예 보내지 않습니다. 앱을 다시 열어도 그 시각 전에는 조용히 쉽니다.
// 이 기록은 별도 항목에만 저장되며 책 데이터·백업과는 관계없습니다.
const AI_PAUSE_KEY='my-library-ai-pause-v1';
const AI_FEATURE_NAME=m=>m===AI_FAST_MODEL?'소개·상징':m===AI_MODEL?'예전 상징 모델':m;
// v2.14.1: 실패 이유를 짧게 구분해 보여 줍니다.
const FAIL_LABEL={'quota-daily':'무료 사용량 초과','quota-minute':'요청이 잠깐 몰림',auth:'API 키 오류',model:'모델 이름 오류',format:'응답 형식 오류',timeout:'응답 시간 초과',network:'네트워크 오류',server:'AI 서버 오류',other:'오류'};
const STOP_KINDS=['quota-daily','quota-minute','auth','model'];
function aiErrorText(err){return err?.kind==='quota-minute'?'요청이 잠깐 몰렸어요(분당 한도). 1분쯤 뒤에 직접 다시 시도해 주세요.':String(err?.message||'알 수 없는 오류')}
function readPause(){try{const v=JSON.parse(localStorage.getItem(AI_PAUSE_KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}}
function pausedUntil(model){const t=Number(readPause()[model])||0;return t>Date.now()?t:0}
function setPause(model,until){try{const p=readPause();for(const k of Object.keys(p))if(!(Number(p[k])>Date.now()))delete p[k];p[model]=until;localStorage.setItem(AI_PAUSE_KEY,JSON.stringify(p))}catch{}}
function clearPause(){try{localStorage.removeItem(AI_PAUSE_KEY)}catch{}}
// 하루 한도는 미국 태평양 시간 자정에 초기화됩니다. 여유 5분을 더합니다.
function nextQuotaReset(){
 try{
  const now=new Date();
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const offset=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-Math.floor(now.getTime()/1000)*1000;
  return Date.UTC(+p.year,+p.month-1,+p.day+1,0,0,0)-offset+5*60*1000;
 }catch{return Date.now()+6*3600*1000}
}
const fmtWhen=t=>new Date(t).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
const dailyMsg=(model,until)=>`오늘 Gemini 무료 한도(${AI_FEATURE_NAME(model)})를 다 썼어요. ${fmtWhen(until)} 이후에 다시 쓸 수 있어요.`;
// 429 응답이 하루 한도인지 분당 한도인지 구분합니다.
function quotaInfo(body){
 const e=body?.error||{},msg=String(e.message||''),det=Array.isArray(e.details)?e.details:[];
 const ids=det.flatMap(d=>Array.isArray(d?.violations)?d.violations.map(v=>`${v?.quotaId||''} ${v?.quotaMetric||''}`):[]).join(' ');
 const daily=/per ?day|daily/i.test(ids+' '+msg);
 let retryMs=0;for(const d of det){const m=String(d?.retryDelay||'').match(/^([\d.]+)s$/);if(m)retryMs=Math.ceil(parseFloat(m[1])*1000)}
 return {daily,retryMs};
}
// Gemini 공용 호출. 상징 그리기와 책 소개 정리가 같이 씁니다.
async function callGemini(prompt,{json=false,maxTokens=2048,timeoutMs=120000,model=AI_FAST_MODEL,thinking='low'}={}){
 const key=getAiKey();
 if(!key){const e=Error('설정 → AI 기능에서 Gemini API 키를 먼저 저장하세요.');e.kind='auth';throw e}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 const base={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:json?0.4:1,maxOutputTokens:maxTokens}};
 const extra={...base,generationConfig:{...base.generationConfig,thinkingConfig:{thinkingLevel:thinking},...(json?{responseMimeType:'application/json'}:{})}};
 const useModel=model; // v2.14.1: 막혀도 다른 모델로 넘기지 않습니다.
 {const pu=pausedUntil(useModel);if(pu){clearTimeout(timer);const e=Error(dailyMsg(useModel,pu));e.status=429;e.daily=true;e.until=pu;e.paused=true;e.kind='quota-daily';throw e}}
 const send=body=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(useModel)}:generateContent`,{
  method:'POST',signal:controller.signal,
  headers:{'Content-Type':'application/json','x-goog-api-key':key},
  body:JSON.stringify(body)
 });
 try{
  // Gemini 3 계열은 사고 수준 기본값이 high라 느립니다. low로 낮추고, 모델이 그 설정을 모르면 빼고 다시 보냅니다.
  let r=await send(extra);
  if(r.status===400){
   let why='';try{why=(await r.clone().json())?.error?.message||''}catch{}
   const cfgErr=/thinking|unknown name|invalid json payload|response_?mime/i;
   if(cfgErr.test(why)){
    // minimal을 모르는 모델이면 low로 한 번 더 보냅니다. 설정을 통째로 빼면 기본값(high)이 되어 아주 느려지므로 마지막 수단으로만 씁니다.
    if(thinking!=='low'&&/thinking/i.test(why)){
     r=await send({...extra,generationConfig:{...extra.generationConfig,thinkingConfig:{thinkingLevel:'low'}}});
     if(r.status===400){let w2='';try{w2=(await r.clone().json())?.error?.message||''}catch{}if(cfgErr.test(w2))r=await send(base)}
    }else r=await send(base);
   }
  }
  if(!r.ok){
   let body=null;try{body=await r.json()}catch{}
   const detail=String(body?.error?.message||'');
   if(r.status===429){
    const q=quotaInfo(body);
    if(q.daily){const until=nextQuotaReset();setPause(useModel,until);const e=Error(dailyMsg(useModel,until));e.status=429;e.daily=true;e.until=until;e.fresh=true;e.kind='quota-daily';throw e}
    const e=Error('요청이 잠깐 몰렸어요(분당 한도). 1분쯤 뒤에 직접 다시 시도해 주세요.');e.status=429;e.kind='quota-minute';throw e;
   }
   const badKey=(r.status===400&&/API key|API_KEY/i.test(detail))||r.status===401;
   const safe=detail.split(key).join('…').slice(0,120); // 키가 메시지에 섞여 나오지 않게 합니다.
   const e=Error(
    badKey?'API 키가 올바르지 않습니다. 키를 다시 확인하세요.':
    r.status===403?'키가 거부되었습니다(403). 키의 사용 제한 설정을 확인하세요.':
    r.status===404?`AI 모델(${useModel})을 찾을 수 없어요. 모델 이름 오류예요.`:
    'HTTP '+r.status+(safe?' — '+safe:''));
   e.status=r.status;e.kind=badKey||r.status===403?'auth':r.status===404?'model':'server';throw e;
  }
  const data=await r.json();
  if(data.promptFeedback?.blockReason){const e=Error('요청이 안전 필터에 걸렸습니다.');e.kind='format';throw e}
  const cand=data.candidates?.[0];
  const text=(cand?.content?.parts||[]).filter(x=>x&&!x.thought).map(x=>x.text||'').join('');
  if(!text.trim()){const e=Error(cand?.finishReason==='MAX_TOKENS'?'응답이 중간에 잘렸습니다.':'빈 응답을 받았습니다.');e.kind='format';throw e}
  return {text,finish:cand?.finishReason||''};
 }catch(err){
  if(err.name==='AbortError'){const e=Error(`응답이 ${Math.round(timeoutMs/1000)}초 안에 오지 않았습니다.`);e.kind='timeout';throw e}
  if(err instanceof TypeError&&/fetch|network/i.test(err.message||'')){const e=Error('브라우저가 요청을 보내지 못했습니다(네트워크 또는 보안 차단).');e.kind='network';throw e}
  throw err;
 }finally{clearTimeout(timer)}
}
function ensureCustomOption(sel){
 if(sel&&![...sel.options].some(o=>o.value==='custom')){const opt=document.createElement('option');opt.value='custom';opt.textContent=motifNames.custom;sel.insertBefore(opt,sel.options[1]||null)}
}
async function generateMotifWithAI(){
 if(aiPending)return;
 if(!getAiKey()){flash('설정 → AI 기능에서 Gemini API 키를 먼저 저장하세요.');return}
 const title=($('#workTitle')?.value||$('#title')?.value||'').trim();
 if(!title){flash('먼저 책 제목을 입력하거나 검색으로 불러오세요.');return}
 const author=($('#author')?.value||'').trim(),summary=($('#aiSummary')?.value||$('#summary')?.value||'').trim();
 const stored=editing?books.find(x=>x.id===editing):null;
 aiPending=true;
 // 이미 이 상징으로 그렸는데 또 누르면, 다른 상징을 새로 고릅니다.
 if($('#customMotif')?.value&&$('#motifDrawnFor')?.value&&$('#motifDrawnFor').value===$('#motifIdea')?.value){const f=$('#motifIdea');if(f)f.value=''}
 updateMotifPreview();
 try{
  // 1단계: 가벼운 모델이 상징을 말로 정합니다. 이미 정해 둔 상징이 있으면 그대로 씁니다.
  let idea=cleanIdea($('#motifIdea')?.value||'');
  if(!idea){
   const r=await callGemini(ideaPrompt(title,author,summary),{json:true,model:AI_FAST_MODEL,thinking:'minimal',maxTokens:400});
   try{idea=cleanIdea(jsonFrom(r.text).motifIdea)}catch{}
   if(!idea)throw Error('상징을 정하지 못했습니다. 한 번 더 시도해 보세요.');
   const f=$('#motifIdea');if(f)f.value=idea;
  }
  const sel=$('#motif');ensureCustomOption(sel);if(sel)sel.value='custom';
  if(stored){
   // 2단계(저장된 책): 그리기는 뒤의 큐에 맡깁니다. 이 창을 닫아도 계속 그립니다.
   books=books.map(x=>x.id===stored.id?normalize({...x,motifIdea:idea,motifDrawnFor:'',motif:'custom'}):x);
   persist(books);
   const df=$('#motifDrawnFor');if(df)df.value='';
   formInit={...formInit,customMotif:$('#customMotif')?.value||'',motifIdea:idea,motifDrawnFor:''};
   aiPending=false;
   queueDraw([stored.id],{front:true});
   const now=books.find(x=>x.id===stored.id);
   flash(now&&now.motifDrawnFor===idea?`「${idea}」 상징을 붙였어요.`:`「${idea}」 상징을 뒤에서 그리고 있어요. 창을 닫아도 이어서 그립니다.`);
   return;
  }
  // 2단계(아직 저장하지 않은 새 책): 이 화면에서 바로 그립니다. 내장 아이콘이 있으면 호출하지 않습니다.
  updateMotifPreview();
  const inner=instantMotif({id:'',motifIdea:idea})||await drawMotif(title,author,summary,idea);
  const field=$('#customMotif');if(field)field.value=inner;
  const drawnFor=$('#motifDrawnFor');if(drawnFor)drawnFor.value=idea;
  flash('상징을 만들었어요. 마음에 들지 않으면 다시 눌러 보세요.');
 }catch(err){
  console.error('[나의 서재] 상징 생성 실패',err);
  flash('상징 생성 실패: '+err.message);
 }finally{aiPending=false;updateMotifPreview()}
}

// ---------- 책 소개 정리 (요약 · 태그) ----------
// 태그는 이 목록 안에서만 고릅니다. 나중에 태그 단위 추천을 붙일 때 이름이 흔들리지 않도록 고정해 둡니다.
const TAG_VOCAB={
 장르:['SF','추리·미스터리','스릴러','판타지','공포','로맨스','역사','고전','성장','가족','철학','심리','과학','경제·경영','자기계발','사회','에세이','시','예술','여행','자연','전기·회고','종교','교육','요리','건강','만화·그래픽노블'],
 지역:['한국문학','일본문학','중국문학','영미문학','프랑스문학','독일어권문학','러시아문학','스페인어권문학','이탈리아문학','동유럽문학'],
 형식:['장편소설','단편집','희곡','논픽션','인문교양']
};
const TAG_ALL=new Set([...Object.values(TAG_VOCAB).flat(),'번역서']);
let aiBusy=new Set(),batchRunning=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ANALYSIS_RULES=()=>`[summary 규칙 — 읽고 싶어지게 쓰는 짧은 소개]
- 3~4문장, 200~260자로 씁니다. 담백하지만 다음 문장이 궁금해지게 씁니다
- 이 순서를 따릅니다
  1) 첫 문장은 독자를 붙잡는 한 줄입니다. 작가나 작품의 무게를 보여 주는 사실 하나로 엽니다. 예: 노벨문학상·부커상·퓰리처상 같은 주요 수상, 널리 알려진 인물이 아꼈거나 영향을 받았다고 공개적으로 밝힌 일, 영화·드라마로 옮겨진 일, 한 시대나 장르를 바꿨다고 평가받는 일
  2) 이어서 이야기가 시작되는 상황만 씁니다. 주인공이 누구이고 어디서 무엇을 마주하는지까지만 씁니다
  3) 마지막 문장은 이 책이 붙드는 긴장이나 주제를 평서문으로 짚습니다. 예: "그 선택의 무게가 소설 전체를 끌고 간다." 답이나 결말은 주지 않습니다
- 첫 문장의 사실은 널리 알려져 확실한 것만 씁니다. 수상명·연도·인물을 조금이라도 확신하지 못하면 그 사실은 쓰지 말고, 작품이 다루는 주제의 매력으로 첫 문장을 엽니다. 없는 수상이나 지어낸 일화는 절대 넣지 않습니다
- 무명이거나 잘 모르는 책이면 첫 문장을 사실 대신 이야기의 가장 흥미로운 지점으로 엽니다
- "필독서", "전 세계가 열광한", "역대급", "강력 추천" 같은 광고 문구, 판매 부수, 전집 번호, 판본·번역 자랑, 옮긴이 약력은 쓰지 않습니다

[문체 — 반드시 지킵니다]
- 모든 문장을 "~다."로 끝나는 한다체 평서문으로 씁니다. 예: 시작한다, 그린다, 남는다, 사람이다
- 물음표(?)는 한 번도 쓰지 않습니다. 의문문으로 끝나는 문장이 하나도 없어야 합니다
- "~까", "~요", "~습니다", "~죠", "~네" 로 끝내지 않습니다

[스포일러 금지 — 가장 중요한 규칙]
- 이야기 초반에 드러나는 설정까지만 씁니다
- 결말, 반전, 범인이나 정체, 누가 죽거나 살아남는지, 관계가 어떻게 끝나는지, 중반 이후의 사건은 암시조차 하지 않습니다
- "결국", "마침내", "끝내", "비극적 결말", "충격적인 진실" 처럼 전개를 짐작하게 하는 표현도 쓰지 않습니다
- 제공된 소개에 스포일러가 들어 있어도 옮기지 않습니다
- 판단이 서지 않는 내용은 빼는 쪽을 택합니다

${MOTIF_IDEA_RULES}

[출처 규칙]
- 제공된 소개는 중간에 잘려 있습니다. 이 작품을 확실히 아는 경우에만 당신의 지식으로 보완하고, 모르는 책이면 제공된 내용만으로 쓰며 지어내지 않습니다

[tags 규칙]
- 아래 목록에서만 1~4개 고릅니다. 목록에 없는 말은 쓰지 않습니다
- 장르: ${TAG_VOCAB.장르.join(', ')}
- 지역(문학 작품일 때만): ${TAG_VOCAB.지역.join(', ')}
- 형식: ${TAG_VOCAB.형식.join(', ')}
`;
const bookBlock=b=>`제목: ${b.workTitle||b.title}
판본 제목: ${b.title}
저자: ${b.author||'(미상)'}
번역자: ${b.translator||'(없음)'}
출판사: ${b.publisher||'(미상)'}
출판사 제공 소개(앞부분만 잘려 있음): ${b.summary||'(없음)'}`;
function analysisPrompt(b){
 return `당신은 서점의 책 큐레이터입니다. 아래 책 정보를 읽고 JSON 하나만 출력하세요.

[책 정보]
${bookBlock(b)}

[출력 형식]
{"summary":"...","tags":["..."],"motifIdea":"사물 — 이유"}

${ANALYSIS_RULES()}`;
}
function analysisPromptMany(list){
 return `당신은 서점의 책 큐레이터입니다. 아래 ${list.length}권을 각각 정리해 JSON 하나만 출력하세요.

${list.map((b,i)=>`[책 ${i+1}]\n${bookBlock(b)}`).join('\n\n')}

[출력 형식]
{"items":[{"n":1,"summary":"...","tags":["..."],"motifIdea":"사물 — 이유"}, ...]}
- 책마다 하나씩, n에 책 번호를 넣어 모두 ${list.length}개를 출력합니다

${ANALYSIS_RULES()}`;
}
// 문체 검사: 모든 문장이 "~다."로 끝나야 하고 물음표가 없어야 합니다.
function splitSentences(t){return (String(t).match(/[^.!?。]+[.!?。]+["”’」』]?|[^.!?。]+$/g)||[]).map(x=>x.trim()).filter(Boolean)}
function styleCheck(summary){
 let sents=splitSentences(summary);
 // 물음표 문장은, 남는 문장이 두 개 이상이면 걸러 냅니다.
 const kept=sents.filter(x=>!/\?["”’」』]?$/.test(x));
 if(kept.length>=2)sents=kept;
 const text=sents.join(' ');
 const ok=!text.includes('?')&&sents.length>0&&sents.every(x=>/다[.!]["”’」』]?$/.test(x));
 return {text,ok};
}
function cleanAnalysis(o){
 const raw=String(o?.summary||'').replace(/\s+/g,' ').trim().slice(0,400);
 const tags=[...new Set((Array.isArray(o?.tags)?o.tags:[]).map(x=>String(x||'').trim()).filter(x=>TAG_ALL.has(x)))].slice(0,4);
 if(!raw)return null;
 const st=styleCheck(raw);
 return {summary:st.text,tags,motifIdea:cleanIdea(o?.motifIdea),styleOk:st.ok};
}
function jsonFrom(text){
 const t=String(text||'').replace(/```[a-zA-Z]*/g,'').trim();
 const a=t.indexOf('{'),z=t.lastIndexOf('}');
 if(a<0||z<=a)throw Error('정리 결과를 해석하지 못했습니다. 한 번 더 시도해 보세요.');
 try{return JSON.parse(t.slice(a,z+1))}catch{throw Error('정리 결과를 해석하지 못했습니다. 한 번 더 시도해 보세요.')}
}
function parseAnalysis(text){
 const r=cleanAnalysis(jsonFrom(text));
 if(!r)throw Error('요약이 비어 있습니다. 한 번 더 시도해 보세요.');
 return r;
}
// 여러 권 응답은 번호로 짝을 맞춥니다. 빠지거나 망가진 책은 null로 남겨 따로 다시 정리합니다.
function parseAnalysisMany(text,count){
 const o=jsonFrom(text),items=Array.isArray(o.items)?o.items:Array.isArray(o)?o:[];
 const out=Array(count).fill(null);
 items.forEach((it,i)=>{const n=Number(it?.n)||i+1;if(n>=1&&n<=count&&!out[n-1])out[n-1]=cleanAnalysis(it)});
 return out;
}
// 카카오에서 이 책의 소개를 다시 찾아옵니다(ISBN 우선).
async function fetchKakaoSummary(b){
 const key=getApiKey();
 if(!key)throw Error('설정에서 카카오 REST API 키를 먼저 저장하세요.');
 const p=new URLSearchParams({query:b.isbn||`${b.workTitle||b.title} ${cleanAuthor(b.author)}`.trim(),size:'10'});
 if(b.isbn)p.set('target','isbn');
 const data=await fetchJson('https://dapi.kakao.com/v3/search/book?'+p,{Authorization:'KakaoAK '+key});
 const hit=mapKakao(data).find(x=>x.summary);
 if(!hit)throw Error('카카오에서 이 책의 소개를 찾지 못했습니다.');
 return hit;
}
// 입력 중인 화면을 뒤에서 다시 그리면 적던 글이 날아가므로, 그럴 때는 저장만 하고 화면은 그대로 둡니다.
function softRender(){
 if(dialog==='edit')return;
 render(); // v2.14.0: 상세 창의 적던 문장은 render 뒤 restoreDialogUI가 되살립니다.
}
// 상징을 그려야 하는 책: 상징이 정해져 있고, 아직 그 상징으로 그리지 않았고, 사용자가 특정 상징을 직접 고르지 않은 책
const needsDrawing=b=>b&&b.status==='done'&&b.motifIdea&&b.motifDrawnFor!==b.motifIdea&&(b.motif==='auto'||b.motif==='custom');
// 상징 사물 이름 → 내장 아이콘. 이름이 맞으면 AI를 부르지 않고 바로 씁니다.
// 뜻이 둘 이상인 낱말(눈, 비, 창, 초)은 일부러 넣지 않았습니다.
const BUILTIN_MOTIF_NAMES={도끼:'axe',손도끼:'axe',알:'egg',새알:'egg',달걀:'egg',돛단배:'boat',배:'boat',범선:'boat',돛배:'boat',조각배:'boat',물고기:'fish',생선:'fish',청새치:'fish',연어:'fish',하트:'heart',심장:'heart',마음:'heart',고래:'whale',흰고래:'whale',태양:'sun',해:'sun',달:'moon',초승달:'moon',보름달:'moon',꽃:'flower',꽃송이:'flower',장미:'rose',장미꽃:'rose',별:'star',잎:'leaf',잎사귀:'leaf',나뭇잎:'leaf',낙엽:'leaf',나무:'tree',산:'mountain',파도:'wave',물결:'wave',새:'bird',갈매기:'bird',나비:'butterfly',고양이:'cat',열쇠:'key',문:'door',창문:'window',시계:'clock',회중시계:'clock',모래시계:'hourglass',나침반:'compass',촛불:'lamp',양초:'lamp',등불:'lamp',램프:'lamp',깃펜:'feather',깃털:'feather',펜:'feather',편지:'letter',편지봉투:'letter',봉투:'letter',병:'bottle',유리병:'bottle',술병:'bottle',약병:'bottle',거울:'mirror',가면:'mask',눈동자:'eye',왕관:'crown',다리:'bridge',미로:'labyrinth',미궁:'labyrinth',빗방울:'rain',비구름:'rain',눈송이:'snow',눈꽃:'snow',기차:'train',열차:'train',증기기관차:'train',도시:'city',빌딩:'city',책:'book',펼친책:'book',사슬:'chain',쇠사슬:'chain'};
const ideaThing=idea=>String(idea||'').split(/\s*[—–-]\s*/)[0].trim();
const thingKey=t=>String(t||'').normalize('NFKC').replace(/\s+/g,'');
function builtinKindFor(idea){
 const thing=ideaThing(idea).normalize('NFKC');if(!thing)return '';
 const words=thing.split(/\s+/).filter(Boolean);
 // "녹슨 도끼"처럼 꾸밈말이 붙어도 마지막 낱말로 찾습니다.
 return BUILTIN_MOTIF_NAMES[thingKey(thing)]||BUILTIN_MOTIF_NAMES[words[words.length-1]]||'';
}
// AI 없이 바로 쓸 수 있는 그림: 내장 아이콘, 또는 다른 책에서 같은 사물로 이미 그린 그림
function instantMotif(b){
 if(!b||!b.motifIdea)return '';
 const kind=builtinKindFor(b.motifIdea);
 if(kind){const inner=sanitizeMotifSvg(extractSvgInner(motifSvg(kind)));if(inner)return inner}
 const key=thingKey(ideaThing(b.motifIdea));
 const twin=key&&books.find(x=>x.id!==b.id&&x.customMotif&&x.motifDrawnFor&&thingKey(ideaThing(x.motifDrawnFor))===key);
 return twin?twin.customMotif:'';
}
// 여러 권의 상징을 한 요청으로 그립니다. 무료 한도는 요청 횟수 기준이라 5권을 묶으면 요청이 1/5로 줍니다.
const DRAW_BATCH=5;
function motifPromptMany(list){
 return `책등에 새길 아주 단순한 선 아이콘(line icon)을 책마다 하나씩 SVG로 그려 주세요.

${list.map((b,i)=>{const [thing,why]=String(b.motifIdea||'').split(/\s*[—–-]\s*/);return `[${i+1}] 그릴 사물: ${thing} / 고른 이유: ${why||'(없음)'} / 책: ${b.workTitle||b.title}`}).join('\n')}

각 사물을 한눈에 알아볼 수 있게, 그 사물의 가장 특징적인 윤곽만 선 몇 개로 그리세요. 다른 사물이나 장식은 덧붙이지 말고 화면 가운데에 놓이게 하세요.

[출력 형식] 책 번호 줄을 쓰고, 다음 줄에 그 책의 도형 요소만 씁니다. 모두 ${list.length}개입니다.
### 1
<circle cx="20" cy="15" r="7"/><path d="M20 22v13"/>
### 2
...

${MOTIF_DRAW_RULES}`;
}
function parseDrawMany(text,count){
 const out=Array(count).fill('');
 const parts=String(text||'').replace(/```[a-zA-Z]*/g,'').split(/^[ \t]*#{2,3}[ \t]*\[?(\d+)\]?[ \t]*$/m);
 for(let i=1;i<parts.length;i+=2){const n=Number(parts[i]);if(n>=1&&n<=count&&!out[n-1])out[n-1]=sanitizeMotifSvg(extractSvgInner(parts[i+1]||''))}
 return out;
}
// 그림 한 장 받기. v2.14.1: 한 번만 요청하고, 실패해도 다시 보내지 않습니다.
async function drawMotif(title,author,summary,idea){
 const {text}=await callGemini(motifPrompt(title,author,summary,idea),{model:AI_DRAW_MODEL,thinking:'minimal',maxTokens:1024,timeoutMs:60000});
 const inner=sanitizeMotifSvg(extractSvgInner(text));
 if(!inner){const e=Error('AI 응답이 그림 규칙에 맞지 않아 쓰지 못했어요.');e.kind='format';throw e}
 return inner;
}
// 그린 결과를 책에 붙입니다. 그 책의 수정 화면이 열려 있으면 화면의 숨은 칸도 맞춰 둡니다.
function setDrawn(bid,idea,inner){
 books=books.map(x=>x.id===bid&&x.motifIdea===idea?normalize({...x,customMotif:inner,motifDrawnFor:idea}):x);
 syncEditForm(bid);
}
function syncEditForm(bid){
 if(dialog!=='edit'||editing!==bid)return;
 const b=books.find(x=>x.id===bid);if(!b)return;
 const set=(k,v)=>{const f=document.getElementById(k);if(f)f.value=v};
 set('customMotif',b.customMotif);set('motifIdea',b.motifIdea);set('motifDrawnFor',b.motifDrawnFor);
 formInit={...formInit,customMotif:b.customMotif,motifIdea:b.motifIdea,motifDrawnFor:b.motifDrawnFor};
 if(b.customMotif)ensureCustomOption($('#motif'));
 updateMotifPreview();
}
let drawQueue=[],drawing=false,drawnCount=0;
// 지금 그리고 있는 책들(묶음으로 그리므로 여러 권일 수 있음)
const drawingNow=new Set();
// v2.14.1: 이번 접속에서 그리기에 실패한 책과 이유. 자동으로 다시 보내지 않고, 상세의 '상징 다시 시도'나 '남은 상징 그리기'로만 다시 그립니다.
// 책 데이터에는 저장하지 않습니다(상징 이름은 있는데 그림이 없으면 '아직 못 그림'으로 봅니다).
const drawFail=new Map();
// "다시 그리기"를 누른 책은 내장 아이콘을 건너뛰고 AI가 새로 그립니다.
const forceDraw=new Set();
// instantOnly: AI 요청 없이 붙일 수 있는 그림(내장 아이콘·같은 사물 재사용)만 붙이고 큐에는 넣지 않습니다.
function queueDraw(ids,{front=false,force=false,instantOnly=false}={}){
 let quick=0;
 for(const bid of ids){
  if(force)forceDraw.add(bid);
  const b=books.find(x=>x.id===bid);
  if(!needsDrawing(b))continue;
  // 바로 쓸 수 있는 그림은 큐에 넣지 않고 그 자리에서 붙입니다(키가 없어도 동작).
  if(!forceDraw.has(bid)){const inner=instantMotif(b);if(inner){setDrawn(bid,b.motifIdea,inner);quick++;continue}}
  if(instantOnly||!getAiKey())continue;
  drawFail.delete(bid);
  drawQueue=drawQueue.filter(x=>x!==bid);
  front?drawQueue.unshift(bid):drawQueue.push(bid);
 }
 if(quick){persist(books);softRender()}
 if(drawQueue.length&&!drawing)runDrawQueue();
}
// AI로 그려야 할 남은 책 수(내장 아이콘으로 바로 붙는 책 제외)
const pendingDrawCount=()=>books.filter(b=>needsDrawing(b)&&(forceDraw.has(b.id)||!instantMotif(b))).length;
async function runDrawQueue(){
 if(drawing)return;
 drawing=true;drawnCount=0;softRender();
 let stopped=null;
 try{
  while(drawQueue.length){
   // 소개 일괄 정리가 도는 동안에는 같은 무료 한도를 나눠 쓰지 않도록 기다립니다.
   while(batchRunning)await sleep(1500);
   // 앞에서부터 최대 5권을 고릅니다. 바로 붙일 수 있는 그림(내장 아이콘·같은 사물)은 여기서 붙입니다.
   const group=[];
   for(const bid of [...drawQueue]){
    if(group.length>=DRAW_BATCH)break;
    const b=books.find(x=>x.id===bid);
    if(!needsDrawing(b)){drawQueue=drawQueue.filter(x=>x!==bid);forceDraw.delete(bid);continue}
    if(!forceDraw.has(bid)){const inner=instantMotif(b);if(inner){drawQueue=drawQueue.filter(x=>x!==bid);setDrawn(bid,b.motifIdea,inner);persist(books);softRender();continue}}
    group.push(b);
   }
   // 같은 작품의 공유 그림이 있으면 AI 없이 씁니다.
   if(group.length&&session){
    const hits=await cacheLookup(group).catch(()=>new Map());let n=0;
    for(const b of [...group]){const row=hits.get(workKeyOf(b)),inner=row&&cleanIdea(row.motif_idea)===b.motifIdea?sanitizeMotifSvg(row.custom_motif||''):'';
     if(inner){drawQueue=drawQueue.filter(x=>x!==b.id);forceDraw.delete(b.id);drawFail.delete(b.id);setDrawn(b.id,b.motifIdea,inner);group.splice(group.indexOf(b),1);n++}}
    if(n){persist(books);softRender()}
   }
   if(!group.length)continue;
   // v2.14.1: 이 묶음은 큐에서 먼저 뺍니다. 성공하든 실패하든 같은 책을 자동으로 다시 보내지 않습니다.
   const ids=group.map(b=>b.id);drawQueue=drawQueue.filter(x=>!ids.includes(x));
   const ideas=group.map(b=>b.motifIdea);
   group.forEach(b=>drawingNow.add(b.id));softRender();
   try{
    let results;
    if(group.length===1){const b=group[0];try{results=[await drawMotif(b.workTitle||b.title,b.author,b.aiSummary||b.summary,ideas[0])]}catch(err){if(err.kind!=='format')throw err;results=['']}}
    else{const {text}=await callGemini(motifPromptMany(group),{model:AI_DRAW_MODEL,thinking:'minimal',maxTokens:700*group.length,timeoutMs:90000});results=parseDrawMany(text,group.length)}
    group.forEach((b,k)=>{
     forceDraw.delete(b.id);
     if(results[k]){drawFail.delete(b.id);setDrawn(b.id,ideas[k],results[k]);shareMotif(b,ideas[k],results[k]);drawnCount++}
     else drawFail.set(b.id,{kind:'format',msg:'AI 응답이 그림 규칙에 맞지 않아 쓰지 못했어요.'});
    });
    persist(books);
   }catch(err){
    if(!err.paused)console.error('[나의 서재] 상징 그리기 실패',err.kind||'',err.message);
    const f={kind:err.kind||'other',msg:aiErrorText(err)};
    group.forEach(b=>{forceDraw.delete(b.id);drawFail.set(b.id,f)});
    // 한도·키·모델 문제는 남은 책도 같은 결과이므로 여기서 멈춥니다. 남은 책은 사용자가 다시 누를 때 그립니다.
    if(STOP_KINDS.includes(f.kind)){stopped=f;drawQueue.forEach(id=>drawFail.set(id,f));drawQueue=[]}
   }finally{drawingNow.clear()}
   softRender();
   if(drawQueue.length)await sleep(600);
  }
 }finally{
  drawing=false;drawingNow.clear();softRender();
  if(stopped)flash(stopped.msg);
  else if(drawnCount&&!batchRunning)flash(`상징 ${drawnCount}개를 그려 두었어요.`);
 }
}
async function analyzeBook(bookId,{quiet=false,draw=true}={}){
 if(aiBusy.has(bookId))return false;
 let b=books.find(x=>x.id===bookId);if(!b)return false;
 if(!getAiKey()){if(!quiet)flash('설정 → AI 기능에서 Gemini API 키를 먼저 저장하세요.');return false}
 aiBusy.add(bookId);quiet?softRender():render();
 try{
  if(!b.summary&&getApiKey()){
   try{const hit=await fetchKakaoSummary(b);b={...b,summary:hit.summary,translator:b.translator||hit.translator}}catch{}
  }
  // v2.11.0: 같은 작품의 공유 기록이 있으면 AI 없이 그대로 씁니다.
  {const row=(await cacheLookup([b]).catch(()=>new Map())).get(workKeyOf(b));
   if(row){aiBusy.delete(bookId);const next=books.map(x=>x.id===bookId?applyCache({...x,summary:b.summary,translator:b.translator},row):x);
    if(quiet){books=next;persist(books);softRender()}else commit(next,'같은 작품의 기록을 불러왔어요.');
    if(needsDrawing(books.find(x=>x.id===bookId)))queueDraw([bookId],{front:!quiet,instantOnly:!draw});
    return true}}
  // v2.14.1: 한 번만 요청합니다. 문체 검사에 걸려도 다시 부르지 않고 그대로 쓰되, 공유 기록에는 올리지 않습니다.
  const {text}=await callGemini(analysisPrompt(b),{json:true,maxTokens:2048,model:AI_FAST_MODEL,thinking:'minimal'});
  let r;try{r=parseAnalysis(text)}catch(err){err.kind=err.kind||'format';throw err}
  aiBusy.delete(bookId);
  const next=books.map(x=>x.id===bookId?normalize({...x,summary:b.summary,translator:b.translator,aiSummary:r.summary,aiTags:r.tags,motifIdea:x.motifIdea||r.motifIdea,aiAt:new Date().toISOString()}):x);
  if(quiet){books=next;persist(books);softRender()}else commit(next,'책 소개를 정리했어요.');
  if(r.styleOk)await shareAnalysis([books.find(x=>x.id===bookId)]);
  if(needsDrawing(books.find(x=>x.id===bookId)))queueDraw([bookId],{front:!quiet,instantOnly:!draw});
  return true;
 }catch(err){
  aiBusy.delete(bookId);quiet?softRender():render();
  console.error('[나의 서재] 소개 정리 실패',err);
  if(!quiet)flash('정리 실패: '+aiErrorText(err));
  throw err;
 }
}
// 아직 정리하지 않은 책을 5권씩 묶어 한 번에 정리합니다. 묶음 사이에는 무료 한도를 넘지 않도록 잠깐 쉽니다.
const BATCH_SIZE=5;
async function analyzeAll(redo=false){
 if(batchRunning)return;
 if(!getAiKey()){flash('먼저 Gemini API 키를 저장하세요.');return}
 let todo=books.filter(b=>b.status==='done'&&(redo||!b.aiSummary)).map(b=>b.id);
 if(!todo.length){flash('정리할 책이 없어요. 모든 책이 정리돼 있습니다.');return}
 batchRunning=true;softRender();
 let ok=0,fail=0;
 const t0=Date.now();
 try{
  // 소개가 빈 책은 카카오에서 먼저 받아 옵니다(카카오는 빠르고 한도가 넉넉합니다).
  if(getApiKey()){
   const empty=todo.map(id=>books.find(x=>x.id===id)).filter(b=>b&&!b.summary);
   for(let i=0;i<empty.length;i++){
    flash(`카카오에서 소개 불러오는 중… ${i+1} / ${empty.length}`);
    try{const hit=await fetchKakaoSummary(empty[i]);books=books.map(x=>x.id===empty[i].id?normalize({...x,summary:hit.summary,translator:x.translator||hit.translator}):x)}catch{}
    await sleep(150);
   }
   persist(books);
  }
  // v2.11.0: 공유 기록이 있는 작품은 AI 없이 바로 붙이고, 나머지만 AI로 정리합니다.
  if(session){
   const hits=await cacheLookup(todo.map(id=>books.find(x=>x.id===id)).filter(Boolean)).catch(()=>new Map());
   const got=new Set(todo.filter(id=>{const b=books.find(x=>x.id===id);return b&&hits.has(workKeyOf(b))}));
   if(got.size){books=books.map(x=>got.has(x.id)?applyCache(x,hits.get(workKeyOf(x))):x);persist(books);softRender();ok+=got.size;todo=todo.filter(id=>!got.has(id));queueDraw([...got].filter(id=>needsDrawing(books.find(x=>x.id===id))),{instantOnly:true})}
  }
  for(let i=0;i<todo.length;i+=BATCH_SIZE){
   const ids=todo.slice(i,i+BATCH_SIZE),group=ids.map(id=>books.find(x=>x.id===id)).filter(Boolean);
   if(!group.length)continue;
   flash(`책 소개 정리 중… ${Math.min(i+group.length,todo.length)} / ${todo.length}`);
   group.forEach(b=>aiBusy.add(b.id));softRender();
   let results=Array(group.length).fill(null);
   try{
    const res=await callGemini(analysisPromptMany(group),{json:true,maxTokens:1500*group.length,model:AI_FAST_MODEL,thinking:'minimal'});
    results=parseAnalysisMany(res.text,group.length);
   }catch(err){
    group.forEach(b=>aiBusy.delete(b.id));softRender();
    if(err.status===429||/한도|API 키|거부/.test(err.message||'')){flash(`${ok}권 정리 후 멈췄어요: ${err.message}`);return}
    console.error('[나의 서재] 묶음 정리 실패',err);
   }
   group.forEach(b=>aiBusy.delete(b.id));
   const now=new Date().toISOString();
   books=books.map(x=>{const k=group.findIndex(g=>g.id===x.id);return k>=0&&results[k]?normalize({...x,aiSummary:results[k].summary,aiTags:results[k].tags,motifIdea:x.motifIdea||results[k].motifIdea,aiAt:now}):x});
   persist(books);softRender();
   await shareAnalysis(group.filter((g,k)=>results[k]&&results[k].styleOk).map(g=>books.find(x=>x.id===g.id)));
   ok+=results.filter(Boolean).length;
   queueDraw(group.map(g=>g.id).filter(id=>needsDrawing(books.find(x=>x.id===id))),{instantOnly:true});
   // v2.14.1: 묶음에서 빠진 책을 한 권씩 다시 보내지 않습니다. 실패로 세고, 책 상세에서 직접 다시 정리할 수 있어요.
   fail+=results.filter(x=>!x).length;
   if(i+BATCH_SIZE<todo.length)await sleep(2500);
  }
  const sec=Math.round((Date.now()-t0)/1000);
  flash(`${ok}권 정리 완료 (${sec}초)${fail?`, ${fail}권 실패 — 책 상세에서 다시 시도할 수 있어요`:''}.${drawing?' 상징은 뒤에서 계속 그리고 있어요.':''}`);
 }finally{batchRunning=false;softRender()}
}
// 카카오 소개는 문장 중간에서 잘려 옵니다. 표시할 때는 마지막 완결된 문장까지만 보여 줍니다.
function tidyRawSummary(s){
 const t=String(s||'').trim();
 if(!t||/[.!?。”"」』…]$/.test(t))return t;
 const cut=Math.max(t.lastIndexOf('. '),t.lastIndexOf('다. '),t.lastIndexOf('? '),t.lastIndexOf('! '));
 return cut>60?t.slice(0,cut+1)+' …':t+'…';
}
const motifNames={auto:'자동 추천 (제목·소개 기반)',custom:'AI가 만든 상징',axe:'도끼',egg:'알과 새',boat:'돛단배',fish:'물고기',heart:'마음',whale:'고래',sun:'태양',moon:'달',flower:'꽃',rose:'장미',star:'별',leaf:'잎사귀',tree:'나무',mountain:'산',wave:'파도',bird:'새',butterfly:'나비',cat:'고양이',key:'열쇠',door:'문',window:'창문',clock:'시계',hourglass:'모래시계',compass:'나침반',lamp:'촛불',feather:'깃펜',letter:'편지',bottle:'유리병',mirror:'거울',mask:'가면',eye:'눈(응시)',crown:'왕관',bridge:'다리',labyrinth:'미로',rain:'비',snow:'눈',train:'기차',city:'도시',book:'펼친 책',chain:'사슬',none:'표시하지 않음'};
// 상징 추천은 외부 호출 없이 제목과 책 소개의 낱말로 고릅니다. AI 생성은 사용자가 직접 요청할 때만 동작합니다.
const motifKeywords=[
 ['boat',['항해','뱃사람','선원','표류','난파','돛','어부','바다로']],
 ['whale',['고래','포경']],
 ['fish',['물고기','어항','연어','낚시']],
 ['wave',['바다','파도','해변','섬으로','해협','밀물']],
 ['bird',['새들','날개','비상','갈매기','까마귀','참새','둥지']],
 ['butterfly',['나비','번데기','날갯짓']],
 ['cat',['고양이','길냥']],
 ['tree',['나무','숲속','숲을','숲의','정원사','가지에']],
 ['leaf',['이파리','낙엽','잎사귀','초록']],
 ['mountain',['산을','산속','산정','등반','봉우리','고원']],
 ['rose',['장미','꽃다발']],
 ['flower',['꽃밭','화원','들꽃','꽃잎']],
 ['key',['열쇠','자물쇠','잠긴','비밀의 방']],
 ['door',['문을 열','문턱','현관','출입구','문 너머']],
 ['window',['창문','창가','창밖']],
 ['clock',['시계','정오','자정','시간을','시간이']],
 ['hourglass',['모래시계','유한한 시간','덧없']],
 ['compass',['나침반','여행기','방랑','순례','탐험']],
 ['lamp',['촛불','등불','램프','불빛','어둠 속']],
 ['feather',['작가','소설가','시인','글쓰기','문학적','원고','일기']],
 ['letter',['편지','서간','서신','우편']],
 ['bottle',['술집','포도주','위스키','유리병','약병']],
 ['mirror',['거울','분신','자아','정체성','또 다른 나']],
 ['mask',['가면','연극','배우','무대','위선','가장무도회']],
 ['crown',['왕국','왕자','여왕','왕위','귀족','궁정','제국']],
 ['bridge',['다리를 건','교각','연결']],
 ['labyrinth',['미로','미궁','뒤얽힌','출구 없']],
 ['rain',['장마','빗속','빗소리','소나기']],
 ['snow',['눈보라','설원','겨울의','겨울을','얼어붙']],
 ['train',['기차','열차','철도','역에서']],
 ['city',['도시','서울','뉴욕','아파트','거리를','빌딩']],
 ['book',['도서관','책방','서점','독서','읽는 행위']],
 ['chain',['감옥','수감','속박','굴레','노예']],
 ['heart',['사랑','연인','마음을','그리움','이별']],
 ['moon',['달빛','보름달','밤하늘']],
 ['sun',['태양','햇빛','뙤약볕','한낮']],
 ['star',['별들','별빛','우주','행성']],
 ['egg',['성장','알을','깨어나','자아를 찾']]
];
function detectedMotif(b){
 const t=titleKey(cleanDisplayTitle(baseWorkTitle(b.workTitle||b.title)));
 // 널리 알려진 작품은 제목만으로 확정합니다.
 if(t.includes('죄와벌'))return 'axe';
 if(t.includes('데미안'))return 'egg';
 if(t.includes('노인과바다')||t.includes('theoldmanandthesea'))return 'boat';
 if(t==='마음'||t==='kokoro')return 'heart';
 if(t.includes('모비딕')||t.includes('mobydick'))return 'whale';
 if(t.includes('어린왕자'))return 'star';
 if(t.includes('이방인'))return 'sun';
 if(t.includes('위대한개츠비')||t.includes('greatgatsby'))return 'star';
 if(t.includes('변신')||t.includes('metamorphosis'))return 'butterfly';
 if(t.includes('안나카레니나'))return 'train';
 if(t.includes('1984')||t.includes('동물농장'))return 'eye';
 if(t.includes('호밀밭'))return 'leaf';
 if(t.includes('설국'))return 'snow';
 if(t.includes('그리고아무도없었다')||t.includes('셜록'))return 'key';
 if(t.includes('시간')&&t.includes('잃어버린'))return 'clock';
 // 그다음은 제목과 책 소개의 낱말로 점수를 매깁니다.
 const text=`${b.workTitle||''} ${b.title||''} ${b.summary||''}`.normalize('NFKC').toLocaleLowerCase();
 if(text.trim()){
  let best='',score=0;
  for(const [kind,words] of motifKeywords){
   let n=0;
   for(const w of words)if(text.includes(w))n+=w.length>=3?2:1;
   if(n>score){score=n;best=kind}
  }
  if(best)return best;
 }
 // 마지막으로 제목 자체의 단순한 낱말을 봅니다.
 if(t.includes('꽃')||t.includes('화원'))return 'flower';
 if(t.includes('달'))return 'moon';
 if(t.includes('숲')||t.includes('나무'))return 'leaf';
 return 'none';
}
function motifSvg(kind,size=23){
 const common=`viewBox="0 0 40 40" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
 const paths={
  boat:'<path d="M20 5v27M20 8 7 26h13ZM23 13l11 14H23ZM5 32q15 8 30 0"/>',
  fish:'<path d="M5 20q13-14 24 0-11 14-24 0Zm24 0 7-9v18ZM12 19h.1"/>',
  heart:'<path d="M20 33 8 21C0 11 13 4 20 13c7-9 20-2 12 8Z"/>',
  whale:'<path d="M6 23q10-16 27-5l4-4-1 14-7-4Q17 35 6 23Zm5-3v-6m-3 3 3-3 3 3"/>',
  sun:'<circle cx="20" cy="20" r="8"/><path d="M20 3v6m0 22v6M3 20h6m22 0h6M8 8l4 4m16 16 4 4M32 8l-4 4M12 28l-4 4"/>',
  axe:'<path d="M10 33 27 7M22 8c5-3 10-2 13 1l-7 9-8-4"/>',
  egg:'<path d="M23 7c-7 0-12 10-12 18a12 12 0 0 0 24 0c0-8-5-18-12-18Z" transform="translate(-3 0) scale(.9 1)"/><path d="m16 23 4-3 3 3 4-4"/>',
  moon:'<path d="M29 31A15 15 0 0 1 13 8a14 14 0 1 0 16 23Z"/>',
  flower:'<circle cx="20" cy="20" r="4"/><path d="M20 16c-9-14-15-2-4 4-14-9-15 6 0 4-9 12 5 17 4 0 2 15 16 10 4 0 14 3 12-13 0-4 12-7 5-18-4-4Z"/>',
  star:'<path d="m20 5 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z"/>',
  leaf:'<path d="M33 8C15 7 8 16 10 27c8 8 24-1 23-19ZM10 33c7-12 12-15 19-20"/>',
  rose:'<circle cx="20" cy="13" r="8"/><path d="M20 13a4 4 0 0 1 4 4M20 21v14m0-7-7-4m7 1 7-5"/>',
  tree:'<path d="M20 35V22m0-17 9 12h-6l7 9H10l7-9h-6Z"/>',
  mountain:'<path d="m3 32 12-19 7 11 4-6 11 14Zm9-8 3-2"/>',
  wave:'<path d="M4 14q6-6 12 0t12 0 8-4M4 22q6-6 12 0t12 0 8-4M4 30q6-6 12 0t12 0 8-4"/>',
  bird:'<path d="M5 18c5-7 10-7 15 1 5-8 10-8 15-1"/><path d="M13 23v4m14-4v4"/>',
  butterfly:'<path d="M20 11v19m0-17C14 4 5 7 6 15c-3 6 5 13 14 5Zm0 0c6-9 15-6 14 2 3 6-5 13-14 5Z"/>',
  cat:'<path d="M9 18 7 6l8 5a14 14 0 0 1 10 0l8-5-2 12"/><path d="M31 19a11 11 0 1 1-22 0"/><path d="M15 21h.1m10 0h.1M20 26l-2-2m2 2 2-2"/>',
  key:'<circle cx="13" cy="14" r="7"/><path d="m18 19 15 15m-5-1 4 4m-7-7 4 4"/>',
  door:'<path d="M11 5h18v30H11z"/><path d="M24 21h.1"/>',
  window:'<path d="M8 6h24v27H8z"/><path d="M20 6v27M8 20h24"/>',
  clock:'<circle cx="20" cy="20" r="14"/><path d="M20 11v10l7 4"/>',
  hourglass:'<path d="M11 4h18M11 36h18M13 4v6l7 10 7-10V4M13 36v-6l7-10 7 10v6"/>',
  compass:'<circle cx="20" cy="20" r="14"/><path d="m27 13-5 11-11 5 5-11Z"/>',
  lamp:'<path d="M14 19h12v16H14z"/><path d="M20 19v-6M20 4c4 4 2 8 0 8s-4-4 0-8Z"/>',
  feather:'<path d="M7 34 32 8"/><path d="M32 8c-15 0-21 7-20 19 12 1 20-6 20-19Z"/>',
  letter:'<path d="M5 9h30v22H5z"/><path d="m5 9 15 13L35 9"/>',
  bottle:'<path d="M17 4h6v8l4 6v17H13V18l4-6Z"/><path d="M13 25h14"/>',
  mirror:'<ellipse cx="20" cy="16" rx="10" ry="12"/><path d="M20 28v8m-6 0h12"/>',
  mask:'<path d="M7 9h26c0 15-6 23-13 23S7 24 7 9Z"/><path d="M14 18h4m4 0h4m-9 8c3 2 5 2 8 0"/>',
  crown:'<path d="m6 30 2-19 8 8 4-12 4 12 8-8 2 19Z"/><path d="M8 34h24"/>',
  bridge:'<path d="M3 24q17-17 34 0"/><path d="M3 24v9m34-9v9M12 20v13m16-13v13M20 17v16"/>',
  labyrinth:'<path d="M35 20a15 15 0 1 0-15 15"/><path d="M29 20a9 9 0 1 0-9 9"/><path d="M23 20a3 3 0 1 0-3 3"/>',
  rain:'<path d="M12 19a8 8 0 0 1 16-3 6 6 0 0 1 1 11H14a7 7 0 0 1-2-8Z"/><path d="m14 32-2 5m9-5-2 5m9-5-2 5"/>',
  snow:'<path d="M20 4v32M6 12l28 16M34 12 6 28"/><path d="m16 8 4 4 4-4m-8 24 4-4 4 4"/>',
  train:'<path d="M11 5h18v21H11z"/><path d="M11 14h18"/><circle cx="16" cy="31" r="3"/><circle cx="24" cy="31" r="3"/><path d="m8 36 4-5m20 5-4-5"/>',
  city:'<path d="M5 34V16h9v18M14 34V7h11v27M25 34V21h10v13"/><path d="M9 21h.1m10-8h.1m10 13h.1"/>',
  book:'<path d="M5 8h11a4 4 0 0 1 4 4 4 4 0 0 1 4-4h11v23H24a4 4 0 0 0-4 3 4 4 0 0 0-4-3H5Z"/><path d="M20 12v23"/>',
  chain:'<rect x="4" y="15" width="15" height="11" rx="5.5"/><rect x="21" y="15" width="15" height="11" rx="5.5"/><path d="M17 20.5h6"/>',
  eye:'<path d="M4 20s7-9 16-9 16 9 16 9-7 9-16 9S4 20 4 20Z"/><circle cx="20" cy="20" r="4"/>'
 };
 return paths[kind]?`<svg ${common}>${paths[kind]}</svg>`:'';
}
// 저장된 AI 상징은 이미 살균된 내부 마크업이지만, 그릴 때 한 번 더 통과시킵니다.
function customMotifSvg(b,size=23){
 const inner=sanitizeMotifSvg(b.customMotif||'');
 if(!inner)return '';
 return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
function spineMotif(b,size=23){
 if(b.motif==='custom'||(b.motif==='auto'&&b.customMotif)){const c=customMotifSvg(b,size);if(c)return c}
 const kind=b.motif&&b.motif!=='auto'&&b.motif!=='custom'?b.motif:detectedMotif(b);
 return motifSvg(kind,size);
}
function normalize(b,i=0){return {id:String(b.id||id()),title:String(b.title||'').trim().slice(0,150),author:String(b.author||'').slice(0,120),status:statuses[b.status]?b.status:'want',rating:Math.max(0,Math.min(5,Number(b.rating)||0)),notes:String(b.notes||'').slice(0,100000),notionUrl:validUrl(b.notionUrl)?String(b.notionUrl||''):'',color:/^#[0-9a-fA-F]{6}$/.test(String(b.color||''))?String(b.color):colors[i%colors.length],createdAt:cleanDate(b.createdAt),workTitle:String(b.workTitle||b.title||'').trim().slice(0,150),publisher:String(b.publisher||'').slice(0,120),translator:String(b.translator||'').slice(0,120),isbn:String(b.isbn||'').slice(0,30),coverUrl:safeCover(b.coverUrl),googleBooksId:String(b.googleBooksId||'').slice(0,90),editionTitle:String(b.editionTitle||'').slice(0,150),summary:String(b.summary||'').replace(/\s+/g,' ').slice(0,1200),customMotif:sanitizeMotifSvg(b.customMotif||''),tags:(Array.isArray(b.tags)?b.tags:[]).map(t=>String(t||'').trim().slice(0,20)).filter(Boolean).slice(0,10),aiSummary:String(b.aiSummary||'').replace(/\s+/g,' ').trim().slice(0,400),quotes:(Array.isArray(b.quotes)?b.quotes:[]).map(q=>({id:String(q?.id||id()),text:String(q?.text||'').trim().slice(0,600),page:String(q?.page||'').trim().slice(0,20),createdAt:cleanDate(q?.createdAt)})).filter(q=>q.text).slice(0,200),aiTags:(Array.isArray(b.aiTags)?b.aiTags:[]).map(t=>String(t||'').trim()).filter(t=>TAG_ALL.has(t)).slice(0,6),aiAt:String(b.aiAt||'').slice(0,40),motifIdea:cleanIdea(b.motifIdea),motifDrawnFor:String(b.motifDrawnFor||'').slice(0,60),pages:Math.max(0,Math.min(9999,Math.round(Number(b.pages)||0))),spineType:SPINE_TYPES[b.spineType]?b.spineType:'auto',lifeBook:b.lifeBook===true,colorMode:b.colorMode==='auto'?'auto':'custom',spineTitle:String(b.spineTitle||'').replace(/\s+/g,' ').trim().slice(0,60),motif:motifNames[b.motif]?b.motif:'auto'};}
// ---------- 클라우드 동기화 (v2.9.0) ----------
// 원본은 Supabase의 books 표(책 한 권 = 한 줄, 책 전체는 data 칸의 JSON)이고, 이 브라우저의 localStorage는 빠르게 열기 위한 사본입니다.
// 외부 라이브러리 없이 Supabase의 공개 REST 주소에 fetch로 직접 요청합니다.
// 아래 publishable 키는 원래 앱 코드에 공개로 들어가는 값이며, 데이터는 표의 보안 규칙(RLS: 본인 책만)으로 지켜집니다.
const SB_URL='https://samgvnfsxmbbsavsvsut.supabase.co';
const SB_KEY='sb_publishable_4Rgm0HZw_7Dg-8p-X2H2lA_Cqyuo6lA';
const APP_URL='https://eunseokyu.github.io/my-library/';
// 새로 쓰는 저장 항목입니다. 기존 저장 키는 그대로 둡니다.
const AUTH_KEY='my-library-auth-v1',SYNC_KEY='my-library-sync-v1';
let session=null,syncMeta={userId:'',lastPull:'',dirty:[],removed:[],lastSync:'',email:'',backupFor:'',keysDirty:[],cacheSeeded:''};let keySyncError='';
let syncSnap=new Map(),applyingRemote=false,syncBusy=false,syncAgain=false,syncTimer=0,syncState='idle',syncError='',loginSentTo='',refreshing=null;
function readJSON(k){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v==='object'?v:null}catch{return null}}
function writeJSON(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch{}}
function loadSync(){
 const s=readJSON(AUTH_KEY);session=s&&s.refresh_token&&s.user?.id?s:null;
 const m=readJSON(SYNC_KEY)||{},list=v=>Array.isArray(v)?[...new Set(v.map(String))]:[];
 syncMeta={userId:String(m.userId||''),lastPull:String(m.lastPull||''),dirty:list(m.dirty),removed:list(m.removed),lastSync:String(m.lastSync||''),email:String(m.email||''),backupFor:String(m.backupFor||''),keysDirty:list(m.keysDirty).filter(k=>k==='kakao'||k==='gemini'),cacheSeeded:String(m.cacheSeeded||'')};
}
const saveSync=()=>writeJSON(SYNC_KEY,syncMeta);
const saveSession=()=>writeJSON(AUTH_KEY,session);
const pendingCount=()=>syncMeta.dirty.length+syncMeta.removed.length;
function snapBooks(list){syncSnap=new Map(list.map(b=>[b.id,JSON.stringify(b)]))}
// persist()가 저장에 성공할 때마다 부릅니다. 바뀐 책은 '올릴 책', 사라진 책은 '지운 책'으로 적어 둡니다.
// 로그인하지 않았을 때도 적어 두어, 나중에 로그인하면 그때 올립니다.
function trackChanges(list){
 const next=new Map(),dirty=new Set(syncMeta.dirty),removed=new Set(syncMeta.removed);let mod=false;
 for(const b of list){
  const s=JSON.stringify(b);next.set(b.id,s);
  if(!applyingRemote&&syncSnap.get(b.id)!==s){dirty.add(b.id);removed.delete(b.id);mod=true}
 }
 for(const k of syncSnap.keys())if(!next.has(k)){dirty.delete(k);if(!applyingRemote)removed.add(k);mod=true}
 syncSnap=next;
 if(mod){syncMeta.dirty=[...dirty];syncMeta.removed=[...removed];saveSync()}
 if(mod&&!applyingRemote&&session)scheduleSync(1500);
 updateSyncStatus();
}
function jwtPayload(t){
 try{let p=String(t).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');p+='='.repeat((4-p.length%4)%4);return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p),c=>c.charCodeAt(0))))}catch{return {}}
}
function setSession(d){
 const p=jwtPayload(d.access_token),uid=d.user?.id||p.sub;
 if(!d.access_token||!uid)return false;
 session={access_token:String(d.access_token),refresh_token:String(d.refresh_token||session?.refresh_token||''),
  expires_at:Number(d.expires_at)||Number(p.exp)||Math.floor(Date.now()/1000)+(Number(d.expires_in)||3600),
  user:{id:String(uid),email:String(d.user?.email||p.email||session?.user?.email||'')}};
 saveSession();return true;
}
function signedOut(msg){session=null;saveSession();syncState='idle';syncError='';clearTimeout(syncTimer);syncTimer=0;if(msg)flash(msg);softRender()}
// 접속 토큰은 1시간마다 바뀝니다. 만료 1분 전이면 새로 받습니다. 동시에 여러 번 받지 않도록 하나로 묶습니다.
function refreshSession(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  try{
   const r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session?.refresh_token||''})});
   const d=await r.json().catch(()=>null);
   if(r.ok&&d?.access_token)return setSession(d);
   // 서버가 로그인 정보를 거절한 경우에만 로그아웃합니다. 인터넷이 끊긴 경우는 그대로 두고 나중에 다시 시도합니다.
   if(r.status>=400&&r.status<500)signedOut('로그인이 만료됐어요. 설정에서 다시 로그인해 주세요. 서재는 이 브라우저에 그대로 있어요.');
   return false;
  }catch{return false}
  finally{refreshing=null}
 })();
 return refreshing;
}
async function accessToken(){
 if(!session)return '';
 if(session.expires_at*1000-Date.now()<60000)await refreshSession();
 return session?.access_token||'';
}
async function sbFetch(path,{method='GET',body,prefer='',auth=true,retry=true}={}){
 const headers={apikey:SB_KEY};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(prefer)headers.Prefer=prefer;
 if(auth){const t=await accessToken();if(!t){const e=Error('로그인이 필요해요.');e.auth=true;throw e}headers.Authorization='Bearer '+t}
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
 let r;
 try{r=await fetch(SB_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:ctl.signal})}
 catch(err){const e=Error(err.name==='AbortError'?'서버 응답이 늦어요.':'서버에 연결하지 못했어요(인터넷 연결 확인).');e.network=true;throw e}
 finally{clearTimeout(timer)}
 if(r.status===401&&auth&&retry&&session){if(await refreshSession())return sbFetch(path,{method,body,prefer,auth,retry:false})}
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok){const e=Error(String(data?.msg||data?.message||data?.error_description||data?.error||('HTTP '+r.status)).slice(0,160));e.status=r.status;e.code=String(data?.error_code||data?.code||'');if(r.status===401)e.auth=true;throw e}
 return data;
}
// 메일의 로그인 링크를 누르면 이 앱 주소 뒤에 #access_token=… 이 붙어 열립니다. 그 값을 받아 로그인하고 주소창은 깨끗하게 지웁니다.
function handleAuthRedirect(){
 const h=location.hash||'';
 if(!/access_token=|error_code=|error_description=/.test(h))return;
 const p=new URLSearchParams(h.slice(1));
 try{history.replaceState(null,'',location.pathname+location.search)}catch{}
 if(p.get('access_token')){
  if(setSession({access_token:p.get('access_token'),refresh_token:p.get('refresh_token'),expires_in:p.get('expires_in'),expires_at:p.get('expires_at')}))flash('로그인했어요. 서재를 불러오는 중…');
  else flash('로그인 정보를 읽지 못했어요. 설정에서 다시 시도해 주세요.');
 }else{
  const code=p.get('error_code')||'';
  flash(code==='otp_expired'?'로그인 링크가 만료됐거나 이미 사용됐어요. 설정에서 새 링크를 받아 주세요.':'로그인하지 못했어요: '+(p.get('error_description')||code||'알 수 없는 오류'));
 }
}
async function sendLoginLink(){
 const email=($('#sync-email')?.value||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){flash('이메일 주소를 확인해 주세요.');return}
 const redirect=location.protocol==='https:'?location.origin+location.pathname:APP_URL;
 syncMeta.email=email;saveSync();
 const btn=$('[data-action="sync-login"]');if(btn){btn.disabled=true;btn.textContent='보내는 중…'}
 try{
  await sbFetch('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),{method:'POST',auth:false,body:{email,create_user:true}});
  loginSentTo=email;render();flash('로그인 링크를 보냈어요. 메일함을 확인해 주세요.');
 }catch(err){
  if(btn){btn.disabled=false;btn.textContent='로그인 링크 받기'}
  flash(err.status===429?'메일을 너무 자주 요청했어요. 잠시 뒤에 다시 시도해 주세요.':/signups? not allowed/i.test(err.message)?'이 이메일로는 가입할 수 없어요. 처음 로그인한 이메일을 쓰세요.':'링크를 보내지 못했어요: '+err.message);
 }
}
function scheduleSync(ms=1500){if(!session)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncTimer=0;syncNow()},ms)}
// 동기화 한 번: ① 클라우드에서 바뀐 책 받기 → ② 이 브라우저에서 바뀐 책 올리기 → ③ 지운 책 표시하기
// 아직 올리지 못한 책은 이 브라우저의 것을 우선합니다. 같은 사람이 쓰는 앱이라 충돌은 드뭅니다.
async function syncNow(){
 if(!session)return;
 if(navigator.onLine===false){updateSyncStatus();return} // v2.14.0: 오프라인이면 보내지 않고 'online' 이벤트에서 다시 시도합니다.
 if(syncBusy){syncAgain=true;return}
 if(loadProblem||storageProblem){syncState='error';syncError='이 브라우저의 저장소 문제로 동기화를 멈췄어요.';updateSyncStatus();return}
 syncBusy=true;syncState='busy';updateSyncStatus();
 const wasEmpty=!books.length;
 try{
  const uid=session.user.id;
  if(syncMeta.userId!==uid){syncMeta.userId=uid;syncMeta.lastPull='';saveSync()}
  const first=!syncMeta.lastPull;
  // 이 계정으로 처음 동기화할 때, 이 브라우저에 책이 있으면 먼저 JSON 백업을 한 번 받아 둡니다.
  if(first&&books.length&&syncMeta.backupFor!==uid){exportData();syncMeta.backupFor=uid;saveSync()}
  // ① 받기. 서버 시각 기준으로 마지막으로 받은 뒤 바뀐 줄만 받고, 10초를 겹쳐 받아 빠뜨리지 않습니다.
  const since=syncMeta.lastPull?new Date(Date.parse(syncMeta.lastPull)-10000).toISOString():'';
  const rows=[];
  for(let off=0;;off+=1000){
   const page=await sbFetch(`/rest/v1/books?select=id,data,deleted,updated_at&order=updated_at.asc,id.asc&limit=1000&offset=${off}`+(since?'&updated_at=gte.'+encodeURIComponent(since):''));
   if(!Array.isArray(page))break;rows.push(...page);if(page.length<1000)break;
  }
  const keepLocal=new Set([...syncMeta.dirty,...syncMeta.removed]);
  const next=books.slice(),pos=new Map(next.map((b,i)=>[b.id,i])),seen=new Set();
  let changed=false,maxAt=syncMeta.lastPull;
  for(const row of rows){
   const rid=String(row.id||'');if(!rid)continue;seen.add(rid);
   if(row.updated_at&&(!maxAt||Date.parse(row.updated_at)>Date.parse(maxAt)))maxAt=String(row.updated_at);
   if(keepLocal.has(rid))continue;
   if(row.deleted){if(pos.has(rid)&&next[pos.get(rid)]){next[pos.get(rid)]=null;changed=true}continue}
   if(!row.data||typeof row.data.title!=='string'||!row.data.title.trim())continue;
   const nb=normalize({...row.data,id:rid}),s=JSON.stringify(nb);
   if(pos.has(rid)){if(syncSnap.get(rid)===s)continue;next[pos.get(rid)]=nb}else{pos.set(rid,next.length);next.push(nb)}
   changed=true;
  }
  if(changed){
   const list=next.filter(Boolean);
   applyingRemote=true;let ok=false;
   try{ok=persist(list)}finally{applyingRemote=false}
   if(!ok)throw Error('받은 서재를 이 브라우저에 저장하지 못했어요.');
   books=list;softRender();
  }
  // 처음 동기화라면, 클라우드에 없는 이 브라우저의 책을 모두 올릴 목록에 넣습니다.
  if(first){const d=new Set(syncMeta.dirty);for(const b of books)if(!seen.has(b.id))d.add(b.id);syncMeta.dirty=[...d];saveSync()}
  // ② 올리기(50권씩)
  syncMeta.dirty=syncMeta.dirty.filter(k=>syncSnap.has(k));
  const ids=[...syncMeta.dirty];
  for(let i=0;i<ids.length;i+=50){
   const chunk=ids.slice(i,i+50).map(k=>books.find(b=>b.id===k)).filter(Boolean);if(!chunk.length)continue;
   const sent=chunk.map(b=>[b.id,syncSnap.get(b.id)]);
   await sbFetch('/rest/v1/books?on_conflict=user_id,id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:chunk.map(b=>({user_id:uid,id:b.id,data:b,deleted:false}))});
   // 올리는 사이에 또 고친 책은 목록에 남겨 두었다가 다음에 다시 올립니다.
   const done=new Set(sent.filter(([k,s])=>syncSnap.get(k)===s).map(([k])=>k));
   syncMeta.dirty=syncMeta.dirty.filter(k=>!done.has(k));saveSync();
  }
  // ③ 지운 책: 클라우드에서도 지우지 않고 '삭제됨' 표시만 합니다. 책 내용은 서버에 남아 있어 되살릴 수 있습니다.
  const rem=[...syncMeta.removed];
  for(let i=0;i<rem.length;i+=50){
   const chunk=rem.slice(i,i+50);
   await sbFetch('/rest/v1/books?id=in.'+encodeURIComponent('('+chunk.map(k=>'"'+k.replace(/["\\]/g,'')+'"').join(',')+')'),{method:'PATCH',prefer:'return=minimal',body:{deleted:true}});
   syncMeta.removed=syncMeta.removed.filter(k=>!chunk.includes(k));saveSync();
  }
  // ④ 키 보관. 실패해도 책 동기화는 성공으로 둡니다.
  try{if(await syncKeys()&&wasEmpty)flash('저장해 둔 API 키를 불러왔어요.')}catch(err){console.error('[나의 서재] 키 동기화 실패',err);keySyncError=err.status===404||/user_settings|PGRST205|schema cache/i.test(err.message+' '+err.code)?'키를 보관할 표가 아직 없어요(SQL 실행 필요).':err.message}
  // ⑤ 이미 정리된 내 책들을 공유 기록에 한 번 올립니다(처음 만든 기록이 내 것이 되도록).
  if(syncMeta.cacheSeeded!==uid+'|k2'){try{await putCache(books);syncMeta.cacheSeeded=uid+'|k2';saveSync()}catch(err){console.warn('[나의 서재] 공유 기록 올리기 실패',err.message)}}
  if(maxAt)syncMeta.lastPull=maxAt;
  syncMeta.lastSync=new Date().toISOString();saveSync();
  syncState='ok';syncError='';
  if(wasEmpty&&books.length)flash(`클라우드에서 서재를 불러왔어요 (${books.length}권).`);
  else if(first&&ids.length)flash(`서재 ${ids.length}권을 클라우드에 올렸어요.`);
 }catch(err){
  console.error('[나의 서재] 동기화 실패',err);
  if(err.auth&&!session){/* signedOut에서 이미 알렸습니다 */}
  else{syncState='error';syncError=err.message||'알 수 없는 오류';scheduleSync(60000)}
 }finally{
  syncBusy=false;updateSyncStatus();
  if(syncAgain){syncAgain=false;scheduleSync(300)}
 }
}

// ---------- 키 보관 (v2.10.0) ----------
// 카카오·Gemini 키를 내 계정의 user_settings 표에도 저장합니다(본인만 읽을 수 있음). 로그인하면 이 브라우저의 기존 저장 칸에 다시 채웁니다.
// 규칙: 이 브라우저에서 새로 저장·삭제한 키가 우선이고, 그 밖에는 클라우드의 값을 따릅니다. 클라우드에 아직 아무것도 없으면 이 브라우저의 키를 올립니다.
const KEY_COLS={kakao:['kakao_key','my-library-kakao-key-v1'],gemini:['gemini_key','my-library-gemini-key-v1']};
function markKeyDirty(kind){const s=new Set(syncMeta.keysDirty);s.add(kind);syncMeta.keysDirty=[...s];saveSync();if(session)scheduleSync(300)}
async function syncKeys(){
 const uid=session.user.id,startDirty=[...syncMeta.keysDirty];
 const rows=await sbFetch('/rest/v1/user_settings?select=kakao_key,gemini_key&limit=1');
 const row=Array.isArray(rows)&&rows[0]||null,up={};let changedLocal=false;
 for(const [kind,[col,store]] of Object.entries(KEY_COLS)){
  let local='';try{local=(localStorage.getItem(store)||'').trim()}catch{}
  if(startDirty.includes(kind)||!row){if(row||local)up[col]=local;continue}
  const cloud=String(row[col]||'').trim();
  if(cloud===local)continue;
  try{cloud?localStorage.setItem(store,cloud):localStorage.removeItem(store)}catch{}
  changedLocal=true;
  if(kind==='gemini')clearPause();else{apiCache.clear();apiCooldownUntil=0}
 }
 if(Object.keys(up).length)await sbFetch('/rest/v1/user_settings?on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:uid,...up}});
 syncMeta.keysDirty=syncMeta.keysDirty.filter(k=>!startDirty.includes(k));saveSync();
 keySyncError='';
 if(changedLocal&&view==='settings'&&!dialog)render();
 return changedLocal;
}

// ---------- 작품 공유 기록 (v2.11.0) ----------
// 소개·태그·상징은 작품마다 처음 만들어진 것으로 고정합니다. 같은 작품(정리된 제목 + 저자)을 누군가 이미 정리했다면 AI를 부르지 않고 그 기록을 씁니다.
// 판본(출판사·번역본)이 달라도 같은 작품이면 같은 기록을 씁니다. 공유 기록은 로그인한 사람만 읽을 수 있고, 한 번 저장되면 고칠 수 없습니다(상징 그림만 비어 있을 때 한 번 채움).
function workKeyOf(b){
 try{const c=canonicalWork({title:b.workTitle||b.title,author:b.author});return c.key&&c.authorKey?`${c.key}|${c.authorKey}`.replace(/["\\]/g,'').slice(0,200):''}catch{return ''}
}
async function cacheLookup(list){
 const out=new Map();if(!session)return out;
 const keys=[...new Set(list.map(workKeyOf).filter(Boolean))];
 for(let i=0;i<keys.length;i+=40){
  const chunk=keys.slice(i,i+40);
  const rows=await sbFetch('/rest/v1/work_cache?select=key,summary,tags,motif_idea,custom_motif&key=in.'+encodeURIComponent('('+chunk.map(k=>'"'+k+'"').join(',')+')'));
  for(const r of Array.isArray(rows)?rows:[])if(r&&r.key&&r.summary)out.set(String(r.key),r);
 }
 return out;
}
// 공유 기록을 책에 붙입니다. 저장할 때 normalize가 길이·태그·그림을 다시 검사합니다.
function applyCache(x,row){
 // v2.14.1: 이미 정해진 내 상징 이름·그림은 공유 기록으로 덮지 않습니다. 비어 있을 때만 공유 기록을 씁니다.
 const rowIdea=cleanIdea(row.motif_idea),idea=x.motifIdea||rowIdea;
 const drawn=!!row.custom_motif&&!!idea&&idea===rowIdea&&x.motifDrawnFor!==idea&&(x.motif==='auto'||x.motif==='custom');
 return normalize({...x,aiSummary:String(row.summary||''),aiTags:Array.isArray(row.tags)?row.tags:[],motifIdea:idea,aiAt:new Date().toISOString(),...(drawn?{customMotif:String(row.custom_motif),motifDrawnFor:idea}:{})});
}
function cacheRowOf(b){
 return {key:workKeyOf(b),title:String(b.workTitle||b.title||'').slice(0,150),author:cleanAuthor(b.author).slice(0,120),summary:String(b.aiSummary||'').slice(0,400),tags:Array.isArray(b.aiTags)?b.aiTags:[],motif_idea:String(b.motifIdea||'').slice(0,60),custom_motif:b.motifIdea&&b.motifDrawnFor===b.motifIdea?String(b.customMotif||'').slice(0,4000):''};
}
async function putCache(list){
 const seen=new Set(),rows=[];
 for(const b of list){if(!b||!b.aiSummary)continue;const r=cacheRowOf(b);if(!r.key||seen.has(r.key))continue;seen.add(r.key);rows.push(r)}
 for(let i=0;i<rows.length;i+=50)await sbFetch('/rest/v1/work_cache',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:rows.slice(i,i+50)});
}
// AI로 처음 정리한 책을 공유 기록에 남깁니다. 이미 누가 남겼으면 그대로 둡니다. 실패해도 내 서재에는 영향이 없습니다.
function shareAnalysis(list){
 if(!session)return Promise.resolve();
 return putCache(list).catch(err=>console.warn('[나의 서재] 공유 기록 저장 실패',err.message));
}
// AI로 처음 그린 상징을, 같은 상징으로 정리된 공유 기록에 그림이 아직 없을 때만 채웁니다.
function shareMotif(b,idea,inner){
 const k=workKeyOf(b);if(!session||!k||!idea||!inner)return;
 sbFetch('/rest/v1/work_cache?key=eq.'+encodeURIComponent(k)+'&motif_idea=eq.'+encodeURIComponent(idea)+'&custom_motif=eq.',{method:'PATCH',prefer:'return=minimal',body:{custom_motif:inner}}).catch(err=>console.warn('[나의 서재] 공유 상징 저장 실패',err.message));
}
function syncStatusText(){
 if(!session)return books.length?'이 브라우저에만 저장됨 · 로그인':'';
 const n=pendingCount();
 if(syncState==='busy')return '☁ 동기화 중…';
 if(syncState==='error')return `☁ 연결 안 됨${n?` · 올릴 변경 ${n}건`:''}`;
 if(n)return `☁ 올릴 변경 ${n}건`;
 return syncMeta.lastSync?`☁ 클라우드에 저장됨 · ${fmtWhen(syncMeta.lastSync)}`:'☁ 연결됨';
}
function syncDetailText(){
 const n=pendingCount();
 if(syncState==='busy')return '동기화하는 중이에요…';
 if(syncState==='error')return `마지막 동기화가 실패했어요: ${syncError}. 1분 뒤 자동으로 다시 시도해요.${n?` 아직 올리지 못한 변경 ${n}건은 이 브라우저에 안전하게 남아 있어요.`:''}`;
 return (syncMeta.lastSync?`마지막 동기화: ${fmtWhen(syncMeta.lastSync)}.`:'아직 동기화하지 않았어요.')+(n?` 올릴 변경 ${n}건이 곧 올라가요.`:' 모든 변경이 클라우드에 저장돼 있어요.')+(keySyncError?` 키 보관 실패: ${keySyncError}`:' API 키도 내 계정에 보관돼요.');
}
function updateSyncStatus(){document.querySelectorAll('[data-sync-status]').forEach(el=>{const k=el.dataset.syncStatus;el.textContent=k==='long'?syncDetailText():k==='top'?syncTopText():syncStatusText();if(k==='top')el.dataset.syncTone=syncTone()})}
// v2.14.0(U06): 화면 위쪽의 짧은 저장 상태. 책 동기화와 키 보관 실패를 따로 말합니다.
function syncTopText(){if(!session)return books.length?'이 기기에만 저장':'';const n=pendingCount(),off=navigator.onLine===false,key=keySyncError?' · 키 보관 실패':'';
 if(off)return `오프라인 · 이 기기에 저장됨${n?` · 올릴 변경 ${n}건`:''}`;if(syncState==='busy')return '동기화 중…';
 if(syncState==='error')return `동기화 실패${n?` · 올릴 변경 ${n}건 보관 중`:''}`;if(n)return `업로드 대기 ${n}건${key}`;return `클라우드에 저장됨${key}`}
function syncTone(){if(!session)return 'local';if(navigator.onLine===false||syncState==='error')return 'warn';if(syncState==='busy'||pendingCount())return 'pending';return keySyncError?'warn':'ok'}
window.addEventListener('offline',()=>updateSyncStatus());window.addEventListener('online',()=>updateSyncStatus());
function syncPanelHTML(){
 if(!session)return `<div class="eyebrow">CLOUD SYNC</div><h3>클라우드에 서재 보관하기</h3><p>이메일로 로그인하면 서재가 클라우드에 저장됩니다. 브라우저 데이터가 지워지거나 다른 기기에서 열어도, 로그인만 하면 그대로 돌아와요.</p><div class="field"><label for="sync-email">이메일</label><input id="sync-email" type="email" autocomplete="email" inputmode="email" maxlength="200" placeholder="you@example.com" value="${esc(syncMeta.email)}"></div><div class="actions" style="justify-content:flex-start"><button class="btn primary" data-action="sync-login">로그인 링크 받기</button></div>${loginSentTo?`<p class="api-success">${esc(loginSentTo)}(으)로 로그인 링크를 보냈어요. 메일의 링크를 누르면 이 앱이 다시 열리며 로그인됩니다. 메일이 보이지 않으면 스팸함도 확인해 주세요.</p>`:''}<p class="message">비밀번호는 필요 없어요. 이 계정으로 처음 로그인할 때, 이 브라우저에 책이 있으면 JSON 백업을 한 번 내려받은 뒤 클라우드에 올립니다.</p>`;
 return `<div class="eyebrow">CLOUD SYNC</div><h3>클라우드 동기화</h3><p><strong>${esc(session.user.email||'이메일 계정')}</strong>(으)로 로그인되어 있어요. 책을 저장하면 잠시 뒤 클라우드에도 저장됩니다.</p><p class="message" data-sync-status="long">${esc(syncDetailText())}</p><div class="actions" style="justify-content:flex-start"><button class="btn" data-action="sync-now">지금 동기화</button><button class="btn" data-action="sync-logout">로그아웃</button></div>`;
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session&&Date.now()-(Date.parse(syncMeta.lastSync)||0)>30000)scheduleSync(400)});
window.addEventListener('online',()=>{if(session)scheduleSync(400)});

let loadProblem=false,storageProblem=false,rawCorrupt='';
function load(){loadLocal();snapBooks(books)}
function loadLocal(){
  let raw;
  try{raw=localStorage.getItem(KEY)}catch(e){storageProblem=true;books=[];flash('이 브라우저에서 저장소 접근이 차단되었습니다. http(s) 웹주소에서 실행하거나 브라우저 저장 설정을 확인하세요.');return}
  if(raw===null){books=[];return}
  try{const v=JSON.parse(raw);if(!Array.isArray(v))throw Error('저장 데이터 형식 오류');books=v.filter(b=>b&&typeof b.title==='string'&&b.title.trim()).map(normalize)}
  catch(e){books=[];loadProblem=true;rawCorrupt=raw;flash('기존 저장 데이터에 오류가 있습니다. 복구 전 덮어쓰기를 중단했습니다.')}
}
function persist(candidate){
  try{
    if(loadProblem)throw Error('기존 데이터가 손상되어 덮어쓰기를 차단했습니다.');
    if(storageProblem)throw Error('저장소 접근이 차단되었습니다.');
    localStorage.setItem(KEY,JSON.stringify(candidate));
    if(localStorage.getItem(KEY)!==JSON.stringify(candidate))throw Error('저장 후 검증에 실패했습니다.');
    // v2.9.0: 바뀐 책을 클라우드에 올릴 목록에 적어 둡니다.
    try{trackChanges(candidate)}catch(err){console.error('[나의 서재] 변경 기록 실패',err)}
    return true;
  }catch(e){flash('저장 실패: '+e.message);return false}
}
function commit(candidate,success){if(!persist(candidate))return false;books=candidate;render();if(success)flash(success);return true}
function flash(t){document.querySelector('.toast')?.remove();let d=document.createElement('div');d.className='toast';d.textContent=t;d.setAttribute('role','status');document.body.append(d);setTimeout(()=>d.remove(),4000)}
function hash(s){let h=0;for(let c of s||'')h=((h<<5)-h)+c.charCodeAt(0)|0;return h}
function tab(name,label){return `<button type="button" class="tab ${filter===name?'active':''}" data-filter="${name}">${label}</button>`}
// ---------- 책장 배치 (v2.3.0) ----------
// 선반 안쪽 폭·책등 폭·간격은 CSS 숫자를 복사해 두지 않고, 화면에 그려진 실제 크기를 재서 씁니다.
// 책을 권수가 아니라 "폭의 합"으로 나누므로, 나중에 책마다 두께가 달라져도 spineWidthOf()만 고치면 됩니다.
let shelfMetrics=null,shelfObserver=null,observedShelf=null,shelfFrame=0,shelfMetricKey='',shelfBurst=[];
function emptyShelfHTML(){const loading=!books.length&&session&&syncState==='busy',cloud=!books.length&&!session,hasDone=books.some(b=>b.status==='done'),noMatch=hasDone&&filtersActive();return `<div class="shelf-tier"><div class="books"><div class="empty"><div class="icon">✧</div><h3>${loading?'클라우드에서 서재를 불러오는 중…':noMatch?'검색 결과 없음':hasDone?'표시할 책이 없습니다':'첫 번째 책을 기다리고 있어요'}</h3><p>${loading?'잠시만 기다려 주세요.':noMatch?'조건에 맞는 책이 없어요. 검색어나 필터를 바꾸거나 모두 해제해 보세요.':books.length&&!hasDone?'완독한 책이 아직 없어요. 예전 기록은 설정의 ‘보관 중인 이전 기록’에서 볼 수 있어요.':cloud?'클라우드에 서재를 저장해 두었다면, 로그인하면 그대로 돌아와요.':'당신만의 서재를 한 권씩 채워 보세요.'}</p>${loading?'':noMatch?'<button class="btn primary" data-action="clear-filters">모두 해제</button>':`${cloud?'<button class="btn primary" data-view="settings">로그인하고 서재 불러오기</button> ':''}<button class="btn" data-action="add">+ 책 추가하기</button>`}</div></div></div>`}
function spineHTML(b,m){return `<button class="spine ${spineClass(b)}" type="button" data-book="${esc(b.id)}" style="--color:${spineColorOf(b)};--height:${185+(Math.abs(hash(b.id))%56)}px;${m?`--w:${spineWidthOf(b,m)}px;`:''}--sheen:${(.05+(Math.abs(hash(b.id+'|s'))%5)/100).toFixed(2)}" aria-label="${esc((b.workTitle||b.title)+(b.author?', '+b.author:''))}"><span class="spine-motif">${spineMotif(b)}</span><span class="title" data-max="${titleMaxOf(b)}" data-full="${esc(spineText(b))}">${esc(spineText(b))}</span><span class="spine-status">${b.status==='done'?'●':b.status==='reading'?'◐':'○'}</span>${b.lifeBook?'<span class="ribbon" aria-hidden="true"></span>':''}</button>`}
function tiersHTML(groups,m){return groups.map((group,i)=>`<div><p class="shelf-label">SHELF ${String(i+1).padStart(2,'0')}</p><div class="shelf-tier"><div class="books">${group.map(b=>spineHTML(b,m)).join('')}</div></div></div>`).join('')}
// 보이지 않는 시험용 선반을 잠깐 넣어 크기를 잽니다. 같은 순간에 지우므로 화면에는 나타나지 않습니다.
function measureShelf(shelf){
 const probe=document.createElement('div');
 probe.className='shelf-tier';probe.style.visibility='hidden';probe.setAttribute('aria-hidden','true');
 probe.innerHTML='<div class="books"><button class="spine" type="button" tabindex="-1"></button></div>';
 shelf.append(probe);
 const row=probe.firstElementChild,sp=row.firstElementChild;
 const rs=getComputedStyle(row),base=sp.getBoundingClientRect().width;
 const m={inner:row.getBoundingClientRect().width,spine:base,gap:parseFloat(rs.columnGap)||0,min:parseFloat(rs.getPropertyValue('--spine-min'))||base,max:parseFloat(rs.getPropertyValue('--spine-max'))||base};
 probe.remove();
 return m.inner>0&&m.spine>0?m:null;
}
// ---------- 책등 디자인 체계 (v2.7.0) ----------
// 여섯 가지 유형이 공통 틀(세로 제목·상징 위치·여백)을 나누어 쓰고, 유형마다 장식·글꼴·질감만 다릅니다.
// 자동 유형과 자동 색은 책 ID로 정해서 새로고침해도 바뀌지 않고, 사용자가 고른 값이 늘 먼저입니다.
const SPINE_TYPES={auto:'자동 추천',A:'Classic Serif — 고전 양장본',B:'Minimal Label — 미니멀',C:'Framed Edition — 프레임 소장본',D:'Emblem — 상징 중심',E:'Band — 띠 구획',F:'Heritage — 천장정 장서'};
const TYPE_WEIGHTS=[['A',30],['B',18],['C',15],['D',12],['E',15],['F',10]];
const SPINE_FAMILIES={
 forest:{dark:['#2f4a3d','#38503c','#44533f'],mid:['#5e6e55','#6c7a5e'],light:['#a4ae95']},
 wine:{dark:['#5a2e33','#6b3438','#6e3f36'],mid:['#8c5545','#9a6650'],light:['#c49c88']},
 ink:{dark:['#26344a','#2f3d4f','#384656'],mid:['#56657a','#66758a'],light:['#a6b0bd']},
 leather:{dark:['#4a3527','#5a4130','#6a4d36'],mid:['#8a6a4c','#9c7f5e'],light:['#d3c2a2']},
 plum:{dark:['#3f2d3f','#4d3647','#574250'],mid:['#786273','#857870'],light:['#b9a9b1']}
};
// 유형마다 어울리는 색 계열과 명도 배합(어두운·중간·밝은 %)
const TYPE_COLOR={A:{fam:['forest','wine','ink','leather'],mix:[60,30,10]},B:{fam:['leather','forest','ink','plum'],mix:[25,45,30]},C:{fam:['forest','wine','ink','leather','plum'],mix:[60,30,10]},D:{fam:['forest','wine','ink','leather','plum'],mix:[60,30,10]},E:{fam:['forest','wine','ink','leather','plum'],mix:[55,35,10]},F:{fam:['forest','wine','ink','leather','plum'],mix:[100,0,0]}};
const hpos=(b,salt)=>Math.abs(hash(String(b.id)+'|'+salt));
function autoTypeOf(b){
 // 인생책은 Heritage나 Emblem을 먼저 권합니다.
 if(b.lifeBook)return hpos(b,'life')%10<6?'F':'D';
 let r=hpos(b,'t')%100;for(const [t,w] of TYPE_WEIGHTS){if(r<w)return t;r-=w}return 'A';
}
const typeOf=b=>b.spineType&&b.spineType!=='auto'&&SPINE_TYPES[b.spineType]?b.spineType:autoTypeOf(b);
function autoColorOf(b){
 const rule=TYPE_COLOR[typeOf(b)]||TYPE_COLOR.A,h=hpos(b,'c');
 const fam=SPINE_FAMILIES[rule.fam[h%rule.fam.length]],r=(h>>5)%100;
 const tier=r<rule.mix[0]?fam.dark:r<rule.mix[0]+rule.mix[1]?fam.mid:fam.light;
 return tier[(h>>11)%tier.length];
}
const spineColorOf=b=>b.colorMode==='auto'?autoColorOf(b):safeColor(b.color);
function isLightColor(hex){const v=parseInt(String(hex).slice(1),16),r=v>>16&255,g=v>>8&255,bl=v&255;return (0.2126*r+0.7152*g+0.0722*bl)/255>0.5}
function spineClass(b){const t=typeOf(b);return `t-${t.toLowerCase()}${b.lifeBook?' life':''}${isLightColor(spineColorOf(b))?' light':''}`}
// Minimal은 작은 제목이 특징이라 제목 크기 상한을 낮춥니다.
const titleMaxOf=b=>typeOf(b)==='B'?11:12;
// ---------- 긴 제목 (v2.4.0) ----------
// 책등에 보일 글: 사용자가 정한 책등 표시명이 있으면 그것, 없으면 작품명. 원래 제목 데이터는 건드리지 않습니다.
const spineText=b=>b.spineTitle||b.workTitle||b.title;
// [글자 크기 px, 글자 간격 px]. 위에서부터 한 줄에 들어가는 가장 큰 크기를 고릅니다.
const TITLE_TIERS=[[12,1.5],[11,1],[10,.5],[9,0]];
const CJK_RE=/[ᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-￯]/;
// 세로쓰기에서 한 글자가 차지하는 길이(글자 크기 대비). 한글·한자는 1, 옆으로 눕는 영문·숫자는 그보다 짧습니다.
function glyphEm(ch){return /\s/.test(ch)?.33:CJK_RE.test(ch)?1:/[A-Za-z0-9]/.test(ch)?.62:/\p{Extended_Pictographic}/u.test(ch)?1.1:.8}
function titleRun(text,f,ls){let n=0;for(const ch of text)n+=glyphEm(ch)*f+ls;return n}
// 화면에 보일 글만 끝을 줄임표로 줄입니다. 저장된 제목은 그대로입니다.
function cutTitle(text,cap,f,ls){
 let out='',len=0;
 for(const ch of text){const w=glyphEm(ch)*f+ls;if(len+w>cap-f)return out.trimEnd()+'…';out+=ch;len+=w}
 return out;
}
function setTitle(x,f,ls,cols,text){
 const st=x.el.style;
 st.fontSize=f+'px';st.letterSpacing=ls+'px';st.lineHeight=cols>1?'1.25':'1.2';st.whiteSpace=cols>1?'normal':'nowrap';
 x.el.textContent=text;x.f=f;x.ls=ls;x.cols=cols;
}
function chooseTitle(x){
 // 실제 책등처럼 제목은 한 줄로만 씁니다. 들어가는 가장 큰 크기를 고르고, 9px로도 길면 끝을 줄임표로 줄입니다.
 // 글꼴에 따라 세로쓰기 글자가 반 글자쯤 밀려 그려지기도 해서, 글자 한 개 크기만큼 여유를 남깁니다.
 const max=Number(x.el.dataset.max)||12;
 for(const [f,ls] of TITLE_TIERS)if(f<=max&&titleRun(x.text,f,ls)<=x.A-f){x.cap=x.A-f;return setTitle(x,f,ls,1,x.text)}
 x.cap=x.A-9;
 setTitle(x,9,0,1,cutTitle(x.text,x.cap,9,0));
}
function fitSpineTitles(root){
 const els=[...root.querySelectorAll('.spine .title[data-full]')];if(!els.length)return;
 // 읽기를 한꺼번에, 쓰기를 한꺼번에 해서 책이 500권이어도 화면 계산이 몇 번만 일어나게 합니다.
 const cs=getComputedStyle(els[0].parentElement),padX=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
 const boxes=els.map(el=>({el,A:el.clientHeight,W:el.parentElement.clientWidth-padX,text:el.dataset.full||''}));
 for(const x of boxes)if(x.A>0&&x.W>0)chooseTitle(x);
 // 추정이 빗나가 넘친 제목만 조금 더 줄입니다.
 for(let round=0;round<3;round++){
  // 글자가 차지한 실제 영역까지 재서, 글꼴이 예상보다 길게 그려져도 잘리지 않게 합니다.
  const over=boxes.filter(x=>{if(!x.f)return false;const el=x.el;if(el.scrollHeight>el.clientHeight+1)return true;const rg=document.createRange();rg.selectNodeContents(el);return rg.getBoundingClientRect().height>el.clientHeight+.5});
  if(!over.length)break;
  for(const x of over){x.cap*=.85;setTitle(x,x.f,x.ls,x.cols,cutTitle(x.text,x.cap,x.f,x.ls))}
 }
}
// 마우스를 올리거나 키보드로 고르면 정식 제목과 저자를 작게 보여 줍니다(터치 화면에서는 책을 열어 확인).
let spineTip=null;
function hideSpineTip(){if(spineTip)spineTip.hidden=true}
function showSpineTip(el){
 const b=books.find(x=>x.id===el.dataset.book);if(!b)return;
 if(!spineTip){spineTip=document.createElement('div');spineTip.className='spine-tip';spineTip.setAttribute('role','tooltip');document.body.append(spineTip)}
 spineTip.innerHTML=`<strong>${esc(b.workTitle||b.title)}</strong><small>${esc(cleanAuthor(b.author)||'작가 미상')}</small>`;
 spineTip.hidden=false;
 const r=el.getBoundingClientRect(),t=spineTip.getBoundingClientRect();
 let left=r.left+r.width/2-t.width/2;left=Math.max(8,Math.min(left,innerWidth-t.width-8));
 let top=r.top-t.height-22;if(top<8)top=r.bottom+8;
 spineTip.style.left=left+'px';spineTip.style.top=top+'px';
}
document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const s=e.target.closest?.('.spine[data-book]');if(s)showSpineTip(s)});
document.addEventListener('pointerout',e=>{const s=e.target.closest?.('.spine[data-book]');if(s&&!s.contains(e.relatedTarget))hideSpineTip()});
document.addEventListener('focusin',e=>{const s=e.target.closest?.('.spine[data-book]');if(s&&s.matches(':focus-visible'))showSpineTip(s)});
document.addEventListener('focusout',e=>{if(e.target.closest?.('.spine[data-book]'))hideSpineTip()});
document.addEventListener('click',hideSpineTip,true);
window.addEventListener('scroll',hideSpineTip,{passive:true});
// 웹 글꼴이 늦게 도착하면 글자 폭이 조금 달라지므로 제목만 한 번 더 맞춥니다.
const refitTitles=()=>{const sh=$('.shelf');if(sh)fitSpineTitles(sh)};
document.fonts?.ready?.then(refitTitles).catch(()=>{});
document.fonts?.addEventListener?.('loadingdone',refitTitles);
// 책 한 권이 선반에서 차지하는 폭. 지금은 모든 책이 같은 폭입니다.
// 두께 비율 0~1. 쪽수를 알면 80쪽→가장 얇게, 1000쪽→가장 두껍게(로그 눈금). 모르면 책 ID로 정한 0.15~0.85 사이의 고정값입니다.
// 이 두께는 장식이라 화면 어디에도 쪽수처럼 표시하지 않습니다. 다시 그려도 바뀌지 않습니다.
function thicknessOf(b){
 if(b.pages>0)return Math.max(0,Math.min(1,(Math.log(b.pages)-Math.log(80))/(Math.log(1000)-Math.log(80))));
 return .15+(Math.abs(hash(b.id+'|w'))%71)/100;
}
function spineWidthOf(b,m){return Math.round((m.min+thicknessOf(b)*(m.max-m.min))*2)/2}
function packShelves(list,m){
 const room=m.inner-0.5; // 소수점 계산 오차 여유
 const groups=[];let cur=[],used=0;
 for(const b of list){
  const w=spineWidthOf(b,m),need=cur.length?used+m.gap+w:w;
  if(cur.length&&need>room){groups.push(cur);cur=[b];used=w}else{cur.push(b);used=need}
 }
 if(cur.length)groups.push(cur);
 return groups;
}
// force=false(선반 크기 변화로 불릴 때)는 잰 값이 그대로면 다시 그리지 않습니다.
function layoutShelf(force=true){
 const shelf=$('.shelf');if(!shelf)return;
 watchShelf(shelf);
 const m=measureShelf(shelf)||shelfMetrics;
 const key=m?[m.inner,m.spine,m.gap].map(x=>x.toFixed(1)).join('|'):'';
 if(!force&&key===shelfMetricKey)return;
 shelfMetricKey=key;
 const shown=getShown();
 if(!shown.length){shelf.innerHTML=emptyShelfHTML();return}
 if(m)shelfMetrics=m;
 // 잴 수 없을 때(화면이 숨겨진 경우 등)는 한 선반에 모두 두고 줄바꿈 안전망에 맡깁니다.
 hideSpineTip();
 shelf.innerHTML=tiersHTML(m?packShelves(shown,m):[shown],m);
 fitSpineTitles(shelf);
}
function scheduleShelf(){
 if(shelfFrame)return;
 shelfFrame=requestAnimationFrame(()=>{
  shelfFrame=0;
  // 스크롤바가 생겼다 사라지며 크기가 계속 흔들리는 드문 경우를 막습니다.
  const now=Date.now();shelfBurst=shelfBurst.filter(t=>now-t<1000);
  if(shelfBurst.length>=8)return;
  shelfBurst.push(now);
  layoutShelf(false);
 });
}
function watchShelf(shelf){
 if(!('ResizeObserver' in window)||observedShelf===shelf)return;
 if(!shelfObserver)shelfObserver=new ResizeObserver(scheduleShelf);
 shelfObserver.disconnect();shelfObserver.observe(shelf);observedShelf=shelf;
}

function tagBar(){
 const counts=new Map();
 for(const b of books)if(b.status==='done')for(const t of tagsOf(b))counts.set(t,(counts.get(t)||0)+1);
 if(!counts.size)return '';
 const list=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko')).slice(0,16);
 return `<div class="tagbar">${tagFilter?`<button type="button" class="tagchip active" data-tag="">× 전체 보기</button>`:''}${list.map(([t,n])=>`<button type="button" class="tagchip ${tagFilter===t?'active':''}" data-tag="${esc(t)}">${esc(t)}<span>${n}</span></button>`).join('')}</div>`;
}
function bannerHTML(){
 if(loadProblem)return `<div class="banner" role="alert"><strong>저장된 서재 데이터를 읽지 못했습니다.</strong><br>원본은 지워지지 않았고, 지금은 저장이 잠겨 있습니다. 먼저 원본을 내려받아 보관한 뒤 '새 서재로 시작'을 누르면, 원본을 브라우저의 별도 항목에 남겨 둔 채 빈 서재로 시작합니다. 백업 JSON이 있다면 시작한 뒤 복원하세요.<div class="actions"><button class="btn" data-action="raw-download">원본 내려받기</button><button class="btn danger" data-action="raw-reset">새 서재로 시작</button></div></div>`;
 if(storageProblem)return `<div class="banner" role="alert"><strong>이 브라우저에서 저장소를 쓸 수 없습니다.</strong><br>지금 입력한 내용은 저장되지 않습니다. http(s) 주소로 열거나 브라우저의 사이트 데이터 설정을 확인하세요.</div>`;
 return '';
}
function getShown(){return books.filter(b=>b.status==='done'&&(!tagFilter||tagsOf(b).includes(tagFilter))&&(!shelfFilters.life||b.lifeBook)&&(!shelfFilters.notes||!!b.notes?.trim())&&(!shelfFilters.unrated||!(b.rating>0))&&(`${b.title} ${b.author||''} ${b.workTitle||''} ${b.spineTitle||''} ${b.publisher||''} ${b.summary||''} ${b.aiSummary||''} ${(b.quotes||[]).map(q=>q.text).join(' ')} ${b.notes||''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ko'):sort==='rating'?b.rating-a.rating:new Date(b.createdAt)-new Date(a.createdAt))}
function updateShelf(){const shelf=$('.shelf'),list=$('.booklist');if(!shelf&&!list)return;const shown=getShown();if(list)renderList();else layoutShelf(true);const c=$('.sectionbottom span:last-child');if(c)c.textContent=shown.length+'권 표시 중';const fs=$('#filterSummary');if(fs)fs.innerHTML=filterSummaryHTML(shown.length)}
function render(){const ui=captureDialogUI();const shown=getShown();const done=books.filter(b=>b.status==='done'),rated=done.filter(b=>b.rating>0),average=rated.length?(rated.reduce((s,b)=>s+b.rating,0)/rated.length).toFixed(1):'—';
$('#root').innerHTML=`<div class="app"><aside class="sidebar"><div class="brand">나의 서재<small>MY LIBRARY</small></div><div class="sidegroup"><div class="sidelabel">COLLECTION</div><button class="navitem ${view==='library'?'active':''}" data-view="library">▤ &nbsp; 나의 서재</button><button class="navitem ${view==='insights'?'active':''}" data-view="insights">◈ &nbsp; 독서 통계</button></div><div class="sidegroup"><div class="sidelabel">DATA</div><button class="navitem ${view==='settings'?'active':''}" data-view="settings">⚙ &nbsp; 설정 및 데이터</button></div><p class="sidefoot">A quiet place for<br>the books and thoughts<br>you want to keep.</p></aside><main class="main">${bannerHTML()}${dialog||view==='library'?'':undoBarHTML()}<div class="topbar"><div class="mobilebrand">나의 서재.</div><div class="breadcrumb">MY LIBRARY &nbsp; / &nbsp; ${view==='library'?'COLLECTION':view==='insights'?'INSIGHTS':'SETTINGS'}</div><button type="button" class="syncstatus topsync" data-view="settings" data-sync-status="top" data-sync-tone="${syncTone()}">${esc(syncTopText())}</button><div class="topbuttons">${view==='library'?'<button class="btn" data-action="export">↓ 백업</button><button class="btn primary" data-action="add">+ 책 추가</button>':'<button class="btn" data-view="library">서재로 돌아가기</button>'}</div></div><section class="hero"><div><div class="eyebrow">A PERSONAL COLLECTION</div><h1>${view==='library'?'나의 서재':view==='insights'?'독서 기록의 풍경':'설정 및 데이터'}</h1><p class="desc">${view==='library'?'읽은 책이 머무르고, 사유가 쌓이는 공간.':view==='insights'?'당신의 독서 기록을 돌아봅니다.':'서재의 분위기를 꾸미고 기록을 관리하세요.'}</p></div><div class="count">${done.length} COMPLETED WORKS</div></section><section class="stats" aria-label="완독 기준 통계"><div class="stat"><small>완독 작품</small><strong>${done.length}</strong></div><div class="stat"><small>모은 문장</small><strong>${done.reduce((s,b)=>s+(b.quotes||[]).length,0)}</strong></div><div class="stat"><small>기록한 감상</small><strong>${done.filter(b=>b.notes?.trim()).length}</strong></div><div class="stat"><small>평균 평점</small><strong>${average}</strong></div></section>${view==='library'?`<section class="toolbar"><div class="tabs"><span class="tab active">완독한 작품</span><div class="viewtoggle" role="group" aria-label="보기 방식"><button type="button" data-shelf-view="shelf" aria-pressed="${shelfView!=='list'}">책장</button><button type="button" data-shelf-view="list" aria-pressed="${shelfView==='list'}">목록</button></div></div><div class="searchrow"><input class="search" id="search" type="search" aria-label="책·작가·문장·감상 검색" placeholder="책 · 작가 · 문장 · 감상 검색" value="${esc(search)}"><select class="sort" id="sort" aria-label="정렬"><option value="new" ${sort==='new'?'selected':''}>최근 추가순</option><option value="title" ${sort==='title'?'selected':''}>제목순</option><option value="rating" ${sort==='rating'?'selected':''}>평점순</option></select></div></section>${tagBar()}<div class="filterbar" role="group" aria-label="필터">${[['life','인생책'],['notes','감상 있음'],['unrated','평가 안 함']].map(([k,l])=>`<button type="button" class="tagchip ${shelfFilters[k]?'active':''}" data-filter-toggle="${k}" aria-pressed="${!!shelfFilters[k]}">${l}</button>`).join('')}<span id="filterSummary" class="filtersummary" aria-live="polite">${filterSummaryHTML(shown.length)}</span></div>${dialog?'':undoBarHTML()}${shelfView==='list'?'<ul class="booklist" aria-label="완독한 작품 목록"></ul>':'<div class="shelf"></div>'}<div class="sectionbottom"><span>MY LIBRARY COLLECTION <button type="button" class="syncstatus" data-view="settings" data-sync-status="short">${esc(syncStatusText())}</button></span><span>${shown.length}권 표시 중</span></div><p class="hint">기존에 저장한 읽는 중·읽고 싶은 책은 삭제되지 않고 JSON 백업에 유지되지만 서재에는 완독 도서만 표시됩니다. 책등을 클릭하면 정보, 평점, 독서 기록을 확인할 수 있어요.</p>`:view==='insights'?`<div class="analysis"><div class="eyebrow">READING OVERVIEW</div><h3>당신의 독서 현황</h3><p class="muted">아래 숫자는 서재에 꽂힌 완독 작품 기준이에요.</p><p>완독 ${done.length}권 · 인생책 ${done.filter(b=>b.lifeBook).length}권</p><p>평점을 매긴 완독 도서 ${rated.length}권 · 평균 평점 ${average}</p><p>감상이 있는 책 ${done.filter(b=>b.notes?.trim()).length}권 · 모은 문장 ${done.reduce((s,b)=>s+(b.quotes||[]).length,0)}개 · Notion 링크가 연결된 책 ${done.filter(b=>b.notionUrl).length}권</p>${archivedBooks().length?`<p class="muted">이와 별도로 예전에 남긴 읽는 중 ${books.filter(b=>b.status==='reading').length}권 · 읽고 싶은 책 ${books.filter(b=>b.status==='want').length}권이 보관돼 있어요(서재와 위 숫자에는 넣지 않아요).</p>`:''}</div>`:`<div class="analysis">${syncPanelHTML()}<hr class="setting-divider"><div class="eyebrow">APPEARANCE</div><h3>서재의 색감</h3><p>테마를 선택하면 바로 적용되며 이 브라우저에 기억됩니다.</p><div class="theme-choices">${Object.entries(themeNames).map(([key,label])=>`<button type="button" class="theme-option ${theme===key?'chosen':''}" data-theme="${key}" aria-pressed="${theme===key}"><span class="theme-swatch ${key}"></span><span>${label}</span></button>`).join('')}</div><p class="message">새로 추가하는 책은 여섯 가지 책등 디자인과 30색 팔레트에서 자동으로 어울리는 모습을 갖습니다. 예전에 추가한 책은 원래 색을 지키고 있어요.</p><div class="actions" style="justify-content:flex-start"><button class="btn" data-action="recolor-all">책등 색을 새 팔레트로 다시 배합 (${books.filter(x=>x.colorMode!=='auto').length}권)</button></div><hr class="setting-divider"><div class="eyebrow">BOOK SEARCH</div><h3>도서 검색 연결</h3><p>카카오 책 검색(Daum)을 사용합니다. 제목 중심 검색과 통합 검색을 결합해 연관 작품을 보여주고, 판본을 고르면 출판사·번역자·ISBN·표지가 함께 입력됩니다.</p><p>키 발급: developers.kakao.com 로그인 → 내 애플리케이션 → 앱 추가 → 요약 정보의 <strong>REST API 키</strong> 복사 (Admin 키 아님). 책 검색은 별도 동의항목 신청이 필요 없습니다.</p><div class="field"><label for="gb-key">카카오 REST API 키 (필수)</label><input id="gb-key" type="password" autocomplete="off" placeholder="32자리 REST API 키" value="${esc(getApiKey())}"></div><div class="actions" style="justify-content:flex-start"><button class="btn" data-action="save-key">키 저장</button>${pendingAdd?'<button class="btn primary" data-action="resume-add">작성하던 책으로 돌아가기</button><button class="btn" data-action="drop-add">작성하던 내용 버리기</button>':''}</div><p class="message">${session?'로그인되어 있어 키가 내 계정에도 보관됩니다. 재부팅하거나 다른 기기에서 열어도 로그인하면 자동으로 채워져요.':'지금은 키가 이 브라우저에만 저장됩니다. 로그인하면 내 계정에도 보관돼, 재부팅 후에도 다시 넣을 필요가 없어요.'} 백업 파일에는 들어가지 않습니다. 공용 PC에서는 키를 넣지 마세요. 카카오 REST 키는 리퍼러 제한이 없으므로, 이 파일을 웹에 공개 배포할 계획이라면 키를 서버(프록시)에 숨기는 방식을 권합니다.</p><hr class="setting-divider"><div class="eyebrow">AI · GEMINI</div><h3>AI 기능</h3><p>Gemini로 두 가지를 합니다. 하나, 카카오 책 소개에서 홍보 문구를 걷어내고 짧은 소개와 장르 태그로 정리합니다. 둘, 책등과 표지에 새길 작은 상징을 그립니다. 키가 없어도 자동 상징 추천과 규칙 기반 태그는 그대로 동작합니다.</p><p>키 발급: aistudio.google.com/api-keys → API 키 만들기. 무료 등급이 있어 카드 등록 없이 받을 수 있습니다. 새로 만든 키는 <strong>AQ.Ab</strong> 로 시작하며(예전 형식은 AIza), 둘 다 사용할 수 있습니다. 구글 클라우드 콘솔에서 만든 키는 서비스 계정 바인딩을 요구하니 AI Studio에서 받으세요.</p><div class="field"><label for="ai-key">Gemini API 키 (선택)</label><input id="ai-key" type="password" autocomplete="off" placeholder="AQ.Ab... 또는 AIza..." value="${esc(getAiKey())}"></div><div class="actions" style="justify-content:flex-start"><button class="btn" data-action="save-ai-key">키 저장</button><button class="btn primary" data-action="analyze-all" ${batchRunning?'disabled':''}>${batchRunning?'정리하는 중…':`✦ 아직 정리 안 된 책 정리하기 (${books.filter(b=>b.status==='done'&&!b.aiSummary).length}권)`}</button><button class="btn" data-action="draw-all" ${drawing||!pendingDrawCount()?'disabled':''}>${drawing?'상징 그리는 중…':`✦ 남은 상징 그리기 (${pendingDrawCount()}권)`}</button><button class="btn" data-action="motif-compare" ${compareState?.running?'disabled':''}>${compareState?.running?'비교 시험 중…':`상징 비교 시험 (약 ${COMPARE_SET.length*COMPARE_RULES.length}회 호출)`}</button></div>${compareHTML()}${[AI_FAST_MODEL].filter(pausedUntil).length?`<p class="message"><strong>오늘 무료 한도를 다 쓴 기능:</strong> ${[AI_FAST_MODEL].filter(pausedUntil).map(m=>`${AI_FEATURE_NAME(m)}(${esc(fmtWhen(pausedUntil(m)))}까지 쉼)`).join(' · ')}. 그 전까지는 요청을 보내지 않고, 시간이 지나면 이어서 합니다.</p>`:''}<p class="muted">한 번 만든 소개와 상징은 그대로 고정됩니다. 로그인되어 있으면 같은 작품을 먼저 정리한 기록을 찾아 AI 없이 그대로 쓰고, 처음 정리하는 작품만 AI를 씁니다. 짧은 소개는 정보 수정에서 직접 고칠 수 있어요. 새로 추가하는 책은 저장할 때 자동으로 정리됩니다. 한꺼번에 정리할 때는 5권씩 묶어 한 번에 보내고, 묶음 사이에 잠깐 쉬어 갑니다. 정리할 때 상징도 함께 정해지고, 내장 아이콘에 있는 사물(도끼·고래·열쇠 등)은 바로 붙습니다. 나머지 상징 그림은 새 책을 저장할 때 한 번만 그리고, 그 밖에는 '남은 상징 그리기'나 책 상세의 '상징 그리기'를 눌렀을 때만 그립니다. 실패해도 자동으로 다시 보내지 않아요. 소개와 상징 모두 빠른 모델(Flash-Lite)로 처리합니다. 그리기 전까지는 제목·소개로 고른 기본 아이콘이 보입니다. 한도에 닿으면 멈추고, 남은 책은 다시 누르면 이어서 정리합니다.</p><p class="message">키는 위의 카카오 키와 같은 방식으로 보관되고, 백업 파일에는 들어가지 않습니다. 공용 PC에서는 넣지 마세요. 생성된 상징은 책 정보에 저장되므로 같은 책을 다시 호출하지 않습니다. 무료 등급에는 분당·일일 호출 한도가 있어, 한도를 넘으면 잠시 뒤 다시 시도하면 됩니다.</p>${archiveHTML()}<hr class="setting-divider"><div class="eyebrow">BACKUP & RESTORE</div><h3>나의 기록을 안전하게</h3><p>${session?'로그인되어 있어 서재가 클라우드에도 저장됩니다. JSON 백업은 만일을 위한 두 번째 안전망이에요.':'로그인하지 않으면 이 브라우저의 로컬 저장소에만 데이터를 보관하고, 다른 기기와 동기화되지 않습니다.'}</p><p>백업을 내려받아 보관하고, 필요할 때 JSON 파일을 가져와 복원하세요. 복원 전 기존 기록을 백업할 수 있습니다.</p><div class="actions" style="justify-content:flex-start"><button class="btn primary" data-action="export">↓ JSON 백업</button><button class="btn" data-action="import">↑ JSON 복원</button></div><p class="message">이전 Mnemosyne 백업 파일도 불러올 수 있습니다. 가져오기 시 전체 교체 또는 중복 ID를 제외한 병합 중 선택할 수 있습니다.</p></div>`}<input type="file" id="importer" accept="application/json,.json" hidden></main></div><nav class="mobile-nav" aria-label="모바일 메뉴"><button data-view="library" class="${view==='library'?'active':''}"><span class="navicon">▤</span>서재</button><button data-view="insights" class="${view==='insights'?'active':''}"><span class="navicon">◈</span>통계</button><button data-view="settings" class="${view==='settings'?'active':''}"><span class="navicon">⚙</span>설정</button></nav><div id="dialog"></div>`;
$('#search')?.addEventListener('input',e=>{search=e.target.value;updateShelf()});$('#sort')?.addEventListener('change',e=>{sort=e.target.value;render()});$('#importer').addEventListener('change',handleImport);layoutShelf(true);renderList();showDialog();restoreDialogUI(ui)}
// 등장 효과는 창을 새로 열 때 한 번만 붙입니다. 같은 창을 다시 그릴 때(평점 저장 등)는 움직이지 않습니다.
let dialogEnter=false,lastSpine='',pulling=false;
const reduceMotion=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function showDialog(){showDialogInner();if(dialogEnter){dialogEnter=false;$('#dialog .overlay')?.classList.add('enter')}a11yDialog()}
function showDialogInner(){const node=$('#dialog');if(!node||!dialog)return;const b=editing?books.find(x=>x.id===editing):null;
if(dialog==='edit'){node.innerHTML=`<div class="overlay"><div class="modal"><button class="close" data-action="close" aria-label="닫기">×</button><div class="eyebrow">${b?'EDIT BOOK':'ADD TO COLLECTION'}</div><h2>${b?'책 정보 수정':'새로운 책 추가'}</h2><form id="bookform"><div class="edition-info api-search"><div class="eyebrow">BOOK SEARCH</div><label for="apiQuery">도서 정보 자동 검색</label>${searchStatusHTML()}<div class="api-search-row"><input id="apiQuery" type="search" maxlength="120" placeholder="예: 죄와 벌 도스토예프스키" autocomplete="off"><button type="button" class="btn primary" data-action="api-search">검색</button></div><p class="muted">완독한 작품만 서재에 기록합니다. 작품을 먼저 고른 뒤 판본을 선택하면 제목, 저자, 출판사, 번역자, ISBN과 표지가 입력됩니다. 검색 결과가 부정확할 수 있어요.</p><div id="api-results" aria-live="polite"></div></div><div class="field"><label for="title">책 제목 / 판본 표시명 *</label><input id="title" name="title" maxlength="150" required value="${esc(b?.title||'')}" placeholder="예: 죄와 벌"></div><div class="field"><label for="author">저자</label><input id="author" name="author" maxlength="120" value="${esc(b?.author||'')}" placeholder="예: 표도르 도스토예프스키"></div><div id="dupNotice" aria-live="polite"></div><input type="hidden" name="status" value="done"><div class="fieldgrid"><div class="field"><label for="rating">평점</label><select id="rating" name="rating">${[0,1,2,3,4,5].map(x=>`<option value="${x}" ${Number(b?.rating||0)===x?'selected':''}>${x===0?'평가하지 않음':`${x} / 5`}</option>`).join('')}</select></div><div></div></div>${b?'<p class="muted formnote">감상은 책 상세 화면의 ‘감상 수정’에서 따로 고칠 수 있어요.</p>':'<div class="field"><label for="notes">독서 기록 · 메모</label><textarea id="notes" name="notes" placeholder="읽고 느낀 점, 기억하고 싶은 문장..."></textarea></div>'}<div class="field"><label for="notionUrl">Notion 기록 페이지 링크 (선택)</label><input id="notionUrl" name="notionUrl" type="url" placeholder="https://www.notion.so/..." value="${esc(b?.notionUrl||'')}"></div><details class="formsection" data-sec="edition"><summary>판본 정보<span class="sechint" data-hint="edition"></span></summary><div class="edition-info"><p>작품은 공통된 원작, 판본은 출판사·번역자가 다른 책을 뜻합니다. 검색으로 채워진 정보도 직접 고칠 수 있습니다.</p><div class="field"><label for="workTitle">작품명</label><input id="workTitle" name="workTitle" maxlength="150" value="${esc(b?.workTitle||b?.title||'')}" placeholder="예: 죄와 벌 (미입력 시 책 제목과 동일)"></div><div class="fieldgrid"><div class="field"><label for="publisher">출판사</label><input id="publisher" name="publisher" maxlength="120" value="${esc(b?.publisher||'')}" placeholder="예: 민음사"></div><div class="field"><label for="translator">번역자</label><input id="translator" name="translator" maxlength="120" value="${esc(b?.translator||'')}" placeholder="예: 홍길동"></div></div><div class="fieldgrid"><div class="field"><label for="isbn">ISBN (선택)</label><input id="isbn" name="isbn" maxlength="30" value="${esc(b?.isbn||'')}" placeholder="ISBN"></div><div class="field"><label for="pages">쪽수 (선택)</label><input id="pages" name="pages" type="number" min="0" max="9999" inputmode="numeric" value="${b?.pages||''}" placeholder="예: 520"></div></div><p class="muted">쪽수를 적으면 책등 두께에 반영됩니다. 비워 두면 보통 두께 안에서 책마다 조금씩 다르게 보입니다.</p><div class="field"><label for="coverUrl">표지 이미지 URL (선택)</label><input id="coverUrl" name="coverUrl" type="url" value="${esc(b?.coverUrl||'')}" placeholder="검색으로 자동 입력됩니다"><input type="hidden" id="editionTitle" name="editionTitle" value="${esc(b?.editionTitle||'')}"><input type="hidden" id="googleBooksId" name="googleBooksId" value="${esc(b?.googleBooksId||'')}"><input type="hidden" id="customMotif" name="customMotif" value="${esc(b?.customMotif||'')}"><input type="hidden" id="motifIdea" name="motifIdea" value="${esc(b?.motifIdea||'')}"><input type="hidden" id="motifDrawnFor" name="motifDrawnFor" value="${esc(b?.motifDrawnFor||'')}"></div></div></details><details class="formsection" data-sec="intro"><summary>소개와 태그<span class="sechint" data-hint="intro"></span></summary><div class="edition-info"><div class="field"><label for="summary">책 소개</label><textarea id="summary" name="summary" class="summaryfield" maxlength="1200" placeholder="검색하면 자동으로 채워집니다. 직접 적어도 되고, 비워 둬도 됩니다.">${esc(b?.summary||'')}</textarea><p class="muted">카카오가 주는 원문입니다(앞부분만 옵니다). 상징 추천과 AI 정리의 재료로 쓰입니다.</p></div><div class="field"><label for="aiSummary">짧은 소개 (AI 정리)</label><textarea id="aiSummary" name="aiSummary" class="summaryfield" maxlength="400" placeholder="상세보기의 ✦ AI로 소개 정리하기를 누르면 채워집니다. 직접 써도 됩니다.">${esc(b?.aiSummary||'')}</textarea></div><div class="field"><label for="tags">태그</label><input id="tags" name="tags" maxlength="200" value="${esc((b?.tags||[]).join(', '))}" placeholder="쉼표로 구분. 예: 다시 읽고 싶은, 밑줄 많음"><p class="muted">비워 두면 책 소개를 분석해 장르 태그가 자동으로 붙습니다${b?`. 현재 자동 분석 결과: ${autoTags(b).join(' · ')||'없음'}`:''}.</p></div></div></details><details class="formsection" data-sec="design"><summary>책등 꾸미기<span class="sechint" data-hint="design"></span></summary><div class="edition-info"><p>책등 색과 작품 상징은 서재에만 적용되며 독서 기록과 별개로 보관돼요.</p><div class="field"><label for="spineTitle">책등 표시명 (선택)</label><input id="spineTitle" name="spineTitle" maxlength="60" value="${esc(b?.spineTitle||'')}" placeholder="비워 두면 작품명을 그대로 씁니다"><p class="muted">제목이 길 때 책등에만 짧게 보여 줄 이름입니다. 작품명·판본명 같은 원래 정보는 바뀌지 않고, 마우스를 올리거나 책을 열면 정식 제목이 보입니다.</p></div><div class="fieldgrid"><div class="field"><label for="spineType">책등 디자인</label><select id="spineType" name="spineType">${Object.entries(SPINE_TYPES).map(([k,l])=>`<option value="${k}" ${(b?.spineType||'auto')===k?'selected':''}>${k==='auto'&&b?`자동 추천 (지금: ${esc(SPINE_TYPES[autoTypeOf(b)].split(' — ')[0])})`:esc(l)}</option>`).join('')}</select></div><div class="field"><label>인생책</label><label class="lifecheck"><input type="checkbox" id="lifeBook" name="lifeBook" ${b?.lifeBook?'checked':''}> 인생책으로 간직하기</label></div></div><p class="muted">인생책에는 작은 리본과 금박 상징이 새겨집니다. 책등 디자인을 직접 고른 책은 인생책이어도 그 디자인을 그대로 둡니다.</p><div class="field"><label for="bookColor">책등 색상</label><input type="hidden" id="colorMode" name="colorMode" value="${b?b.colorMode:'auto'}"><div class="color-editor"><input type="color" id="bookColor" name="bookColor" value="${b?spineColorOf(b):colors[0]}"><button type="button" class="btn" data-action="auto-color">자동 배색</button><span class="muted" id="colorModeNote">${!b||b.colorMode==='auto'?'자동 배색 중':'직접 고른 색'}</span></div><div class="palette">${colors.map(c=>`<button type="button" class="palette-color" data-color="${c}" style="--swatch:${c}" title="${c}" aria-label="책등 색상 ${c}"></button>`).join('')}</div></div><div class="field"><label for="motif">책등·표지에 새길 상징</label><select id="motif" name="motif">${Object.entries(motifNames).filter(([key])=>key!=='custom'||b?.customMotif).map(([key,label])=>`<option value="${key}" ${(b?.motif||'auto')===key?'selected':''}>${label}</option>`).join('')}</select><div class="motif-row"><div class="motif-preview" id="motifPreview"></div>${b?.customMotif?'':'<button type="button" class="btn" data-action="ai-motif">✦ AI로 상징 만들기</button>'}</div><p class="muted">자동 추천은 제목과 책 소개의 낱말로 고릅니다. AI 생성은 설정에 Gemini API 키를 넣었을 때만 동작하며, 만들어진 상징은 이 책에 저장돼 다시 호출하지 않습니다.</p></div></div></details><div class="actions formactions"><button type="button" class="btn" data-action="close">취소</button><button type="submit" class="btn primary">${b?'변경사항 저장':'서재에 추가'}</button></div></form><p class="privacy">${session?'저장하면 이 브라우저에 먼저 저장되고, 잠시 뒤 클라우드에도 올라가요.':'기록은 현재 브라우저에 저장됩니다. 정기적으로 JSON 백업을 내려받으세요.'}</p></div></div>`;$('#bookform').addEventListener('submit',handleSave);formSnapshot=formState();formInit=readFormInit();afterFormRender();$('#motif')?.addEventListener('change',updateMotifPreview);$('#title')?.addEventListener('input',updateMotifPreview);$('#workTitle')?.addEventListener('input',updateMotifPreview);updateMotifPreview();$('#apiQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchKakaoBooks()}});return}
if(dialog==='detail'&&b){node.innerHTML=`<div class="overlay"><div class="modal wide"><button class="close" data-action="close" aria-label="닫기">×</button><div class="eyebrow">MY LIBRARY / BOOK DETAIL</div><div class="previewdetail">${coverHTML(b)}<div>${b.lifeBook?'<div class="lifemark">MY TREASURED BOOK · 인생책</div>':''}<h2 class="detailtitle">${esc(cleanDisplayTitle(b.workTitle||b.title))}</h2><div class="muted">${esc(cleanAuthor(b.author)||'작가 미상')}</div><div class="detailsub">독서 상태</div><span class="btn">완독</span><div class="detailsub">나의 평점</div><div class="rating">${[1,2,3,4,5].map(n=>`<button class="star ${Number(b.rating)>=n?'selected':''}" data-rate="${n}" aria-label="${n}점">★</button>`).join('')}</div><p><button type="button" class="link" data-action="toggle-life">${b.lifeBook?'인생책에서 내리기':'인생책으로 간직하기'}</button></p></div></div><div class="eyebrow">BOOK INFORMATION</div><div class="details-grid"><div class="detail-info"><div class="detailsub">작품</div><strong>${esc(b.workTitle||b.title)}</strong></div><div class="detail-info"><div class="detailsub">출판사</div><strong>${esc(b.publisher||'미등록')}</strong></div><div class="detail-info"><div class="detailsub">번역자</div><strong>${esc(b.translator||'미등록')}</strong></div><div class="detail-info"><div class="detailsub">원본 판본명</div><strong>${esc(b.editionTitle||b.title)}</strong></div><div class="detail-info"><div class="detailsub">ISBN</div><strong>${esc(b.isbn||'미등록')}</strong></div>${b.spineTitle?`<div class="detail-info"><div class="detailsub">책등 표시명</div><strong>${esc(b.spineTitle)}</strong></div>`:''}${b.pages?`<div class="detail-info"><div class="detailsub">쪽수</div><strong>${b.pages}쪽</strong></div>`:''}</div><div class="detailsub">책 소개</div>${aiBusy.has(b.id)?`<div class="booksummary"><span class="muted">✦ Gemini가 소개를 정리하는 중…</span></div>`:b.aiSummary?`<p class="aisummary">${esc(b.aiSummary)}</p>`:b.summary?`<div class="booksummary rawsummary clamp">${esc(tidyRawSummary(b.summary))}</div>`:`<div class="booksummary"><span class="muted">아직 소개가 없습니다.</span></div>`}${b.aiSummary&&b.summary&&!aiBusy.has(b.id)?`<div class="booksummary rawsummary" hidden>${esc(tidyRawSummary(b.summary))}</div>`:''}<div class="summaryactions">${aiBusy.has(b.id)||b.aiSummary?'':`<button type="button" class="link" data-action="ai-analyze">✦ AI로 소개 정리하기</button>`}${!b.summary?`<button type="button" class="link" data-action="fetch-summary">카카오에서 소개 불러오기</button>`:''}${b.summary&&!aiBusy.has(b.id)?`<button type="button" class="link" data-action="toggle-raw">${b.aiSummary?'출판사 소개 원문':'펼치기'}</button>`:''}</div>${b.motifIdea||drawQueue.includes(b.id)?`<div class="detailsub">상징</div><div class="motifline"><span class="motifmini">${spineMotif(b,28)||''}</span><span>${drawingNow.has(b.id)?`<span class="muted">「${esc(b.motifIdea)}」 그리는 중…</span>`:drawQueue.includes(b.id)?`<span class="muted">「${esc(b.motifIdea)}」 ${pausedUntil(AI_DRAW_MODEL)?`— 오늘 AI 한도를 다 써서 ${esc(fmtWhen(pausedUntil(AI_DRAW_MODEL)))} 이후에 그려요`:'그릴 차례를 기다리는 중…'}</span>`:esc(b.motifIdea||'')}</span></div>${motifStatusHTML(b)}`:''}<div class="detailsub">태그</div><div class="tagrow">${tagsOf(b).map(t=>`<button type="button" class="tagchip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')||'<span class="muted">태그가 없습니다. AI로 정리하면 장르 태그가 붙고, 정보 수정에서 직접 넣을 수도 있어요.</span>'}</div><div class="detailsub">모은 문장${(b.quotes||[]).length?` <span class="muted">${b.quotes.length}</span>`:''}</div>${lastDeleted?.kind==='quote'&&lastDeleted.bookId===b.id?undoBarHTML():''}${(b.quotes||[]).map(q=>quoteHTML(b,q)).join('')}<div class="quoteform"><textarea id="newQuote" maxlength="600" placeholder="마음에 남은 문장을 적어 두세요"></textarea><div class="quoteformrow"><input id="newQuotePage" maxlength="20" inputmode="numeric" placeholder="쪽 (선택)"><button type="button" class="btn" data-action="add-quote">문장 추가</button></div></div><div class="detailsub">나의 독서 기록</div>${notesBlockHTML(b)}${b.notionUrl?`<p><a class="link" target="_blank" rel="noopener noreferrer" href="${esc(b.notionUrl)}">Notion에서 기록 열기 ↗</a></p>`:''}<div class="actions row danger-panel"><button type="button" class="btn danger" data-action="delete">책 삭제</button><div><button type="button" class="btn" data-action="close">닫기</button> <button type="button" class="btn primary" data-action="edit">정보 수정</button></div></div></div></div>`;return}
if(dialog==='restore'&&importCandidate){node.innerHTML=`<div class="overlay"><div class="modal"><button class="close" data-action="close" aria-label="닫기">×</button><div class="eyebrow">RESTORE PREVIEW</div><h2>백업 복원</h2><p class="metadata-subtitle">현재 서재 ${books.length}권 · 백업 파일 ${importCandidate.length}권</p><div class="analysis"><h3>복원 방법을 선택하세요</h3><p><strong>병합</strong> — 같은 ID의 책은 기존 데이터를 유지하고 새 책만 추가합니다.</p><p><strong>전체 교체</strong> — 현재 목록을 백업 파일 목록으로 대체합니다. 기존 기록을 먼저 백업하세요.</p></div><div class="actions"><button class="btn" data-action="close">취소</button><button class="btn" data-action="merge">병합</button><button class="btn danger" data-action="replace">전체 교체</button></div></div></div>`}
}

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

// ---------- 판본 → 작품 기록 (v2.13.0) ----------
// "판본으로 넣기"로 묶은 판본의 ISBN이 어느 작품인지 기억합니다. 내가 묶은 것은 이 브라우저에 두고, 로그인되어 있으면 공유 표(edition_map)에도 올려 모두가 씁니다.
// 같은 ISBN을 내가 직접 묶었으면 내 선택이 먼저이고, 공유 표는 먼저 묶은 사람의 것이 고정됩니다.
const EDMAP_KEY='my-library-edition-map-v1';
let edMapLocal={},edMapShared={};
try{const v=JSON.parse(localStorage.getItem(EDMAP_KEY)||'{}');if(v&&typeof v==='object')edMapLocal=v}catch{}
const isbnOf=b=>{const x=String(b?.isbn||'').replace(/[^0-9Xx]/g,'');return x.length===10||x.length===13?x:''};
const editionIdOf=b=>isbnOf(b)||('t:'+titleKey(b?.title)+'|'+authorKey(b?.author)+'|'+titleKey(b?.publisher)).slice(0,240);
function edMapGet(b){const k=editionIdOf(b);const m=edMapLocal[k]||edMapShared[k];return m&&m.k?m:null}
function saveEdMapLocal(){try{const ks=Object.keys(edMapLocal);if(ks.length>5000)for(const k of ks.slice(0,ks.length-5000))delete edMapLocal[k];localStorage.setItem(EDMAP_KEY,JSON.stringify(edMapLocal))}catch{}}
async function loadEdMapShared(items){
 if(!session)return;
 const isbns=[...new Set(items.map(isbnOf).filter(x=>x&&!(x in edMapShared)))];
 try{
  for(let i=0;i<isbns.length;i+=50){
   const chunk=isbns.slice(i,i+50);
   const rows=await sbFetch('/rest/v1/edition_map?select=isbn,title_key,author_key,work_title,work_author&isbn=in.'+encodeURIComponent('('+chunk.join(',')+')'));
   for(const r of Array.isArray(rows)?rows:[])if(r&&r.isbn&&r.title_key)edMapShared[r.isbn]={k:String(r.title_key),a:String(r.author_key||''),t:String(r.work_title||''),au:String(r.work_author||'')};
  }
 }catch(err){console.warn('[나의 서재] 판본 기록 불러오기 실패',err.message)}
}
async function shareEdMap(entries){
 if(!session||!entries.length)return;
 const rows=entries.filter(([id])=>/^[0-9Xx]{10,13}$/.test(id)).map(([id,m])=>({isbn:id,title_key:m.k,author_key:m.a,work_title:m.t,work_author:m.au}));
 try{for(let i=0;i<rows.length;i+=50)await sbFetch('/rest/v1/edition_map',{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:rows.slice(i,i+50)})}
 catch(err){console.warn('[나의 서재] 판본 기록 공유 실패',err.message)}
}
// 같은 저자의 작품끼리, 한 작품명 뒤에 판본 낱말만 더 붙은 작품은 짧은 쪽으로 합칩니다(예: 데미안 / 데미안세계문학전집101).
function mergeEditionGroups(groups){
 const rest=new RegExp('^(?:'+ED_MORPHS+')+$','i'),anchor=new RegExp(ED_ANCHOR_MORPHS,'i');
 const byLen=[...groups].sort((a,b)=>a.key.length-b.key.length),gone=new Set();
 for(const g of byLen){
  if(gone.has(g)||!g.authorKey)continue;
  const s=byLen.find(s=>s!==g&&!gone.has(s)&&s.authorKey===g.authorKey&&s.key.length>=2&&g.key.length>s.key.length&&g.key.startsWith(s.key)&&rest.test(g.key.slice(s.key.length))&&anchor.test(g.key.slice(s.key.length)));
  if(s){s.indices.push(...g.indices);gone.add(g)}
 }
 return groups.filter(g=>!gone.has(g));
}
function groupWorks(items){
 const groups=[];
 for(let i=0;i<items.length;i++){
  const b=items[i],m=edMapGet(b),c=m?{key:m.k,title:m.t||m.k,author:m.au,authorKey:m.a}:canonicalWork(b);
  let g=groups.find(g=>g.key===c.key&&(g.authorKey===c.authorKey||!g.authorKey||!c.authorKey));
  if(!g){g={key:c.key,id:c.key+'|'+c.authorKey,authorKey:c.authorKey,title:c.title,author:c.author,indices:[]};groups.push(g)}
  g.indices.push(i);
  if(!g.author&&c.author)g.author=c.author;
 }
 const merged=mergeEditionGroups(groups);groups.length=0;groups.push(...merged);
 const q=titleKey(workBaseTitle(apiQueryText));
 groups.sort((a,b)=>Number(b.key===q)-Number(a.key===q)||Number(b.key.startsWith(q))-Number(a.key.startsWith(q)));
 return groups;
}
function editionButton(b,i){return `<button type="button" class="api-result" data-api-pick="${i}">${b.coverUrl?`<img src="${esc(b.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="api-no-cover">책</span>'}<span class="api-result-copy"><strong>${esc(cleanDisplayTitle(baseWorkTitle(b.title)))}</strong><small>${esc(cleanAuthor(b.author)||'저자 미상')}</small><small>${esc([b.publisher,b.isbn].filter(Boolean).join(' · ')||'서지 정보 없음')}</small></span><span class="api-result-select">선택</span></button>`}
function rankedWorks(){
 const q=titleKey(workBaseTitle(apiQueryText));
 const authorWords=cleanAuthor(apiQueryText).toLocaleLowerCase();
 const groups=groupWorks(apiResults);
 function score(g){
   const k=g.key;let n=0;
   if(k===q)n+=140;
   else if(k.startsWith(q))n+=95;
   else if(k.includes(q))n+=70;
   else if(q.includes(k)&&k.length>1)n+=35;
   const words=apiQueryText.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(x=>x.length>=2);
   for(const word of words){const w=titleKey(word);if(w&&k.includes(w))n+=12;if(word&&g.author.toLocaleLowerCase().includes(word))n+=25}
   if(q.length<=2&&k!==q)n-=Math.min(35,Math.max(0,k.length-q.length)*3);
   // API relevance order is a tie-breaker, not a hard filter.
   n+=Math.max(0,12-Math.min(...g.indices)*0.35);
   return n;
 }
 return groups.sort((a,b)=>score(b)-score(a));
}
function showApiResults(){
 const node=$('#api-results');if(!node)return;
 if(apiPending){node.innerHTML='<p class="muted">카카오 책 검색에서 찾는 중…</p>';return}
 if(apiError){node.innerHTML=`<p class="api-error">${esc(apiError)}</p><p class="muted">검색 없이도 아래에 제목만 적어 저장할 수 있어요.</p>`;return}
 if(!apiResults.length){node.innerHTML='<p class="muted">검색 결과가 없습니다. 직접 입력하거나 다른 검색어를 사용해 보세요.</p>';return}
 const groups=rankedWorks();
 let content=apiNote?`<p class="muted">${esc(apiNote)}</p>`:'';
 if(apiStage==='editions'){
   const group=groups.find(g=>g.id===apiActiveWork);
   if(!group){apiStage='works';apiActiveWork='';showApiResults();return}
   content+=`<div class="api-level"><button type="button" class="btn" data-api-back="1">← 작품 목록</button><span class="muted">${esc(group.title)} · 판본 ${group.indices.length}개</span></div><div class="api-results">${group.indices.map(i=>editionButton(apiResults[i],i)).join('')}</div><p class="api-disclaimer muted">카카오 책 검색에서 조회된 판본만 표시합니다.</p>`;
 }else{
   if(apiStage==='bind'){
    const src=groups.find(g=>g.id===apiBindSource);
    if(!src||groups.length<2){apiStage='works';apiBindSource='';showApiResults();return}
    const others=groups.map((g,i)=>[g,i]).filter(([g])=>g!==src).sort((x,y)=>Number(y[0].authorKey===src.authorKey)-Number(x[0].authorKey===src.authorKey));
    content+=`<div class="api-level"><button type="button" class="btn" data-api-back="1">← 취소</button><span class="muted">「${esc(src.title)}」(판본 ${src.indices.length}개)을 어느 작품의 판본으로 넣을까요?</span></div><div class="api-results">${others.map(([g,i])=>`<button type="button" class="api-result" data-api-bind-to="${i}"><span class="api-work-icon">▤</span><span class="api-result-copy"><strong>${esc(g.title)}</strong><small>${esc(cleanAuthor(g.author)||'저자 미상')} · 판본 ${g.indices.length}개</small></span><span class="api-result-select">여기에 넣기</span></button>`).join('')}</div><p class="api-disclaimer muted">묶은 결과는 기억해 두었다가 다음 검색에도 그대로 적용합니다. 로그인되어 있으면 다른 사람의 검색에도 적용됩니다.</p>`;
    node.innerHTML=content;return;
   }
   content+=`<p class="api-heading">연관 작품 ${groups.length}개 · 작품 선택 후 판본 선택</p><div class="api-results">${groups.map((g,i)=>`<div class="api-work-row"><button type="button" class="api-result" data-api-work="${i}"><span class="api-work-icon">▤</span><span class="api-result-copy"><strong>${esc(g.title)}</strong><small>${esc(cleanAuthor(g.author)||'저자 미상')} · 판본 ${g.indices.length}개</small></span><span class="api-result-select">›</span></button>${groups.length>1?`<button type="button" class="api-bind" data-api-bind="${i}" title="이 작품을 다른 작품의 판본으로 넣기">판본으로 넣기</button>`:''}</div>`).join('')}</div><p class="api-disclaimer muted">같은 작품이 따로 보이면 <strong>판본으로 넣기</strong>로 묶어 주세요. 동명 작품은 저자별로 구분합니다.</p>`;
 }
 node.innerHTML=content;
}
const API_KEY_STORE='my-library-kakao-key-v1';
const getApiKey=()=>{try{return(localStorage.getItem(API_KEY_STORE)||'').trim()}catch{return ''}};
async function fetchJson(url,headers){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const r=await fetch(url,{signal:controller.signal,headers});if(!r.ok){const e=new Error('HTTP '+r.status);e.status=r.status;throw e}return await r.json()}
 catch(err){if(err.name==='AbortError'){const e=new Error('시간 초과');e.status='timeout';throw e}throw err}
 finally{clearTimeout(timer)}
}
function whyFailed(err){
 if(err.status==='timeout')return '응답 시간 초과';
 if(err.status===429)return '일일 쿼터 초과(429) — 내일 다시 시도하거나 직접 입력하세요';
 if(err.status===401)return '키 인증 실패(401) — REST API 키를 다시 확인하세요';
 if(err.status===403)return '접근 거부(403) — 앱 상태 또는 쿼터를 확인하세요';
 if(err.status===400)return '요청 거부(400) — 검색어나 키 형식을 확인하세요';
 if(err.status)return 'HTTP '+err.status;
 return '네트워크 오류(차단되었거나 연결 없음)';
}
// 카카오 책 검색 응답을 내부 형식으로 변환합니다. isbn은 "ISBN10 ISBN13" 형태로 오므로 13자리를 우선 사용합니다.
function mapKakao(json){
 return (json.documents||[]).map(d=>{
  const parts=String(d.isbn||'').split(/\s+/).filter(Boolean);
  const isbn=parts.find(x=>x.replace(/[^0-9Xx]/g,'').length===13)||parts[0]||'';
  return {
   title:String(d.title||'').slice(0,150),
   author:(d.authors||[]).join(', ').slice(0,120),
   translator:(d.translators||[]).join(', ').slice(0,120),
   publisher:String(d.publisher||'').slice(0,120),
   summary:String(d.contents||'').replace(/\s+/g,' ').slice(0,1200),
   isbn:String(isbn).slice(0,30),
   coverUrl:safeCover(String(d.thumbnail||'').replace(/^http:/,'https:')),
   googleBooksId:''
  };
 }).filter(b=>b.title);
}
async function searchKakaoBooks(){
 const query=$('#apiQuery')?.value.trim();
 if(!query){flash('검색할 제목이나 저자를 입력하세요.');return}
 if(apiPending)return;
 const restKey=getApiKey();
 apiStage='works';apiActiveWork='';apiQueryText=query;apiError='';apiNote='';
 if(!restKey){apiError='설정 → 도서 검색 연결에서 카카오 REST API 키를 먼저 저장해 주세요.';showApiResults();return}
 const key=query.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');
 const cached=getCachedSearch(key);
 if(cached){apiResults=cached;await loadEdMapShared(cached);showApiResults();return}
 if(Date.now()<apiCooldownUntil){apiError='카카오 검색 요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 직접 입력하세요.';showApiResults();return}
 apiPending=true;apiResults=[];showApiResults();
 try{
  // dapi는 인증 외의 헤더가 섞이면 preflight에서 차단되므로 Authorization만 보냅니다.
  const headers={Authorization:'KakaoAK '+restKey};
  // 제목 중심 검색과 통합 검색을 결합해 연관 작품 후보를 넓게 확보합니다.
  const searches=['title',''];
  const all=[];const seen=new Set();const errors=[];
  for(const target of searches){
   try{
    const p=new URLSearchParams({query,size:'50',sort:'accuracy'});
    if(target)p.set('target',target);
    const data=await fetchJson('https://dapi.kakao.com/v3/search/book?'+p,headers);
    for(const book of mapKakao(data)){
      const identity=book.isbn||book.title+'|'+book.author+'|'+book.publisher;
      if(!seen.has(identity)){seen.add(identity);all.push(book)}
    }
   }catch(err){errors.push(whyFailed(err));if(err.status===429){apiCooldownUntil=Date.now()+60000;break}}
   // If we already have abundant candidates, avoid unnecessary requests.
   if(all.length>=45)break;
  }
  if(!all.length&&errors.length)throw Error('카카오 도서 검색 실패: '+errors.join(' / ')+'. REST API 키와 네트워크를 확인하세요.');
  apiResults=all;
  apiNote=errors.length&&all.length?'일부 검색 요청이 실패했지만 수집된 결과를 표시합니다.':'';
  if(all.length)cacheSearch(key,all);
  await loadEdMapShared(all);
 }catch(err){apiError=err.message||'검색에 실패했습니다.'}
 finally{apiPending=false;showApiResults()}
}
function bindEditions(targetIndex){
 const groups=rankedWorks(),src=groups.find(g=>g.id===apiBindSource),dst=groups[targetIndex];
 if(!src||!dst||src===dst){apiStage='works';apiBindSource='';showApiResults();return}
 const m={k:dst.key,a:dst.authorKey,t:dst.title,au:dst.author},entries=[];
 for(const i of src.indices){const id=editionIdOf(apiResults[i]);if(!id)continue;edMapLocal[id]=m;entries.push([id,m])}
 // 대상 작품의 판본도 같은 작품으로 적어 두어, 다음 검색에서 규칙이 바뀌어도 함께 있게 합니다.
 for(const i of dst.indices){const id=editionIdOf(apiResults[i]);if(id&&!edMapLocal[id]){edMapLocal[id]=m;entries.push([id,m])}}
 saveEdMapLocal();shareEdMap(entries);
 apiStage='works';apiBindSource='';showApiResults();
 flash(`「${src.title}」 판본 ${src.indices.length}개를 「${dst.title}」에 넣었어요.`);
}
function applyBookResult(index){const b=apiResults[index];if(!b)return;const grp=rankedWorks().find(g=>g.indices.includes(index)),cw=grp?{title:grp.title,author:grp.author}:canonicalWork(b);for(const [name,value] of Object.entries({title:cw.title,workTitle:cw.title,author:cleanAuthor(cw.author)||cleanAuthor(b.author),publisher:b.publisher,isbn:b.isbn,coverUrl:b.coverUrl,googleBooksId:b.googleBooksId,editionTitle:b.title,summary:b.summary||''})){const node=document.getElementById(name);if(node)node.value=value}{const tr=document.getElementById('translator');if(tr)tr.value=b.translator||''}apiResults=[];const results=$('#api-results');if(results)results.innerHTML='<p class="api-success">도서 정보를 입력했어요. 판본과 작품명을 확인한 뒤 저장하세요.</p>';updateMotifPreview();updateSectionHints();checkDupNotice();flash('도서 정보를 불러왔어요.');}

function updateMotifPreview(){
 const box=$('#motifPreview');if(!box)return;
  const ideaNow=cleanIdea($('#motifIdea')?.value||'');
 if(aiPending||(editing&&(drawingNow.has(editing)||drawQueue.includes(editing)))){box.innerHTML=`<span class="muted">${ideaNow?`「${esc(ideaNow)}」 그리는 중…`:'AI가 상징을 고르는 중…'}</span>`;return}
 const b={title:$('#title')?.value||'',workTitle:$('#workTitle')?.value||'',summary:$('#summary')?.value||'',motif:$('#motif')?.value||'auto',customMotif:$('#customMotif')?.value||''};
 box.innerHTML=(spineMotif(b,34)||'<span class="muted">상징 없이 깔끔한 책등</span>')+(ideaNow&&b.customMotif&&(b.motif==='auto'||b.motif==='custom')?`<span class="motifidea">${esc(ideaNow)}</span>`:'');
}
// 소개가 비어 있는 책을 상세보기에서 바로 채웁니다.
async function fetchSummaryForCurrent(){
 const b=books.find(x=>x.id===editing);if(!b)return;
 flash('책 소개를 불러오는 중…');
 try{
  const hit=await fetchKakaoSummary(b);
  commit(books.map(x=>x.id===b.id?normalize({...x,summary:hit.summary,translator:x.translator||hit.translator}):x),'책 소개를 불러왔어요.');
 }catch(err){flash('불러오기 실패: '+(err.status?whyFailed(err):err.message))}
}
function close(){if(editing)dropDrafts(editing);dialog=null;editing=null;importCandidate=null;dialogShownKey='';render();const back=lastSpine,opener=dialogOpener;lastSpine='';dialogOpener='';if(back){const el=[...document.querySelectorAll('.spine[data-book],.listrow[data-book]')].find(x=>x.dataset.book===back);el?.focus({preventScroll:true})}else if(opener){try{document.querySelector(opener)?.focus({preventScroll:true})}catch{}}}
function handleSave(e){e.preventDefault();const fd=new FormData(e.target),title=String(fd.get('title')||'').trim(),url=String(fd.get('notionUrl')||'').trim();if(!title)return;if(!validUrl(url)){alert('Notion 링크는 notion.so, www.notion.so 또는 *.notion.site 주소를 사용해 주세요.');return}const cu=String(fd.get('coverUrl')||'').trim();if(cu&&!safeCover(cu)){alert('표지 이미지 주소는 카카오 책 검색이 제공하는 이미지 주소만 지원합니다. 다른 주소는 저장되지 않으니, 칸을 비우고 저장해 주세요.');return}const old=books.find(b=>b.id===editing),keepM=!!old&&fd.get('customMotif')===formInit.customMotif&&fd.get('motifIdea')===formInit.motifIdea&&fd.get('motifDrawnFor')===formInit.motifDrawnFor,keepS=!!old&&fd.get('summary')===formInit.summary&&fd.get('aiSummary')===formInit.aiSummary,b=normalize({id:old?.id||id(),title,author:fd.get('author'),status:fd.get('status'),rating:fd.get('rating'),notes:fd.has('notes')?fd.get('notes'):(old?.notes||''),notionUrl:url,color:fd.get('bookColor')||old?.color||colors[books.length%colors.length],createdAt:old?.createdAt||new Date().toISOString(),workTitle:fd.get('workTitle')||title,publisher:fd.get('publisher'),translator:fd.get('translator'),isbn:fd.get('isbn'),coverUrl:fd.get('coverUrl'),googleBooksId:fd.get('googleBooksId'),editionTitle:fd.get('editionTitle'),summary:keepS?old.summary:fd.get('summary'),aiSummary:keepS?old.aiSummary:fd.get('aiSummary'),quotes:old?.quotes||[],aiTags:old?.aiTags||[],aiAt:old?.aiAt||'',customMotif:keepM?old.customMotif:fd.get('customMotif'),motifIdea:keepM?old.motifIdea:fd.get('motifIdea'),motifDrawnFor:keepM?old.motifDrawnFor:fd.get('motifDrawnFor'),tags:String(fd.get('tags')||'').split(/[,、·]/).map(t=>t.trim()).filter(Boolean).slice(0,10),spineTitle:fd.get('spineTitle'),pages:fd.get('pages'),spineType:fd.get('spineType'),lifeBook:fd.get('lifeBook')==='on',colorMode:fd.get('colorMode'),motif:fd.get('motif')||'auto'});const duplicate=!old?findDuplicateWork(b):null;if(duplicate){flash('이미 서재에 기록한 작품입니다. 기존 책을 열어 수정하세요.');showDupNotice(duplicate);return}if(b.colorMode==='auto')b.color=autoColorOf(b);const next=old?books.map(x=>x.id===editing?b:x):[...books,b];const aiAfter=!old&&!!getAiKey();if(commit(next,old?'책 정보를 수정했어요.':aiAfter?'새 책을 추가했어요. 소개는 뒤에서 정리할게요.':'새 책을 추가했어요.')){if(!old)pendingAdd=null;close();if(aiAfter)setTimeout(()=>analyzeBook(b.id,{quiet:true}).then(()=>flash(`「${b.title}」 소개를 정리했어요.`)).catch(err=>flash('책은 저장됐어요. 소개 자동 정리만 실패했어요: '+err.message)),300)}}
function exportData(){try{const blob=new Blob([JSON.stringify({app:'Mnemosyne',version:2,displayName:'나의 서재',exportedAt:new Date().toISOString(),books},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='my-library-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);flash('백업 다운로드를 요청했어요. 다운로드 폴더를 확인하세요.')}catch{flash('백업 파일을 만들지 못했습니다.')}}
async function handleImport(e){const f=e.target.files[0];if(!f)return;try{if(f.size>10*1024*1024)throw Error('파일 크기가 10MB를 초과합니다.');const obj=JSON.parse(await f.text());if(!obj||obj.app!=='Mnemosyne'||!Array.isArray(obj.books)||obj.books.length>10000)throw Error('지원되지 않는 백업 파일입니다.');if(obj.books.some(b=>!b||typeof b.title!=='string'||!b.title.trim()))throw Error('백업 파일에 올바르지 않은 책이 있습니다.');const arr=obj.books.map(normalize);if(new Set(arr.map(b=>b.id)).size!==arr.length)throw Error('백업에 중복된 책 ID가 있습니다.');importCandidate=arr;dialog='restore';dialogEnter=true;showDialog()}catch(err){alert(err.message||'백업 파일을 읽을 수 없습니다.')}finally{e.target.value=''}}
function restore(mode){if(!importCandidate)return;const merged=mode==='merge'?[...books,...importCandidate.filter(b=>!books.some(old=>old.id===b.id))]:importCandidate;if(mode==='replace'){if(!confirm('현재 서재를 완전히 교체합니다. 기존 데이터의 JSON 백업을 먼저 받았나요?'))return;exportData();if(!confirm('기존 데이터를 모두 교체할까요? 내려받은 백업 파일을 확인한 후 진행하는 것을 권장합니다.'))return;}if(commit(merged,`${merged.length}권의 서재 데이터를 저장했어요.`))close()}
let downTarget=null,formSnapshot='';document.addEventListener('pointerdown',e=>{downTarget=e.target},true);
const formState=()=>{const f=$('#bookform');return f?JSON.stringify([...new FormData(f)].filter(([k])=>!['customMotif','motifIdea','motifDrawnFor'].includes(k))):''};
// 수정 화면을 연 순간의 값. 사용자가 손대지 않은 칸은 저장할 때 뒤에서 갱신된 최신값을 씁니다.
let formInit={};
function readFormInit(){const v=k=>document.getElementById(k)?.value??'';return {customMotif:v('customMotif'),motifIdea:v('motifIdea'),motifDrawnFor:v('motifDrawnFor'),summary:v('summary'),aiSummary:v('aiSummary')}}
// ---------- v2.14.0 입력 보호와 창 접근성 (T1: U01·U02·U11) ----------
// 상세 창에서 적던 문장·쪽수는 책 ID별 초안(drafts)에 따로 둡니다. 저장된 책(books)과 섞지 않습니다.
// render()가 창을 다시 그려도 초안·초점·선택 범위·스크롤을 되살리고, 문장을 저장했을 때만 초안을 지웁니다.
// 새로고침·브라우저 종료까지 보장하는 자동 저장은 아닙니다(세션 중 보호).
const drafts=new Map(),DRAFT_FIELDS=['newQuote','newQuotePage'];
const draftKey=()=>dialog==='detail'&&editing?editing+'|quote':'';
function dropDrafts(bid){for(const k of [...drafts.keys()])if(k.startsWith(bid+'|'))drafts.delete(k)}
function draftDirty(){const d=drafts.get(draftKey());return !!d&&DRAFT_FIELDS.some(k=>String(d[k]||'').trim())}
function dialogDirty(){if(dialog==='edit')return !!formSnapshot&&formState()!==formSnapshot;if(dialog==='detail')return detailDirty();return false}
function confirmLeave(){if(!dialogDirty())return true;return confirm(dialog==='edit'?'작성 중인 내용이 저장되지 않습니다. 닫을까요?':'적고 있던 문장이 아직 저장되지 않았어요. 저장하지 않고 닫을까요?')}
document.addEventListener('input',e=>{const k=draftKey();if(!k||!DRAFT_FIELDS.includes(e.target.id))return;drafts.set(k,{...(drafts.get(k)||{}),[e.target.id]:e.target.value})});
window.addEventListener('beforeunload',e=>{if((dialog&&dialogDirty())||pendingAdd){e.preventDefault();e.returnValue=''}});
// 다시 그린 뒤 같은 요소를 찾기 위한 선택자(id 또는 data- 속성)
function selFor(el){if(!el||el===document.body)return'';if(el.id)return'#'+CSS.escape(el.id);const parts=['data-action','data-rate','data-qid','data-tag','data-view','data-theme','data-color'].filter(a=>el.hasAttribute(a)).map(a=>`[${a}="${CSS.escape(el.getAttribute(a))}"]`);return parts.length?(el.tagName.toLowerCase()+parts.join('')):''}
function captureDialogUI(){const m=$('#dialog .modal');if(!dialog||!m)return null;const a=document.activeElement,inside=a&&m.contains(a);const ui={key:dialog+'|'+(editing||''),modalTop:m.scrollTop,overlayTop:m.parentElement?.scrollTop||0,focus:inside?(a===m?'.modal':selFor(a)):''};if(inside&&typeof a.selectionStart==='number'){ui.sel=[a.selectionStart,a.selectionEnd,a.selectionDirection]}return ui}
function restoreDialogUI(ui){const m=$('#dialog .modal');if(!m||!dialog)return;
  if(dialog==='detail'){const d=drafts.get(draftKey());if(d)for(const k of DRAFT_FIELDS){const f=document.getElementById(k);if(f&&typeof d[k]==='string')f.value=d[k]}}
  if(!ui||ui.key!==dialog+'|'+(editing||''))return;
  m.scrollTop=ui.modalTop;if(m.parentElement)m.parentElement.scrollTop=ui.overlayTop;
  let f=null;try{f=ui.focus==='.modal'?m:ui.focus?m.querySelector(ui.focus):null}catch{}
  if(f){f.focus({preventScroll:true});if(ui.sel&&typeof f.setSelectionRange==='function'){try{f.setSelectionRange(...ui.sel)}catch{}}m.scrollTop=ui.modalTop;if(m.parentElement)m.parentElement.scrollTop=ui.overlayTop}}
// 창 의미(role=dialog), 배경 비활성화(inert), 처음 열 때 창으로 초점 이동. 다시 그릴 때는 초점을 옮기지 않습니다.
let dialogShownKey='',dialogOpener='';
document.addEventListener('click',e=>{if(!dialog)dialogOpener=selFor(e.target.closest?.('button,a,[tabindex]'))},true);
function a11yDialog(){const m=$('#dialog .modal'),open=!!(dialog&&m);document.querySelectorAll('#root>.app,#root>.mobile-nav').forEach(el=>{el.inert=open;open?el.setAttribute('aria-hidden','true'):el.removeAttribute('aria-hidden')});
  if(!open){dialogShownKey='';return}
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.tabIndex=-1;const h=m.querySelector('h2');if(h){h.id='dialog-title';m.setAttribute('aria-labelledby','dialog-title')}
  const key=dialog+'|'+(editing||'');if(key!==dialogShownKey){dialogShownKey=key;m.focus({preventScroll:true})}}
const focusables=m=>[...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null||el===document.activeElement);
document.addEventListener('keydown',e=>{if(e.key!=='Tab'||!dialog)return;const m=$('#dialog .modal');if(!m)return;const list=focusables(m);if(!list.length){e.preventDefault();m.focus();return}const first=list[0],last=list[list.length-1],a=document.activeElement;if(!m.contains(a)){e.preventDefault();(e.shiftKey?last:first).focus();return}if(e.shiftKey&&(a===first||a===m)){e.preventDefault();last.focus()}else if(!e.shiftKey&&a===last){e.preventDefault();first.focus()}});
// ---------- v2.14.1 상징 상태와 비교 시험 ----------
// 상세 화면: 상징 이름은 있는데 그림이 없을 때만 상태와 '상징 그리기/다시 시도' 버튼을 보여 줍니다. 그림이 있으면 버튼이 없습니다(고정 원칙).
function motifStatusHTML(b){
 if(!needsDrawing(b)||drawingNow.has(b.id)||drawQueue.includes(b.id)||instantMotif(b))return '';
 const f=drawFail.get(b.id),pu=pausedUntil(AI_DRAW_MODEL),key=!!getAiKey();
 const why=f?`그리지 못했어요 · ${esc(FAIL_LABEL[f.kind]||'오류')}${f.kind==='quota-daily'||f.kind==='format'?'':` — ${esc(f.msg)}`}`:'아직 그리지 않았어요.';
 const act=!key?'설정에 Gemini 키를 넣으면 그릴 수 있어요.':pu?`오늘 무료 사용량을 다 써서 ${esc(fmtWhen(pu))} 이후에 그릴 수 있어요.`:`<button type="button" class="link" data-action="retry-motif">${f?'상징 다시 시도':'상징 그리기'}</button>`;
 return `<p class="motifstatus" role="status"><span class="muted">${why}</span> ${act}</p>`;
}
// 설정의 '상징 비교 시험'(v2.14.2): 같은 5권을 예전 그리기 규칙과 새 규칙으로 한 번씩 그려(총 10회) 책등 크기·큰 크기로 나란히 보여 줍니다.
// 본보기로 쓴 도끼·알·티백 작품은 넣지 않습니다. 결과는 화면에만 있고 서재·공유 기록에는 저장하지 않습니다. 한도·키 오류가 나면 멈춥니다.
const COMPARE_SET=[['변신','프란츠 카프카','딱정벌레 — 벌레로 변한 그레고르'],['노인과 바다','어니스트 헤밍웨이','물고기 뼈 — 상어에게 뜯긴 청새치'],['위대한 개츠비','F. 스콧 피츠제럴드','등대 — 만 건너편의 초록 불빛'],['1984','조지 오웰','눈 — 모든 것을 지켜보는 빅 브라더'],['인생','위화','주판 — 재산을 모두 잃은 기억']];
const COMPARE_RULES=[['old','지금까지',()=>MOTIF_DRAW_RULES_V1],['new','새 규칙',()=>MOTIF_DRAW_RULES]];
let compareState=null;
const SVG_ELS=/<(?:path|circle|ellipse|line|polyline|polygon|rect)\b/gi;
async function runMotifCompare(){
 if(compareState?.running)return;
 if(!getAiKey()){flash('먼저 Gemini API 키를 저장하세요.');return}
 const pu=pausedUntil(AI_DRAW_MODEL);if(pu){flash(dailyMsg(AI_DRAW_MODEL,pu));return}
 const calls=COMPARE_SET.length*COMPARE_RULES.length;
 if(!confirm(`상징 비교 시험은 같은 ${COMPARE_SET.length}권을 지금까지의 규칙과 새 규칙으로 한 번씩 그려 Gemini를 약 ${calls}번 호출해요. 결과는 화면에만 보이고 서재에는 저장하지 않아요. 진행할까요?`))return;
 compareState={running:true,stopped:'',items:COMPARE_SET.map(([title,author,idea])=>({title,author,idea,old:{},new:{}}))};softRender();
 outer:for(const it of compareState.items){
  for(const [k,,rulesOf] of COMPARE_RULES){
   const r=it[k],t0=performance.now();
   try{
    const {text}=await callGemini(motifPrompt(it.title,it.author,'',it.idea,rulesOf()),{model:AI_DRAW_MODEL,thinking:'minimal',maxTokens:1024,timeoutMs:60000});
    const raw=extractSvgInner(text),inner=sanitizeMotifSvg(raw);
    r.ms=Math.round(performance.now()-t0);
    if(!inner){r.ok=false;r.err=FAIL_LABEL.format}
    else{r.ok=true;r.inner=inner;r.n=(inner.match(SVG_ELS)||[]).length;r.clean=(raw.match(SVG_ELS)||[]).length===r.n&&!/<text/i.test(raw)}
   }catch(err){
    r.ms=Math.round(performance.now()-t0);r.ok=false;r.err=FAIL_LABEL[err.kind]||'오류';
    if(STOP_KINDS.includes(err.kind)){compareState.stopped=aiErrorText(err);break outer}
   }
   softRender();
   await sleep(300);
  }
 }
 compareState.running=false;softRender();
}
function compareHTML(){
 const c=compareState;if(!c)return '';
 const cells=c.items.flatMap(x=>COMPARE_RULES.map(([k])=>x[k])),done=cells.filter(r=>r.ms!=null),ok=done.filter(r=>r.ok);
 const avg=k=>{const a=c.items.map(x=>x[k]).filter(r=>r.ok);return a.length?(a.reduce((s,r)=>s+r.ms,0)/a.length/1000).toFixed(1)+'초':'—'};
 const cell=(r,label)=>`<div class="comparecell"><div class="comparespine" title="책등 크기">${r.inner?customMotifSvg({customMotif:r.inner},23):''}</div><div class="comparebig">${r.inner?customMotifSvg({customMotif:r.inner},64):''}</div><div class="comparemeta"><strong>${esc(label)}</strong><span class="muted">${r.ms==null?(c.running?'대기':'건너뜀'):r.ok?`${(r.ms/1000).toFixed(1)}초 · 도형 ${r.n}개${r.clean?'':' · 일부 정리됨'}`:`실패 · ${esc(r.err||'')}`}</span></div></div>`;
 return `<div class="comparebox" aria-live="polite"><p class="muted">${c.running?`그리는 중… ${done.length} / ${cells.length}`:`비교 시험 결과 · 성공 ${ok.length} / ${cells.length} · 평균 지금까지 ${avg('old')} / 새 규칙 ${avg('new')}`}${c.stopped?` · 멈춤: ${esc(c.stopped)}`:''} · 저장하지 않는 시험용 결과예요.</p><div class="comparegrid">${c.items.map(x=>`<div class="compareitem"><div class="comparetitle"><strong>${esc(x.title)}</strong> <span class="muted">${esc(x.idea.split(' — ')[0])}</span></div><div class="comparepair">${COMPARE_RULES.map(([k,label])=>cell(x[k],label)).join('')}</div></div>`).join('')}</div></div>`;
}
// ---------- v2.14.0 실수 복구 (T5: U09) ----------
// 이번 접속 중에 가장 최근 지운 것 하나만 되살릴 수 있습니다(새로고침하면 사라짐). 장기 휴지통은 아닙니다.
// {kind:'book', book, index} 또는 {kind:'quote', bookId, bookTitle, quote, index}. 되살리기에 성공한 뒤에만 비웁니다.
// 책을 되살리면 persist → trackChanges가 그 책을 '올릴 변경'으로 옮기고 '지운 책' 목록에서 뺍니다. 삭제 표시(PATCH)가 이미 보내졌거나
// 보내지는 중이어도, 동기화는 한 번에 하나씩만 돌고(syncBusy·syncAgain) 다음 회차에 deleted:false로 다시 올리므로 최종 상태는 '되살림'이 됩니다.
let lastDeleted=null;
function undoBarHTML(){const d=lastDeleted;if(!d)return '';const what=d.kind==='book'?`책 「${esc(cleanDisplayTitle(d.book.workTitle||d.book.title))}」`:`「${esc(cleanDisplayTitle(d.bookTitle||''))}」의 문장`;
  return `<div class="undobar" role="status"><span>최근에 지운 ${what}</span><button type="button" class="link" data-action="undo-delete">되돌리기</button><span class="muted">이번 접속 중에만 되돌릴 수 있어요</span><button type="button" class="undoclose" data-action="dismiss-undo" aria-label="되돌리기 안내 닫기">×</button></div>`}
function undoDelete(){const d=lastDeleted;if(!d)return;
  if(d.kind==='book'){if(books.some(x=>x.id===d.book.id)){lastDeleted=null;flash('이미 서재에 있는 책이에요.');render();return}
    const next=books.slice();next.splice(Math.min(d.index,next.length),0,d.book);
    lastDeleted=null;if(!commit(next,'책을 되살렸어요.'))lastDeleted=d;return}
  const parent=books.find(x=>x.id===d.bookId);
  if(!parent){lastDeleted=null;flash('문장이 있던 책이 서재에 없어서 문장을 되살릴 수 없어요.');render();return}
  if((parent.quotes||[]).some(q=>q.id===d.quote.id)){lastDeleted=null;render();return}
  const qs=(parent.quotes||[]).slice();qs.splice(Math.min(d.index,qs.length),0,d.quote);
  lastDeleted=null;if(!commit(books.map(x=>x.id===d.bookId?normalize({...x,quotes:qs}):x),'문장을 되살렸어요.'))lastDeleted=d}
// ---------- v2.14.0 찾기와 저장 상태 (T4: U05·U06·U08·U12) ----------
// 보기 선호만 이 키에 저장합니다(책 데이터·백업과 섞지 않음). 검색어와 필터는 이번 세션 동안만 유지하고, 새로 열면 비어 있습니다.
const UI_KEY='my-library-ui-v1';
let shelfView='shelf',shelfFilters={life:false,notes:false,unrated:false};
try{const u=JSON.parse(localStorage.getItem(UI_KEY)||'{}');if(u&&u.shelfView==='list')shelfView='list'}catch{}
function saveUi(){try{localStorage.setItem(UI_KEY,JSON.stringify({shelfView}))}catch{}}
const filtersActive=()=>!!(search.trim()||tagFilter||shelfFilters.life||shelfFilters.notes||shelfFilters.unrated);
function filterSummaryHTML(n){if(!filtersActive())return '';const parts=[search.trim()&&`‘${esc(search.trim())}’`,tagFilter&&`태그 ${esc(tagFilter)}`,shelfFilters.life&&'인생책',shelfFilters.notes&&'감상 있음',shelfFilters.unrated&&'평가 안 함'].filter(Boolean);return `${n}권 · ${parts.join(' · ')} <button type="button" class="link" data-action="clear-filters">모두 해제</button>`}
const ratingText=r=>r>0?'★'.repeat(r)+'☆'.repeat(5-r):'평가 안 함';
function renderList(){const ul=$('.booklist');if(!ul)return;const shown=getShown();
  if(!shown.length){ul.innerHTML=`<li class="listempty">${emptyShelfHTML()}</li>`;return}
  ul.innerHTML=shown.map(b=>{const r=Number(b.rating)||0;return `<li><button type="button" class="listrow" data-book="${esc(b.id)}"><span class="listswatch" style="background:${esc(spineColorOf(b))}" aria-hidden="true"></span><span class="listmain"><span class="listtitle">${esc(cleanDisplayTitle(b.workTitle||b.title))}</span><span class="listmeta">${esc([b.author,b.publisher].filter(Boolean).join(' · ')||'저자 미상')}</span></span><span class="listside">${b.lifeBook?'<span class="listlife">인생책</span>':''}<span class="listrating" aria-label="${r?r+'점':'평가 안 함'}">${ratingText(r)}</span></span></button></li>`}).join('')}
document.addEventListener('click',e=>{const v=e.target.closest?.('[data-shelf-view]');if(v){if(shelfView!==v.dataset.shelfView){shelfView=v.dataset.shelfView;saveUi();render();$(`[data-shelf-view="${shelfView}"]`)?.focus({preventScroll:true})}return}
  const f=e.target.closest?.('[data-filter-toggle]');if(f){const k=f.dataset.filterToggle;shelfFilters={...shelfFilters,[k]:!shelfFilters[k]};render();$(`[data-filter-toggle="${k}"]`)?.focus({preventScroll:true})}});
// 서재에 보이지 않는 예전 기록(읽는 중·읽고 싶은 책). 상태를 바꾸지 않고 읽기 전용으로만 보여 줍니다.
const archivedBooks=()=>books.filter(b=>b.status!=='done');
function archiveHTML(){const list=archivedBooks();if(!list.length)return '';return `<hr class="setting-divider"><div class="eyebrow">ARCHIVE</div><h3>보관 중인 이전 기록 ${list.length}권</h3><p>예전에 남긴 읽는 중·읽고 싶은 책이에요. 서재와 통계에는 보이지 않지만 지워지지 않고 JSON 백업과 클라우드에 그대로 들어가요. 여기서는 읽기만 할 수 있어요.</p><ul class="archivelist">${list.map(b=>`<li><span>${esc(b.title)}</span><span class="muted">${esc(b.author||'')}${b.author?' · ':''}${esc(statuses[b.status]||b.status)}</span></li>`).join('')}</ul>`}
// ---------- v2.14.0 등록·기록 (T3: U03·U04·U07·U10) ----------
// 작성 중이던 등록·수정 폼을 설정으로 다녀오는 동안 보관합니다(세션 중에만). {editing, fields:[[name,value]], query}
let pendingAdd=null;
function searchStatusHTML(){if(getApiKey())return '';return `<p class="api-status">도서 검색이 아직 연결되지 않았어요. 검색 없이 제목만 적어도 저장할 수 있어요. <button type="button" class="link" data-action="connect-search">검색 연결하기</button></p>`}
function afterFormRender(){const f=$('#bookform');if(!f)return;f.addEventListener('invalid',e=>{const d=e.target.closest('details');if(d)d.open=true},true);f.addEventListener('change',e=>{if(['title','workTitle','author'].includes(e.target.id))checkDupNotice()});updateSectionHints()}
function resumeAddFields(){const f=$('#bookform'),pa=pendingAdd;if(!f||!pa)return;pendingAdd=null;const m=new Map();for(const [k,v] of pa.fields)m.set(k,v);
  for(const el of f.elements){if(!el.name)continue;if(el.type==='checkbox')el.checked=m.has(el.name);else if(m.has(el.name))el.value=m.get(el.name)}
  const q=$('#apiQuery');if(q)q.value=pa.query||'';const cm=$('#colorMode');if(cm)setColorMode(cm.value);updateMotifPreview();updateSectionHints();checkDupNotice();flash('작성하던 내용을 이어서 쓸 수 있어요.')}
function updateSectionHints(){const v=k=>(document.getElementById(k)?.value||'').trim(),set=(k,t)=>{const el=document.querySelector(`[data-hint="${k}"]`);if(el)el.textContent=t?' · '+t:''};
  set('edition',[v('publisher'),v('translator')&&v('translator')+' 옮김',v('isbn')&&'ISBN',Number(v('pages'))>0&&v('pages')+'쪽'].filter(Boolean).join(' · '));
  const tags=v('tags').split(/[,、·]/).map(t=>t.trim()).filter(Boolean);set('intro',[(v('summary')||v('aiSummary'))&&'소개 있음',tags.length&&`태그 ${tags.length}개`].filter(Boolean).join(' · '));
  const st=v('spineType');set('design',[st&&st!=='auto'&&(SPINE_TYPES[st]||'').split(' — ')[0],document.getElementById('lifeBook')?.checked&&'인생책',v('colorMode')==='auto'?'자동 배색':'직접 고른 색'].filter(Boolean).join(' · '))}
document.addEventListener('input',e=>{if(e.target.closest?.('#bookform'))updateSectionHints()});
document.addEventListener('change',e=>{if(e.target.closest?.('#bookform'))updateSectionHints()});
// 작품 중복 판정(저장 직전 검사와 조기 안내가 같은 규칙을 씁니다)
function findDuplicateWork(cand,exceptId){const nk=canonicalWork({title:cand.workTitle||cand.title,author:cand.author});if(!nk.key)return null;return books.find(x=>{if(x.id===exceptId||x.status!=='done')return false;const xk=canonicalWork({title:x.workTitle||x.title,author:x.author});return xk.key===nk.key&&(!xk.authorKey||!nk.authorKey||xk.authorKey===nk.authorKey)})||null}
function showDupNotice(dup){const n=$('#dupNotice');if(!n)return;n.innerHTML=dup?`<p class="dup-notice">이미 서재에 있는 작품이에요 — 「${esc(dup.workTitle||dup.title)}」${dup.author?' · '+esc(dup.author):''} <button type="button" class="link" data-action="open-existing" data-bid="${esc(dup.id)}">기존 기록 열기</button></p>`:''}
function checkDupNotice(){if(dialog!=='edit'||editing)return;const v=k=>(document.getElementById(k)?.value||'').trim(),title=v('title');showDupNotice(title?findDuplicateWork({title,workTitle:v('workTitle')||title,author:v('author')}):null)}
// 상세의 감상·문장 편집. 초안 키: 책ID|notes {notes}, 책ID|q|문장ID {text,page}
function notesBlockHTML(b){const k=b.id+'|notes',d=drafts.get(k);
  if(d)return `<div class="quoteform notesedit"><label class="sr-only" for="detailNotes">감상</label><textarea id="detailNotes" data-dk="${esc(k)}" data-df="notes" maxlength="100000" placeholder="읽고 느낀 점을 적어 두세요">${esc(d.notes||'')}</textarea><div class="quoteformrow end"><button type="button" class="btn" data-action="cancel-notes">취소</button><button type="button" class="btn primary" data-action="save-notes">감상 저장</button></div></div>`;
  return `<div class="detailnotes">${b.notes?.trim()?esc(b.notes):'<span class="muted">아직 감상이 없어요.</span>'}</div><p class="notesbar"><button type="button" class="link" data-action="edit-notes">${b.notes?.trim()?'감상 수정':'감상 쓰기'}</button></p>`}
function quoteHTML(b,q){const k=b.id+'|q|'+q.id,d=drafts.get(k),qid=esc(q.id);
  if(d)return `<div class="quoteform quoteedit"><label class="sr-only" for="qtext-${qid}">문장</label><textarea id="qtext-${qid}" data-dk="${esc(k)}" data-df="text" maxlength="600">${esc(d.text||'')}</textarea><div class="quoteformrow"><input id="qpage-${qid}" data-dk="${esc(k)}" data-df="page" maxlength="20" inputmode="numeric" placeholder="쪽 (선택)" value="${esc(d.page||'')}" aria-label="쪽"><button type="button" class="btn" data-action="cancel-quote" data-qid="${qid}">취소</button><button type="button" class="btn primary" data-action="save-quote" data-qid="${qid}">저장</button></div></div>`;
  return `<blockquote class="bookquote"><p>${esc(q.text)}</p><div class="quotemeta">${q.page?`<span>${esc(q.page)}쪽</span>`:''}<span class="quoteacts"><button type="button" class="quotedel" data-action="edit-quote" data-qid="${qid}" aria-label="문장 수정">수정</button><button type="button" class="quotedel" data-action="del-quote" data-qid="${qid}" aria-label="문장 삭제">삭제</button></span></div></blockquote>`}
document.addEventListener('input',e=>{const k=e.target.dataset?.dk;if(k&&drafts.has(k))drafts.get(k)[e.target.dataset.df]=e.target.value});
function detailDirty(){const b=books.find(x=>x.id===editing);if(!b)return false;
  for(const [k,d] of drafts){const [bid,kind,qid]=k.split('|');if(bid!==editing)continue;
    if(kind==='quote'&&DRAFT_FIELDS.some(f=>String(d[f]||'').trim()))return true;
    if(kind==='notes'&&String(d.notes||'')!==(b.notes||''))return true;
    if(kind==='q'){const q=(b.quotes||[]).find(x=>x.id===qid);if(q&&(String(d.text||'')!==q.text||String(d.page||'')!==(q.page||'')))return true}}
  return false}
function requestClose(){if(!confirmLeave())return;close()}
document.addEventListener('click',e=>{const tagButton=e.target.closest('[data-tag]');if(tagButton){if(dialog&&!confirmLeave())return;tagFilter=tagButton.dataset.tag||'';if(dialog){if(editing)dropDrafts(editing);dialog=null;editing=null;dialogShownKey='';lastSpine='';dialogOpener=''}view='library';render();return}const paletteButton=e.target.closest('button[data-color]');if(paletteButton){const input=$('#bookColor');if(input)input.value=paletteButton.dataset.color;setColorMode('custom');return}const themeButton=e.target.closest('button[data-theme]');if(themeButton){setTheme(themeButton.dataset.theme);render();return}const back=e.target.closest('[data-api-back]');if(back){apiStage='works';apiActiveWork='';apiBindSource='';showApiResults();return}const bindBtn=e.target.closest('[data-api-bind]');if(bindBtn){const g=rankedWorks()[Number(bindBtn.dataset.apiBind)];if(g){apiStage='bind';apiBindSource=g.id;showApiResults()}return}const bindTo=e.target.closest('[data-api-bind-to]');if(bindTo){bindEditions(Number(bindTo.dataset.apiBindTo));return}const workButton=e.target.closest('[data-api-work]');if(workButton){const group=rankedWorks()[Number(workButton.dataset.apiWork)];if(group){apiStage='editions';apiActiveWork=group.id;showApiResults()}return}const picked=e.target.closest('[data-api-pick]');if(picked){applyBookResult(Number(picked.dataset.apiPick));return}const nav=e.target.closest('[data-view]');if(nav){view=nav.dataset.view;render();return}const t=e.target.closest('[data-filter]');if(t){filter=t.dataset.filter;render();return}const b=e.target.closest('[data-book]');if(b){if(pulling)return;const bid=b.dataset.book;const go=()=>{pulling=false;editing=bid;dialog='detail';dialogEnter=true;lastSpine=bid;render();queueDraw([editing],{instantOnly:true})};if(reduceMotion()){go();return}pulling=true;b.classList.add('pulling');setTimeout(go,170);return}const r=e.target.closest('[data-rate]');if(r){const old=books.find(x=>x.id===editing);if(old){const n=Number(r.dataset.rate);commit(books.map(x=>x.id===editing?{...x,rating:x.rating===n?0:n}:x),'평점을 저장했어요.')}return}const a=e.target.closest('[data-action]');if(!a){if(e.target.classList?.contains('overlay')&&downTarget===e.target)requestClose();return}switch(a.dataset.action){case'api-search':searchKakaoBooks();break;case'ai-motif':generateMotifWithAI();break;case'fetch-summary':fetchSummaryForCurrent();break;case'ai-analyze':if(editing)analyzeBook(editing,{draw:false}).catch(()=>{});break;case'retry-motif':{const bk=books.find(x=>x.id===editing);if(!bk||!needsDrawing(bk))break;if(!getAiKey()){flash('먼저 Gemini API 키를 저장하세요.');break}const pu=pausedUntil(AI_DRAW_MODEL);if(pu){flash(dailyMsg(AI_DRAW_MODEL,pu));break}drawFail.delete(bk.id);queueDraw([bk.id],{front:true});render();break}case'motif-compare':runMotifCompare();break;case'analyze-all':analyzeAll();break;case'toggle-life':{const bk=books.find(x=>x.id===editing);if(!bk)break;commit(books.map(x=>x.id===editing?normalize({...x,lifeBook:!x.lifeBook}):x),bk.lifeBook?'인생책에서 내렸어요.':'인생책으로 간직했어요.');break}case'auto-color':{setColorMode('auto');previewAutoColor();break}case'recolor-all':{const n=books.filter(x=>x.colorMode!=='auto').length;if(!n){flash('모든 책이 이미 자동 배색이에요.');break}if(!confirm(`책 ${n}권의 책등 색을 새 팔레트로 자동 배합합니다. 직접 고른 색도 바뀝니다. 먼저 JSON 백업을 받아 두길 권해요. 계속할까요?`))break;commit(books.map(x=>normalize({...x,colorMode:'auto',color:autoColorOf(x)})),`${n}권을 새 팔레트로 배합했어요.`);break}case'draw-all':{if(!getAiKey()){flash('먼저 Gemini API 키를 저장하세요.');break}const ids=books.filter(needsDrawing).map(b=>b.id);queueDraw(ids);flash(drawQueue.length?`상징 ${drawQueue.length}권을 5권씩 묶어 그리고 있어요.`:'남은 상징이 없어요.');render();break}case'redraw-motif':{const bk=books.find(x=>x.id===editing);if(!bk)break;if(!getAiKey()){flash('먼저 Gemini API 키를 저장하세요.');break}books=books.map(x=>x.id===editing?normalize({...x,motifDrawnFor:''}):x);persist(books);queueDraw([editing],{front:true,force:true});flash('상징을 다시 그리고 있어요.');render();break}case'add-quote':{const t=($('#newQuote')?.value||'').trim(),pg=($('#newQuotePage')?.value||'').trim();if(!t){flash('추가할 문장을 적어 주세요.');break}const bk=books.find(x=>x.id===editing);if(!bk)break;const dk=draftKey(),kept=drafts.get(dk);drafts.delete(dk);if(!commit(books.map(x=>x.id===editing?normalize({...x,quotes:[...(x.quotes||[]),{id:id(),text:t,page:pg,createdAt:new Date().toISOString()}]}):x),'문장을 모았어요.')&&kept)drafts.set(dk,kept);break}case'del-quote':{const qid=e.target.closest('[data-qid]')?.dataset.qid;if(!qid||!confirm('이 문장을 지울까요?'))break;const bk=books.find(x=>x.id===editing),qi=(bk?.quotes||[]).findIndex(q=>q.id===qid);if(qi<0)break;const gone={kind:'quote',bookId:bk.id,bookTitle:bk.workTitle||bk.title,quote:bk.quotes[qi],index:qi};drafts.delete(bk.id+'|q|'+qid);if(commit(books.map(x=>x.id===editing?normalize({...x,quotes:(x.quotes||[]).filter(q=>q.id!==qid)}):x),'문장을 지웠어요.')){lastDeleted=gone;softRender()}break}case'undo-delete':undoDelete();break;case'dismiss-undo':lastDeleted=null;render();break;case'reanalyze-all':if(confirm('이미 정리된 책까지 모두 새 기준으로 다시 정리할까요? 직접 고친 짧은 소개도 덮어씁니다. 모은 문장은 그대로 둡니다.'))analyzeAll(true);break;case'toggle-raw':{const el=document.querySelector('.rawsummary');if(el){if(el.hidden){el.hidden=false;el.classList.remove('clamp')}else if(el.classList.contains('clamp'))el.classList.remove('clamp');else if(document.querySelector('.aisummary'))el.hidden=true;else el.classList.add('clamp')}break}case'add':editing=null;dialog='edit';dialogEnter=true;apiResults=[];apiError='';apiStage='works';apiActiveWork='';render();if(pendingAdd&&!pendingAdd.editing)resumeAddFields();break;case'edit-notes':{const bk=books.find(x=>x.id===editing);if(!bk)break;drafts.set(editing+'|notes',{notes:bk.notes||''});render();const f=document.getElementById('detailNotes');if(f){f.focus();f.setSelectionRange(f.value.length,f.value.length)}break}case'cancel-notes':drafts.delete(editing+'|notes');render();$('[data-action="edit-notes"]')?.focus({preventScroll:true});break;case'save-notes':{const k=editing+'|notes',d=drafts.get(k);if(!d)break;drafts.delete(k);if(commit(books.map(x=>x.id===editing?normalize({...x,notes:String(d.notes||'')}):x),'감상을 저장했어요.'))$('[data-action="edit-notes"]')?.focus({preventScroll:true});else drafts.set(k,d);break}case'edit-quote':{const qid=a.dataset.qid,bk=books.find(x=>x.id===editing),q=bk?.quotes?.find(x=>x.id===qid);if(!q)break;drafts.set(editing+'|q|'+qid,{text:q.text,page:q.page||''});render();document.getElementById('qtext-'+qid)?.focus();break}case'cancel-quote':{const qid=a.dataset.qid;drafts.delete(editing+'|q|'+qid);render();break}case'save-quote':{const qid=a.dataset.qid,k=editing+'|q|'+qid,d=drafts.get(k);if(!d)break;const t=String(d.text||'').trim();if(!t){flash('문장을 비울 수는 없어요. 지우려면 삭제를 눌러 주세요.');break}drafts.delete(k);if(!commit(books.map(x=>x.id===editing?normalize({...x,quotes:(x.quotes||[]).map(q=>q.id===qid?{...q,text:t,page:String(d.page||'').trim()}:q)}):x),'문장을 고쳤어요.'))drafts.set(k,d);break}case'open-existing':{const bid=a.dataset.bid;if(!books.some(x=>x.id===bid)||!confirmLeave())break;if(!editing)pendingAdd=null;dialog='detail';editing=bid;dialogEnter=true;lastSpine=bid;dialogShownKey='';view='library';render();break}case'connect-search':{const f=$('#bookform');if(!f)break;pendingAdd={editing,fields:[...new FormData(f)].filter(([,v])=>typeof v==='string'),query:$('#apiQuery')?.value||''};dialog=null;editing=null;dialogShownKey='';view='settings';render();const k=$('#gb-key');if(k){k.scrollIntoView({block:'center'});k.focus({preventScroll:true})}break}case'resume-add':{if(!pendingAdd)break;const bid=pendingAdd.editing;if(bid&&!books.some(x=>x.id===bid)){pendingAdd=null;render();break}view='library';editing=bid;dialog='edit';dialogEnter=true;apiResults=[];apiError='';apiStage='works';apiActiveWork='';render();resumeAddFields();break}case'drop-add':pendingAdd=null;render();break;case'clear-filters':search='';tagFilter='';shelfFilters={life:false,notes:false,unrated:false};render();$('#search')?.focus({preventScroll:true});break;case'close':requestClose();break;case'edit':if(dialog==='detail'&&!confirmLeave())break;if(editing)dropDrafts(editing);dialog='edit';apiResults=[];apiError='';apiStage='works';apiActiveWork='';render();break;case'delete':if(confirm('이 책을 서재에서 삭제할까요?')){const i=books.findIndex(b=>b.id===editing),gone=books[i];if(gone&&commit(books.filter(b=>b.id!==editing),'책을 삭제했어요. 책장 위 ‘되돌리기’로 되살릴 수 있어요.')){lastDeleted={kind:'book',book:gone,index:i};close()}}break;case'export':exportData();break;
case'save-key':{const gv=($('#gb-key')?.value||'').trim(),okf=/^[0-9a-fA-F]{32}$/;if(gv&&!okf.test(gv)){flash('카카오 REST API 키는 32자리 영문/숫자입니다. 다시 확인해 주세요.');break}try{gv?localStorage.setItem(API_KEY_STORE,gv):localStorage.removeItem(API_KEY_STORE);apiCooldownUntil=0;apiCache.clear();markKeyDirty('kakao');flash(gv?(session?'카카오 키를 저장했어요. 내 계정에도 보관할게요.':'카카오 REST API 키를 저장했어요. 로그인하면 내 계정에도 보관돼요.'):(session?'키를 삭제했어요. 내 계정에서도 지울게요.':'저장된 키를 삭제했어요.'))}catch{flash('키를 저장하지 못했습니다.')}break}
case'save-ai-key':{const av=($('#ai-key')?.value||'').trim(),okf=/^(?:AQ\.[A-Za-z0-9_\-]{20,220}|AIza[A-Za-z0-9_\-]{25,50})$/;if(av&&!okf.test(av)){flash('Gemini API 키는 AQ. 또는 AIza 로 시작합니다. 다시 확인해 주세요.');break}try{av?localStorage.setItem(AI_KEY_STORE,av):localStorage.removeItem(AI_KEY_STORE);clearPause();markKeyDirty('gemini');flash(av?(session?'Gemini 키를 저장했어요. 내 계정에도 보관할게요.':'Gemini API 키를 저장했어요. 로그인하면 내 계정에도 보관돼요.'):(session?'키를 삭제했어요. 내 계정에서도 지울게요.':'저장된 키를 삭제했어요.'))}catch{flash('키를 저장하지 못했습니다.')}break}
case'raw-download':{try{const blob=new Blob([rawCorrupt],{type:'text/plain'}),u=URL.createObjectURL(blob),a2=document.createElement('a');a2.href=u;a2.download='mnemosyne-corrupt-raw-'+new Date().toISOString().slice(0,10)+'.txt';document.body.append(a2);a2.click();a2.remove();setTimeout(()=>URL.revokeObjectURL(u),15000)}catch{flash('원본을 내려받지 못했습니다.')}break}
case'raw-reset':{if(!confirm('원본을 별도 항목에 보관한 뒤 빈 서재로 시작합니다. 계속할까요?'))break;try{localStorage.setItem(KEY+'-corrupt-'+Date.now(),rawCorrupt);loadProblem=false;rawCorrupt='';books=[];render();flash('새 서재로 시작합니다. 원본은 브라우저에 보관되어 있어요.')}catch(err){flash('원본을 보관하지 못해 초기화를 중단했습니다: '+err.message)}break}case'sync-login':sendLoginLink();break;case'sync-now':if(session){syncNow();flash('동기화하고 있어요.')}break;case'sync-logout':{const n=pendingCount();if(!confirm(n?`아직 클라우드에 올리지 못한 변경이 ${n}건 있어요. 로그아웃해도 이 브라우저에 남아 있다가 다시 로그인하면 올라갑니다. 로그아웃할까요?`:'로그아웃할까요? 이 브라우저의 서재는 그대로 남아 있어요.'))break;const tok=session?.access_token;if(tok)fetch(SB_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+tok}}).catch(()=>{});loginSentTo='';signedOut();render();flash('로그아웃했어요.');break}case'import':$('#importer')?.click();break;case'merge':restore('merge');break;case'replace':restore('replace');break;}});
document.addEventListener('input',e=>{if(['title','workTitle','summary'].includes(e.target.id))updateMotifPreview();if(e.target.id==='bookColor')setColorMode('custom')});
// 색 방식 표시. '자동 배색'을 누르면 유형·인생책 선택에 맞는 자동 색으로 돌아갑니다(저장하면 확정).
function setColorMode(mode){const f=$('#colorMode');if(f)f.value=mode;const n=$('#colorModeNote');if(n)n.textContent=mode==='auto'?'자동 배색 중':'직접 고른 색'}
function previewAutoColor(){if($('#colorMode')?.value!=='auto')return;const c=$('#bookColor');if(!c)return;c.value=autoColorOf({id:editing||'new-book',spineType:$('#spineType')?.value||'auto',lifeBook:!!$('#lifeBook')?.checked})}
document.addEventListener('change',e=>{if(e.target.id==='spineType'||e.target.id==='lifeBook')previewAutoColor()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog)requestClose()});if(!('ResizeObserver' in window))window.addEventListener('resize',scheduleShelf);window.addEventListener('storage',e=>{if(e.key===AUTH_KEY||e.key===SYNC_KEY){loadSync();updateSyncStatus()}if(e.key===KEY&&!dialog){load();render()}});document.addEventListener('change',e=>{if(e.target.id!=='quick-status')return;const v=e.target.value;if(!statuses[v]||!editing)return;commit(books.map(x=>x.id===editing?{...x,status:v}:x),'독서 상태를 저장했어요.')});initTheme();loadSync();load();handleAuthRedirect();render();if(session)syncNow();
// 지난번에 다 못 그린 상징이 있으면 잠시 뒤 이어서 그립니다.
setTimeout(()=>{const ids=books.filter(needsDrawing).map(b=>b.id);if(ids.length)queueDraw(ids,{instantOnly:true})},2500);
})();
