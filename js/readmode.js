// 나의 서재 — 독서모드 (v2.20.0, v2.21.0: 컬렉션 진입·다른 책 읽기·기록(문구·메모)·조명)
// 종이책이나 다른 기기로 책을 읽는 동안 켜 두는 화면입니다. 전자책 뷰어가 아닙니다.
// 앱(app.js)의 데이터·저장 함수는 initReadMode(api)로 넘겨받아 씁니다. 책 데이터는 api.patchBook으로만 고칩니다.
//
// 진행 중인 독서(세션)는 이 기기의 localStorage에 계정별로 한 개만 둡니다. 시간은 '쌓인 시간 + (지금 - 다시 시작한 시각)'으로 계산하므로
// 새로고침·탭 이동·화면 잠금 뒤에도 유실되거나 두 번 쌓이지 않습니다. 여러 탭은 같은 기록 하나를 함께 보므로 따로 세지 않습니다.
// 독서를 마치면 책의 readSec(총 독서 시간, 초)에 더합니다. 같은 세션은 readLast(마지막으로 더한 세션 번호)로 두 번 더하지 않습니다.

// ---------- 바꾸기 쉬운 설정 (이후 꾸미기용) ----------
export const RM_CONFIG={
 // 시간대(기기 시각 기준, 시). 경계 앞뒤 fadeMin분 동안 서서히 바뀝니다. 실제 일출·일몰과는 연동하지 않습니다.
 bands:{day:6,dusk:17,night:19},fadeMin:30,
 // 자리를 비운 시간이 이보다 길면 돌아왔을 때 넣을지 물어봅니다(분).
 awayAskMin:30,
 // 장면 색·소재. CSS 변수로 들어갑니다.
 style:{wall:'#efe7d9',wood:'#7b5236',woodDark:'#4f3220',woodLight:'#9c6d48',cream:'#f6f1e7',ink:'#3a2e26',lightTint:'255,232,196'},
 scenery:'city', // 창밖 풍경 종류(지금은 도시 실루엣 하나)
 object:null,     // 정해진 자리의 오브제 하나(이번 버전은 없음)
 // 조명: 전등(펜던트) 갓 색과 빛 색, 책장 간접조명 빛 색. 켜고 끄는 상태는 사용자가 정해 이 기기에 기억합니다.
 lamp:{shade:'#2f2a27',shadeLight:'#4a423c',light:'255,206,140'},shelfLight:'255,208,150'
};
const SESSION_KEY='my-library-readsession-v1:',PREF_KEY='my-library-readmode-v1';
const TIMES={auto:'자동',day:'낮',dusk:'노을',night:'밤'},WEATHERS={clear:'맑음',cloudy:'흐림',rain:'비',snow:'눈'};

let api=null,root=null,pill=null,ticker=0,lastBeat=0,lastEnv=0,wakeLock=null,menuOpen=false,shownId='';
let prefs={time:'auto',weather:'clear',wake:false,lamp:true,shelf:true};

const now=()=>Date.now();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>api.uid()||'';
const key=()=>SESSION_KEY+uid();
function readJSON(k){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v&&typeof v==='object'?v:null}catch{return null}}
function getSession(){const s=readJSON(key());return s&&s.id&&s.bookId?s:null}
// v2.28.0: 저장·삭제가 실제로 되었는지 돌려줍니다(저장 공간 부족·접근 제한 시 false). 호출부는 실패하면 다음 단계로 넘어가지 않습니다.
function putSession(s){
 try{
  const k=key();
  if(s){const v=JSON.stringify(s);localStorage.setItem(k,v);if(localStorage.getItem(k)!==v)throw Error('verify')}
  else{localStorage.removeItem(k);if(localStorage.getItem(k)!==null)throw Error('verify')}
  storeFailAt=0;return true;
 }catch(err){storeFail(err);return false}
}
// 같은 오류 알림을 1초마다 반복하지 않도록 30초에 한 번만 알립니다.
let storeFailAt=0;
function storeFail(err){
 const t=now();if(t-storeFailAt<30000)return;storeFailAt=t;
 const full=/quota/i.test(String(err?.name||'')+String(err?.message||''));
 api?.flash?.(full?'이 기기 저장 공간이 부족해 독서 상태를 저장하지 못했어요. 지금 새로고침하면 진행 중인 시간이 사라질 수 있어요.':'이 브라우저가 저장소 접근을 막아 독서 상태를 저장하지 못했어요. 지금 새로고침하면 진행 중인 시간이 사라질 수 있어요.');
}
const elapsed=(s,t=now())=>Math.max(0,(Number(s.acc)||0)+(s.runFrom?t-s.runFrom:0));
export function fmtClock(ms){const t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return [h,m,x].map(v=>String(v).padStart(2,'0')).join(':')}
export function fmtDuration(sec){sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);if(!h&&!m)return sec>0?'1분 미만':'0분';return (h?h+'시간 ':'')+(m||!h?m+'분':'').trim()}
const book=id=>api.books().find(b=>b.id===id)||null;
const titleOf=b=>api.cleanDisplayTitle(b.workTitle||b.title);

// ---------- 시간·날씨 ----------
// 낮·노을·밤의 섞임 비율(합 1). 경계 앞뒤 fadeMin분 동안 직선으로 바뀝니다.
export function timeWeights(date=new Date()){
 const h=date.getHours()+date.getMinutes()/60,f=RM_CONFIG.fadeMin/60,{day,dusk,night}=RM_CONFIG.bands;
 const ramp=(x,a)=>Math.max(0,Math.min(1,(x-(a-f))/(2*f))); // a-f에서 0, a+f에서 1
 const toDay=ramp(h,day),toDusk=ramp(h,dusk),toNight=ramp(h,night);
 let w={day:0,dusk:0,night:0};
 if(h<day+f){w.day=toDay;w.night=1-toDay}
 else if(h<dusk+f){w.dusk=toDusk;w.day=1-toDusk}
 else if(h<night+f){w.night=toNight;w.dusk=1-toNight}
 else w.night=1;
 return w;
}
function envWeights(){return prefs.time==='auto'?timeWeights():{day:+(prefs.time==='day'),dusk:+(prefs.time==='dusk'),night:+(prefs.time==='night')}}
function applyEnv(){
 if(!root)return;const w=envWeights(),r=root.style,wx=prefs.weather;
 r.setProperty('--w-day',w.day.toFixed(3));r.setProperty('--w-dusk',w.dusk.toFixed(3));r.setProperty('--w-night',w.night.toFixed(3));
 // 창으로 드는 빛: 낮이 가장 밝고, 흐림·비·눈이면 약해집니다(비 오는 날은 강한 햇빛을 거의 없앱니다).
 const sun=(w.day*1+w.dusk*.75)*({clear:1,cloudy:.4,rain:.15,snow:.45}[wx]||1);
 r.setProperty('--sun',sun.toFixed(3));
 r.setProperty('--dim',(w.night*.42+w.dusk*.08+(wx==='rain'?.08:wx==='cloudy'?.05:0)).toFixed(3));
 // 창밖 도시 색: 낮·노을·밤 색을 비율대로 섞습니다.
 const mix=(cols)=>'#'+[0,1,2].map(i=>Math.round(cols.reduce((a,[hex,k])=>a+parseInt(hex.slice(1+i*2,3+i*2),16)*k,0)).toString(16).padStart(2,'0')).join('');
 r.setProperty('--city',mix([['#8e9db0',w.day],['#6a5f86',w.dusk],['#1d2237',w.night]]));
 root.dataset.weather=wx;root.classList.toggle('rm-dark',w.night>.5);
 // 조명: 어두울수록 또렷하게. 낮에도 켜져 있으면 은은하게 보입니다.
 r.setProperty('--lampk',prefs.lamp?(.5+w.dusk*.25+w.night*.5+(wx==='rain'||wx==='cloudy'?.1:0)).toFixed(3):'0');
 r.setProperty('--shelfk',prefs.shelf?(.38+w.dusk*.35+w.night*.62+(wx==='rain'||wx==='cloudy'?.08:0)).toFixed(3):'0');
 root.classList.toggle('lamp-on',!!prefs.lamp);
 const lb=root.querySelector('.rm-lamp');if(lb){lb.setAttribute('aria-pressed',String(!!prefs.lamp));lb.setAttribute('aria-label',prefs.lamp?'전등 끄기':'전등 켜기')}
 root.querySelectorAll('[data-rm-light]').forEach(b=>b.setAttribute('aria-pressed',String(!!prefs[b.dataset.rmLight])));
 root.querySelectorAll('[data-rm-time]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rmTime===prefs.time)));
 root.querySelectorAll('[data-rm-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rmWeather===prefs.weather)));
 const lab=root.querySelector('.rm-envnote');if(lab)lab.textContent=`${prefs.time==='auto'?'자동('+(['day','dusk','night'].map(k=>[k,w[k]]).sort((a,b)=>b[1]-a[1])[0][0]==='day'?'낮':w.dusk>=w.night?'노을':'밤')+')':TIMES[prefs.time]} · ${WEATHERS[wx]} 분위기 — 직접 고른 분위기로, 실제 날씨가 아니에요.`;
 lastEnv=now();
}
function weatherHTML(){
 // 비·눈은 창 안에만, 입자 수를 적게 둡니다. 위치·속도는 매번 같게(무작위 아님) 정합니다.
 let s='';for(let i=0;i<22;i++)s+=`<i class="rm-drop" style="--x:${(i*37)%100}%;--d:${(.75+(i*13%9)/20).toFixed(2)}s;--t:${(-(i*7%11)/10).toFixed(1)}s"></i>`;
 for(let i=0;i<26;i++)s+=`<i class="rm-flake" style="--x:${(i*41+7)%100}%;--d:${(6+(i*5%7)).toFixed(1)}s;--t:${(-(i*3%13)).toFixed(1)}s;--s:${2+(i%3)}px"></i>`;
 return `<div class="rm-weather" aria-hidden="true">${s}</div>`;
}
function skylineSVG(){
 // 단순한 도시 실루엣(고정된 모양). 밤에는 창 몇 개에 불이 켜집니다.
 const bs=[[0,58,9],[8,40,7],[14,66,10],[23,48,6],[28,74,8],[35,52,9],[43,82,7],[49,60,10],[58,44,8],[65,70,9],[73,50,7],[79,88,8],[86,56,9],[94,64,8]];
 let rects='',lights='';
 bs.forEach(([x,h,w],i)=>{rects+=`<rect x="${x}" y="${100-h}" width="${w}" height="${h}"/>`;for(let k=0;k<3;k++){const ly=100-h+8+k*((h-14)/3)+((i*5+k*3)%5),lx=x+1.5+((i+k)%3)*(w-4)/2;if((i+k)%3!==1)lights+=`<rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="1.6" height="2.2"/>`}});
 return `<svg class="rm-city" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g class="rm-city-far">${rects}</g><g class="rm-city-lights">${lights}</g></svg>`;
}

// ---------- 장면 ----------
// 책장에 꽂을 책: 완독한 책 중 인생책 먼저, 나머지는 최근에 추가한 순. 지금 읽는 책은 뺍니다. 데이터는 바꾸지 않습니다.
export function pickShelfBooks(list,currentId){
 const seen=new Set();
 return list.filter(b=>b.status==='done'&&b.id!==currentId&&!seen.has(b.id)&&seen.add(b.id))
  .sort((a,b)=>(b.lifeBook-a.lifeBook)||String(b.createdAt).localeCompare(String(a.createdAt)));
}
const TIER_H=262,FRAME={side:14,top:16,mid:16,bottom:18,pad:12};
function layoutShelf(){
 const wrap=root?.querySelector('.rm-shelfwrap'),shelf=root?.querySelector('.rm-shelf');if(!wrap||!shelf)return;
 const s=getSession(),b=s&&book(s.bookId);
 const rect=wrap.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const mobile=root.classList.contains('rm-narrow'),tierH=mobile?226:TIER_H;
 // 책등 글자를 읽을 수 있도록 너무 작게 줄이지 않습니다. 공간이 모자라면 꽂는 권수를 줄이고, 아주 낮은 화면에서는 한 단만 보여 줍니다.
 const kMin=mobile?.62:.6,DH2=FRAME.top+tierH+FRAME.mid+tierH+FRAME.bottom,tiers=rect.height/DH2>=kMin?2:1;
 const DH=tiers===2?DH2:FRAME.top+tierH+FRAME.bottom;
 const k=Math.max(kMin,Math.min(mobile?.82:1.1,rect.height/DH));
 const DW=rect.width/k,inner=DW-2*FRAME.side-2*FRAME.pad;
 const m={min:mobile?26:32,max:mobile?44:60,gap:mobile?4:5,inner};
 const groups=api.packShelves(pickShelfBooks(api.books(),b?.id),m).slice(0,tiers);
 while(groups.length<2)groups.push([]);
 shelf.classList.toggle('one-tier',tiers===1);
 shelf.style.width=DW+'px';shelf.style.height=DH+'px';shelf.style.transform=`scale(${k})`;
 shelf.style.setProperty('--tier-h',tierH+'px');
 shelf.querySelectorAll('.rm-books').forEach((el,i)=>{
  // 앱의 책등 그리기를 그대로 쓰되, 누를 수 없는 전시용으로 바꿉니다(상세 열기·안내 상자 없음).
  el.innerHTML=groups[i].map(x=>api.spineHTML(x,m).replace('<button class="spine','<span class="spine').replace('type="button" data-book=','aria-hidden="true" data-rm-book=').replace(/<\/button>$/,'</span>')).join('');
 });
 shelf.setAttribute('aria-label',`완독한 책 ${groups[0].length+groups[1].length}권이 꽂힌 책장`);
 api.fitTitles(shelf);
}
// v2.23.0 지금 읽는 책: 이 책에 저장된 책등 색·서체 유형·상징으로 앞표지를 만들고(데이터는 읽기만 함), 작은 받침대 위에 곧게 세웁니다.
// 표지에는 제목·작가·상징만 넣습니다. 오른쪽 가장자리에 페이지 단면과 뒤표지가 좁게 보이고, 왼쪽에 책등과 표지 사이의 홈이 있습니다.
function bookOnStandHTML(b){
 const cls=api.spineClass(b),type=(cls.match(/\bt-([a-f])\b/)||[,'a'])[1],light=/\blight\b/.test(cls);
 const motif=api.spineMotif(b,64)||'',title=esc(titleOf(b)),author=esc(api.cleanAuthor(b.author)||'');
 return `<div class="rm-book bk-${type}${light?' bk-light':''}" style="--bk:${api.spineColorOf(b)}" role="img" aria-label="「${title}」 앞표지">
  <span class="rm-bk-back" aria-hidden="true"></span><span class="rm-bk-pages" aria-hidden="true"></span>
  <div class="rm-bk-front" aria-hidden="true"><span class="rm-bk-hinge"></span><div class="rm-bk-inner">${motif?`<span class="rm-bk-motif">${motif}</span>`:''}<strong class="rm-bk-title">${title}</strong>${author?`<span class="rm-bk-author">${author}</span>`:''}</div><span class="rm-bk-glow"></span></div>
  <span class="rm-bk-contact" aria-hidden="true"></span></div>
 <div class="rm-stand" aria-hidden="true"><span class="rm-stand-top"></span><span class="rm-stand-post"></span><span class="rm-stand-base"></span></div>`;
}
function sceneHTML(b){
 const c={...RM_CONFIG.style,lamp:RM_CONFIG.lamp};
 return `<div class="rm-scene" style="--shelf-rgb:${RM_CONFIG.shelfLight};--lamp-rgb:${c.lamp.light};--rm-wall:${c.wall};--rm-wood:${c.wood};--rm-wood-d:${c.woodDark};--rm-wood-l:${c.woodLight};--rm-cream:${c.cream};--rm-ink:${c.ink};--rm-light:${c.lightTint}">
 <div class="rm-wall" aria-hidden="true"></div>
 <div class="rm-window" aria-hidden="true"><div class="rm-sky s-day"></div><div class="rm-sky s-dusk"></div><div class="rm-sky s-night"></div><div class="rm-clouds"></div>${skylineSVG()}<div class="rm-overcast"></div>${weatherHTML()}<div class="rm-glass"></div><div class="rm-frame"></div></div>
 <div class="rm-beam" aria-hidden="true"></div>
 <div class="rm-shelfwrap"><div class="rm-shelf" role="img"><div class="rm-back"></div><div class="rm-tier"><div class="rm-books"></div></div><div class="rm-board"></div><div class="rm-tier"><div class="rm-books"></div></div></div></div>
 <div class="rm-desk" aria-hidden="true"><div class="rm-desktop"></div><div class="rm-deskedge"></div></div>
 <div class="rm-current"><div class="rm-curtitle"><h2>${esc(titleOf(b))}</h2><p>${esc(api.cleanAuthor(b.author)||'작가 미상')}</p></div><div class="rm-curbook">${bookOnStandHTML(b)}</div></div>
 <div class="rm-dimmer" aria-hidden="true"></div>
 <div class="rm-lampzone" style="--shade:${c.lamp.shade};--shade-l:${c.lamp.shadeLight};--lamp-rgb:${c.lamp.light}"><div class="rm-lampbeam" aria-hidden="true"></div><div class="rm-lamppool" aria-hidden="true"></div><button type="button" class="rm-lamp" data-rm="lamp" aria-pressed="true" aria-label="전등 끄기"><span class="rm-canopy"></span><span class="rm-cord"></span><span class="rm-shade"><span class="rm-bulb"></span></span></button></div>
 </div>`;
}
function uiHTML(){
 return `<header class="rm-top"><div class="rm-brand">나의 서재</div><div class="rm-topright"><button type="button" class="rm-pillbtn rm-switch-top" data-rm="switch">다른 책 읽기</button><button type="button" class="rm-pillbtn rm-finish-top" data-rm="finish">독서 마치기</button><button type="button" class="rm-iconbtn" data-rm="env" aria-label="분위기 설정" aria-expanded="false">⚙</button><button type="button" class="rm-exit" data-rm="exit" aria-label="화면 나가기"><span class="rm-exit-label">화면 나가기</span><span class="rm-x" aria-hidden="true"></span></button></div>
 <div class="rm-env" hidden><p class="rm-envhead">시간</p><div class="rm-seg">${Object.entries(TIMES).map(([k,l])=>`<button type="button" data-rm-time="${k}">${l}</button>`).join('')}</div><p class="rm-envhead">조명</p><div class="rm-seg"><button type="button" data-rm-light="lamp">전등</button><button type="button" data-rm-light="shelf">책장 조명</button></div><p class="rm-envhead">날씨 분위기</p><div class="rm-seg">${Object.entries(WEATHERS).map(([k,l])=>`<button type="button" data-rm-weather="${k}">${l}</button>`).join('')}</div>${'wakeLock' in navigator?`<label class="rm-wake"><input type="checkbox" data-rm="wake" ${prefs.wake?'checked':''}> 읽는 동안 화면 켜두기</label>`:''}<p class="rm-envnote"></p></div></header>
 <section class="rm-ui"><p class="rm-label">함께 읽는 시간</p><div class="rm-time" role="timer" aria-live="off">00:00:00</div><div class="rm-controls"><button type="button" class="rm-startbtn" data-rm="start"><span class="rm-tri" aria-hidden="true"></span>독서 시작</button><button type="button" class="rm-round rm-play" data-rm="toggle" aria-label="일시정지"><span class="rm-ico"></span></button><button type="button" class="rm-round rm-memo" data-rm="record">기록</button></div><p class="rm-state" aria-live="polite"></p><div class="rm-bottombtns"><button type="button" class="rm-pillbtn" data-rm="switch">다른 책 읽기</button><button type="button" class="rm-pillbtn rm-finish-bottom" data-rm="finish">독서 마치기</button></div></section>
 <div class="rm-modal" hidden></div>`;
}

// ---------- 열기·닫기 ----------
function newSession(bookId,run){const t=now();return {id:'rs-'+t.toString(36)+Math.random().toString(36).slice(2,7),bookId,uid:uid(),startedAt:new Date(t).toISOString(),acc:0,runFrom:run?t:null,beat:t,started:!!run}}
const isStarted=s=>!!s&&s.started!==false; // v2.21 이전 세션(started 없음)은 이미 시작된 것으로 봅니다.
// autostart: 책 카드·상세의 [독서 시작]처럼 사용자가 이미 시작을 누른 경우만 바로 흐릅니다. 메뉴·고르기로 열면 준비 상태입니다.
export function openReadMode(bookId,{autostart=false}={}){
 const b=book(bookId);if(!b)return;
 let s=getSession();
 if(s&&s.bookId!==bookId){const ob=book(s.bookId);
  if(ob){openPicker({target:bookId});return}
  s=null;putSession(null); // 책이 지워진 세션은 정리합니다.
 }
 if(!s){s=newSession(bookId,autostart);if(!putSession(s))return}
 else if(autostart&&!isStarted(s)){show();setRunning(true);return}
 show();
}
// ---------- 진입·종료 전환 (v2.26.0: 공간 이동형) ----------
// 서재와 독서 공간이 한 방에 나란히 있는 것처럼, 카메라가 오른쪽으로 옮겨 가는 연출입니다.
// 진입(1,300ms): 0~150ms 서재의 버튼·제목이 사라짐 → 150~500ms 서재가 살짝 확대되며 오른쪽으로 움직이기 시작(독서 공간 가장자리가 보임)
//   → 500~1,000ms 책장이 왼쪽으로 벗어나고 독서 공간이 오른쪽에서 이어져 들어옴 → 1,000~1,300ms 독서 공간에 정착하며 책·조명·UI가 선명해짐.
// 종료(800ms): 같은 길을 거꾸로(카메라가 왼쪽으로) 돌아옵니다. 스크롤 위치는 바꾸지 않습니다.
// 전환은 화면 표시만 바꿉니다. 타이머·세션·기록은 건드리지 않습니다. 전환 중 다시 누르면 무시하고, 시간이 지나면 상태를 반드시 정리합니다.
const ENTER_MS=1300,LEAVE_MS=800;
let entering=0,leavingEl=null,leaveTimer=0,pushedState=false,ignorePop=false;
const reducedMotion=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function appEl(){return document.getElementById('root')}
function finishLeave(){clearTimeout(leaveTimer);leaveTimer=0;if(leavingEl){leavingEl.remove();leavingEl=null}const a=appEl();if(a){a.style.transition='';a.style.transform='';a.style.opacity='';a.style.transformOrigin=''}document.documentElement.classList.remove('rm-entering','rm-pan-in','rm-pan-out')}
function animateIn(){
 const html=document.documentElement,a=appEl(),g=++entering;
 if(reducedMotion()){root.classList.add('rm-enter-min');setTimeout(()=>{if(g!==entering)return;entering=0;root?.classList.remove('rm-enter-min')},180);html.classList.add('rm-open');return}
 if(a){a.style.transformOrigin=`50% ${Math.round(scrollY+innerHeight/2)}px`}
 html.classList.add('rm-pan-in');root.classList.add('rm-enter');
 setTimeout(()=>{if(g!==entering)return;entering=0;root?.classList.remove('rm-enter');html.classList.remove('rm-pan-in');html.classList.add('rm-open');if(a)a.style.transformOrigin=''},ENTER_MS+30);
}
function show(){
 const s=getSession();if(!s)return;const b=book(s.bookId);if(!b){putSession(null);return}
 if(root&&entering)return; // 진입 중 중복 실행 방지
 const fresh=!root;
 if(fresh&&leavingEl)finishLeave(); // 종료 전환 도중 다시 열면 남은 화면을 바로 정리
 if(!root){root=document.createElement('div');root.id='readmode';root.className='rm';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','독서모드');document.body.append(root)}
 shownId=s.id;
 root.classList.toggle('rm-narrow',innerWidth<760||innerHeight>innerWidth*1.05);
 root.innerHTML=sceneHTML(b)+uiHTML();
 if(fresh){animateIn();
  // 브라우저 뒤로 가기로 독서모드를 닫을 수 있게 기록을 하나 남깁니다(주소는 그대로).
  if(!history.state?.rm){try{history.pushState({...(history.state||{}),rm:1},'');pushedState=true}catch{}}
 }else document.documentElement.classList.add('rm-open');
 const app=appEl();if(app)app.inert=true;
 applyEnv();requestAnimationFrame(layoutShelf);tick(true);updatePill();
 if(prefs.wake)requestWake();
 root.querySelector(isStarted(s)?'[data-rm="toggle"]':'[data-rm="start"]')?.focus({preventScroll:true});
 checkAway();
}
function hide({fromPop=false}={}){
 if(!root)return;{const s=getSession();if(s&&!isStarted(s))putSession(null)}
 const el=root,html=document.documentElement,a=appEl();
 el.removeAttribute('id');el.setAttribute('aria-hidden','true');
 root=null;shownId='';menuOpen=false;entering=0;
 html.classList.remove('rm-open','rm-entering','rm-pan-in');
 if(a)a.inert=false;
 releaseWake();updatePill();
 // 남겨 둔 뒤로 가기 기록을 정리합니다(뒤로 가기로 닫힌 경우는 이미 정리됨).
 if(pushedState&&!fromPop&&history.state?.rm){ignorePop=true;try{history.back()}catch{ignorePop=false}}
 pushedState=false;
 if(reducedMotion()){el.remove();if(a){a.style.transform='';a.style.opacity=''}return}
 if(leavingEl)finishLeave();
 leavingEl=el;el.classList.remove('rm-enter','rm-enter-min');el.classList.add('rm-leave');el.style.pointerEvents='none';
 if(a)a.style.transformOrigin=`50% ${Math.round(scrollY+innerHeight/2)}px`;
 html.classList.add('rm-pan-out');
 leaveTimer=setTimeout(finishLeave,LEAVE_MS+40);
}
export const readModeOpen=()=>!!root;

// ---------- 타이머 ----------
function setRunning(run){
 const s=getSession();if(!s)return;const t=now();
 if(run&&!s.runFrom){s.runFrom=t;s.beat=t;s.started=true}else if(!run&&s.runFrom){s.acc=elapsed(s,t);s.runFrom=null}else return true;
 const ok=putSession(s);tick(true);return ok;
}
// 1초마다 숫자 몇 개만 바꿉니다(장면은 다시 그리지 않습니다).
function tick(force){
 const s=getSession();
 if(!s){if(root)hide();updatePill();return}
 if(root&&s.id!==shownId){show();return} // 다른 탭에서 새 세션으로 바뀐 경우
 const t=now(),txt=fmtClock(elapsed(s,t));
 if(root){
  const el=root.querySelector('.rm-time');if(el&&el.textContent!==txt)el.textContent=txt;
  const p=root.querySelector('.rm-play');if(p){p.classList.toggle('paused',!s.runFrom);p.setAttribute('aria-label',s.runFrom?'일시정지':'다시 읽기')}
  const ready=!isStarted(s);root.classList.toggle('rm-ready',ready);
  const st=root.querySelector('.rm-state');if(st){const v=ready?'준비되면 ‘독서 시작’을 눌러 주세요.':s.runFrom?'':'잠시 멈춤';if(st.textContent!==v)st.textContent=v}
  if(t-lastEnv>60000)applyEnv();
 }
 if(pill&&!pill.hidden){const el=pill.querySelector('.rm-pilltime');if(el)el.textContent=txt;pill.classList.toggle('paused',!s.runFrom)}
 // 화면이 보이는 동안 15초마다 '마지막으로 본 시각'을 남깁니다. 잠금·백그라운드에서 돌아올 때 비운 시간을 계산하는 데 씁니다.
 if(document.visibilityState==='visible'&&(force||t-lastBeat>15000)){lastBeat=t;if(s.runFrom&&t-(s.beat||0)<RM_CONFIG.awayAskMin*60000){s.beat=t;putSession(s)}}
}
function checkAway(){
 const s=getSession();if(!s||!s.runFrom||!root)return;
 const gap=now()-(s.beat||now());
 if(gap<RM_CONFIG.awayAskMin*60000)return;
 const mins=Math.round(gap/60000);
 openModal(`<h3>자리를 비운 사이 ${esc(fmtDuration(mins*60))}이 지났어요</h3><p class="rm-muted">화면이 꺼져 있거나 다른 화면에 있던 동안에도 시간은 계속 쌓였어요. 이 시간을 독서 시간에 넣을까요?</p><div class="rm-actions"><button type="button" class="rm-btn" data-rm="away-drop">그 시간 빼기</button><button type="button" class="rm-btn primary" data-rm="away-keep">그대로 두기</button></div>`,{gap});
}
let modalCtx=null;
function openModal(html,ctx={}){if(!root)return;const m=root.querySelector('.rm-modal');modalCtx=ctx;m.innerHTML=`<div class="rm-card" role="dialog" aria-modal="true">${html}</div>`;m.hidden=false;m.querySelector('textarea,input,.primary')?.focus({preventScroll:true})}
// 기록 창은 저장하지 않은 내용이 있으면 바로 닫지 않고 '저장 / 버리기 / 계속 작성'을 묻습니다(force=true는 저장·버리기 뒤 내부에서 닫을 때).
function closeModal(force=false){
 if(!force&&modalCtx?.record&&recordDirty()){showRecordConfirm();return false}
 const m=root?.querySelector('.rm-modal');if(m){m.hidden=true;m.innerHTML=''}modalCtx=null;return true;
}

// ---------- 기록: 문구(모은 문장 + 페이지)와 메모(감상 칸). 둘 다 기존 기록 구조를 그대로 씁니다 ----------
// v2.28.0 초안 보호: 입력할 때마다 '계정·책·종류(문구/메모)'별로 이 기기에 초안을 남깁니다. 저장에 성공해야만 초안을 지웁니다.
// 다시 열면 문구 초안은 빈 칸에 되살리고, 메모 초안은 저장된 감상과 다르면 덮어쓰지 않고 불러올지 묻습니다.
const DRAFT_KEY='my-library-rmdraft-v1';
const draftKey=(bid,kind)=>`${DRAFT_KEY}:${uid()||'local'}:${bid}:${kind}`;
function getDraft(bid,kind){const d=readJSON(draftKey(bid,kind));return d&&typeof d.text==='string'?d:null}
function putDraft(bid,kind,d){try{d?localStorage.setItem(draftKey(bid,kind),JSON.stringify(d)):localStorage.removeItem(draftKey(bid,kind));return true}catch{return false}}
const fmtAt=iso=>{const d=new Date(iso);return Number.isNaN(+d)?'':`${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
function recordVals(){return {q:root?.querySelector('#rm-quote')?.value??'',p:root?.querySelector('#rm-page')?.value??'',m:root?.querySelector('#rm-memo')?.value??''}}
function recordDirty(){if(!modalCtx?.record)return false;const v=recordVals();return !!(v.q.trim()||v.p.trim())||v.m!==modalCtx.memoBase}
function keepDraft(kind){
 const c=modalCtx;if(!c?.record)return;const v=recordVals();
 if(kind==='quote')putDraft(c.bid,'quote',v.q.trim()||v.p.trim()?{text:v.q,page:v.p,at:new Date().toISOString()}:null);
 else putDraft(c.bid,'memo',v.m!==c.memoBase?{text:v.m,base:c.memoBase,at:new Date().toISOString()}:null);
}
function recentQuotesHTML(b){const recent=(b.quotes||[]).slice(-3).reverse();return recent.length?`<p class="rm-envhead">최근 모은 문구</p><ul class="rm-recent">${recent.map(q=>`<li>“${esc(q.text.length>70?q.text.slice(0,70)+'…':q.text)}”${q.page?` <small>p.${esc(q.page)}</small>`:''}</li>`).join('')}</ul>`:''}
function openRecord(tab='quote'){
 const s=getSession(),b=s&&book(s.bookId);if(!b)return;
 const qd=getDraft(b.id,'quote'),md=getDraft(b.id,'memo'),notes=b.notes||'';
 const memoAsk=md&&md.text!==notes;
 if(md&&!memoAsk)putDraft(b.id,'memo',null); // 이미 저장된 내용과 같은 초안은 정리
 openModal(`<h3>기록</h3><div class="rm-tabs" role="tablist"><button type="button" role="tab" data-rm="rtab" data-tab="quote" aria-selected="${tab==='quote'}">문구</button><button type="button" role="tab" data-rm="rtab" data-tab="memo" aria-selected="${tab==='memo'}">메모${memoAsk?' <span class="rm-dot" aria-label="저장하지 않은 초안 있음">•</span>':''}</button></div>
 <div class="rm-pane" data-pane="quote" ${tab==='quote'?'':'hidden'}>${qd?`<p class="rm-draftnote">저장하지 않은 문구를 불러왔어요${qd.at?` (${esc(fmtAt(qd.at))})`:''}.</p>`:''}<label class="rm-notelabel" for="rm-quote">인상 깊은 문구</label><textarea class="rm-text short" id="rm-quote" maxlength="600" placeholder="마음에 남은 문장을 옮겨 적어 두세요">${esc(qd?.text||'')}</textarea><div class="rm-pagerow"><label for="rm-page">페이지</label><input id="rm-page" maxlength="20" inputmode="numeric" placeholder="선택" value="${esc(qd?.page||'')}"></div>
 <div class="rm-recentwrap">${recentQuotesHTML(b)}</div></div>
 <div class="rm-pane" data-pane="memo" ${tab==='memo'?'':'hidden'}>${memoAsk?`<div class="rm-draftask" role="group" aria-label="메모 초안"><p>저장하지 않은 메모 초안이 있어요${md.at?` (${esc(fmtAt(md.at))})`:''}. 지금 저장된 감상과 달라서 자동으로 바꾸지 않았어요.</p><div class="rm-actions left"><button type="button" class="rm-btn" data-rm="draft-load">초안 불러오기</button><button type="button" class="rm-btn quiet" data-rm="draft-drop">초안 버리기</button></div></div>`:''}<p class="rm-muted">「${esc(titleOf(b))}」의 감상 칸에 저장돼요.</p><textarea class="rm-text" id="rm-memo" maxlength="100000" placeholder="떠오른 생각을 적어 두세요">${esc(notes)}</textarea></div>
 <p class="rm-status" role="status" aria-live="polite"></p>
 <p class="rm-muted small">기록하는 동안에도 타이머는 그대로 흘러요.</p>
 <div class="rm-actions"><button type="button" class="rm-btn" data-rm="modal-cancel">닫기</button><button type="button" class="rm-btn primary" data-rm="record-save">저장</button></div>
 <div class="rm-confirm" role="alertdialog" aria-modal="true" aria-labelledby="rm-confirm-h" hidden><p id="rm-confirm-h"><strong>저장하지 않은 기록이 있어요</strong></p><p class="rm-muted rm-confirm-what"></p><div class="rm-actions wrap"><button type="button" class="rm-btn quiet" data-rm="rc-discard">버리기</button><span class="rm-grow"></span><button type="button" class="rm-btn" data-rm="rc-continue">계속 작성</button><button type="button" class="rm-btn primary" data-rm="rc-save">저장</button></div></div>`,{record:true,tab,bid:b.id,memoBase:notes,memoDraft:memoAsk?md:null});
 root.querySelector(tab==='quote'?'#rm-quote':'#rm-memo')?.focus({preventScroll:true});
}
function recordTab(tab){if(!root||!modalCtx?.record)return;modalCtx.tab=tab;root.querySelectorAll('.rm-tabs [data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.tab===tab)));root.querySelectorAll('.rm-pane').forEach(x=>x.hidden=x.dataset.pane!==tab);root.querySelector(tab==='quote'?'#rm-quote':'#rm-memo')?.focus({preventScroll:true})}
function recordStatus(msg,err=false){const el=root?.querySelector('.rm-status');if(el){el.textContent=msg;el.classList.toggle('err',err)}}
// 각 저장은 'ok' | 'skip'(바꿀 것 없음) | 'empty'(문구 비어 있음) | 'fail'(저장 실패: 입력·초안 유지)
function saveQuote(){
 const c=modalCtx,b=book(c.bid);if(!b)return 'fail';
 const v=recordVals(),text=v.q.trim(),page=v.p.trim();
 if(!text)return page?'empty':'skip';
 const q={id:'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),text,page,createdAt:new Date().toISOString()};
 if(!api.patchBook(b.id,x=>({...x,quotes:[...(x.quotes||[]),q]}),`문구를 모았어요${page?` (p.${page})`:''}.`))return 'fail';
 putDraft(b.id,'quote',null);
 const qa=root.querySelector('#rm-quote'),pa=root.querySelector('#rm-page');if(qa)qa.value='';if(pa)pa.value='';
 const w=root.querySelector('.rm-recentwrap');if(w)w.innerHTML=recentQuotesHTML(book(b.id)||b);root.querySelector('.rm-draftnote')?.remove();
 return 'ok';
}
function saveMemo(){
 const c=modalCtx,b=book(c.bid);if(!b)return 'fail';
 const t=recordVals().m,cur=b.notes||'';
 if(t===cur){putDraft(b.id,'memo',null);c.memoBase=cur;return 'skip'}
 if(!t.trim()&&cur){api.flash('칸이 비어 있어 기존 감상은 그대로 두었어요.');putDraft(b.id,'memo',null);const m=root.querySelector('#rm-memo');if(m)m.value=cur;c.memoBase=cur;return 'skip'}
 if(!api.patchBook(b.id,x=>({...x,notes:t}),'메모를 감상에 저장했어요.'))return 'fail';
 putDraft(b.id,'memo',null);c.memoBase=t;root.querySelector('.rm-draftask')?.remove();root.querySelector('.rm-dot')?.remove();
 return 'ok';
}
const FAIL_MSG='저장하지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요.';
function saveRecord(){
 const c=modalCtx;if(!c?.record||c.saving)return;
 c.saving=true;
 try{
  const r=c.tab==='memo'?saveMemo():saveQuote();
  if(r==='fail'){recordStatus(FAIL_MSG,true);return}
  if(r==='empty'){recordStatus('문구를 적어 주세요.',true);root.querySelector('#rm-quote')?.focus();return}
  if(r==='skip'&&c.tab==='quote'){recordStatus('문구를 적어 주세요.',true);root.querySelector('#rm-quote')?.focus();return}
  // 다른 탭에 저장하지 않은 초안이 남아 있으면 창을 닫지 않습니다.
  if(recordDirty()){const other=c.tab==='memo'?'문구':'메모';recordStatus(`${r==='ok'?'저장했어요. ':''}${other} 탭에 아직 저장하지 않은 내용이 있어요.`);return}
  closeModal(true);
 }finally{if(modalCtx===c)c.saving=false}
}
function showRecordConfirm(){
 const box=root?.querySelector('.rm-confirm');if(!box)return;const v=recordVals(),c=modalCtx;
 const what=[(v.q.trim()||v.p.trim())&&'문구',v.m!==c.memoBase&&'메모'].filter(Boolean).join('·');
 box.querySelector('.rm-confirm-what').textContent=`${what}에 저장하지 않은 내용이 있어요. 버리기를 누르기 전까지 이 기기에 초안으로 남아 있어요.`;
 box.hidden=false;c.confirming=true;box.querySelector('[data-rm="rc-continue"]')?.focus({preventScroll:true});
}
function hideRecordConfirm(){const box=root?.querySelector('.rm-confirm');if(box)box.hidden=true;if(modalCtx){modalCtx.confirming=false;root.querySelector(modalCtx.tab==='quote'?'#rm-quote':'#rm-memo')?.focus({preventScroll:true})}}
function confirmSave(){
 const c=modalCtx;if(!c?.record||c.saving)return;c.saving=true;
 try{
  const v=recordVals(),res=[];
  if(v.q.trim()||v.p.trim()){const r=saveQuote();if(r==='empty'){hideRecordConfirm();recordTab('quote');recordStatus('문구를 적어 주세요(페이지만 있어요).',true);return}res.push(r)}
  if(v.m!==c.memoBase)res.push(saveMemo());
  if(res.includes('fail')){hideRecordConfirm();recordStatus(FAIL_MSG,true);return}
  closeModal(true);
 }finally{if(modalCtx===c)c.saving=false}
}
function confirmDiscard(){const c=modalCtx;if(!c?.record)return;putDraft(c.bid,'quote',null);putDraft(c.bid,'memo',null);closeModal(true)}

// ---------- 다른 책 읽기: 읽는 중·읽고 싶은 책에서 고릅니다 ----------
// 읽고 싶은 책을 고르면 사용자가 고른 것이므로 '읽는 중'으로 옮깁니다. 진행 중인 독서가 있으면 그 시간을 어떻게 할지 먼저 묻습니다.
let picker=null,pickCtx=null;
function pickRowHTML(b,cur){return `<li><button type="button" class="rm-pick" data-rm-pick="${esc(b.id)}" ${b.id===cur?'disabled aria-current="true"':''}>${api.coverHTML(b,'cover rm-pickcover')}<span class="rm-pickmain"><span class="rm-picktitle">${esc(titleOf(b))}</span><span class="rm-pickauthor">${esc(api.cleanAuthor(b.author)||'작가 미상')}${b.readSec?` · 총 ${esc(fmtDuration(b.readSec))}`:''}</span></span>${b.id===cur?'<span class="rm-picknow">지금 읽는 중</span>':''}</button></li>`}
export function openPicker({target=''}={}){
 const s=getSession(),cur=s?.bookId||'',list=api.books();
 const byRecent=(a,b)=>String(b.readAt||'').localeCompare(String(a.readAt||''))||String(b.createdAt).localeCompare(String(a.createdAt));
 const reading=list.filter(b=>b.status==='reading').sort(byRecent),want=list.filter(b=>b.status==='want').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 if(!picker){picker=document.createElement('div');picker.className='rm-picker';picker.setAttribute('role','dialog');picker.setAttribute('aria-modal','true');picker.setAttribute('aria-label','읽을 책 고르기');document.body.append(picker)}
 pickCtx={target:''};picker.hidden=false;document.documentElement.classList.add('rm-open');
 picker.innerHTML=`<div class="rm-card rm-pickcard"><h3>다른 책 읽기</h3>${reading.length||want.length?`${reading.length?`<p class="rm-envhead">읽는 중</p><ul class="rm-picklist">${reading.map(b=>pickRowHTML(b,cur)).join('')}</ul>`:''}${want.length?`<p class="rm-envhead">읽고 싶은 책 <small>고르면 ‘읽는 중’으로 옮겨져요</small></p><ul class="rm-picklist">${want.map(b=>pickRowHTML(b,cur)).join('')}</ul>`:''}`:`<p class="rm-muted">읽는 중이거나 읽고 싶은 책이 없어요. 책 목록에서 먼저 추가해 주세요.</p>`}<div class="rm-actions"><button type="button" class="rm-btn" data-rm="pick-close">닫기</button></div></div>`;
 picker.querySelector('.rm-pick:not([disabled]),[data-rm="pick-close"]')?.focus({preventScroll:true});
 if(target)pickBook(target);
}
function closePicker(){if(!picker)return;picker.hidden=true;picker.innerHTML='';pickCtx=null;if(!root)document.documentElement.classList.remove('rm-open')}
function pickBook(id){
 const b=book(id),s=getSession();if(!b)return;
 if(s&&s.bookId!==id&&book(s.bookId)&&elapsed(s)>=1000){
  const ob=book(s.bookId),was=!!s.runFrom;setRunning(false);
  const sec=Math.round(elapsed(getSession())/1000);pickCtx={target:id,was,sec,sid:s.id};
  picker.querySelector('.rm-pickcard').innerHTML=`<h3>「${esc(titleOf(b))}」로 바꿀까요?</h3><p class="rm-muted">「${esc(titleOf(ob))}」을(를) ${esc(fmtDuration(sec))} 읽는 중이에요. 이 시간을 어떻게 할까요?</p><div class="rm-actions wrap"><button type="button" class="rm-btn quiet" data-rm="switch-discard">기록 없이 바꾸기</button><span class="rm-grow"></span><button type="button" class="rm-btn" data-rm="switch-cancel">취소</button><button type="button" class="rm-btn primary" data-rm="switch-save">저장하고 바꾸기</button></div>`;
  picker.querySelector('[data-rm="switch-save"]')?.focus({preventScroll:true});return;
 }
 startWith(id);
}
// 지금 세션을 정리하고 새 책으로 시작합니다. '저장하고 바꾸기'는 이전 책 저장이 성공해야만 넘어갑니다.
function startWith(id,{saveOld=false}={}){
 const s=getSession(),b=book(id);if(!b)return;
 if(s&&s.bookId!==id){
  if(saveOld){
   if(pickCtx?.sid!==s.id){pickError('진행 중인 독서가 바뀌었어요. 다시 골라 주세요.');return}
   if(pickCtx.saving)return;
   pickCtx.saving=true;const btn=picker?.querySelector('[data-rm="switch-save"]');if(btn){btn.disabled=true;btn.textContent='저장하는 중…'}
   const r=saveSessionTime(s,pickCtx.sec,null);
   if(pickCtx){pickCtx.saving=false}if(btn){btn.disabled=false;btn.textContent='저장하고 바꾸기'}
   if(r==='busy'){pickError('다른 탭에서 이 독서를 저장하는 중이에요. 잠시 뒤 다시 눌러 주세요.');return}
   if(r==='fail'){pickError('「'+titleOf(book(s.bookId)||{title:''})+'」의 독서 시간을 저장하지 못했어요. 시간과 진행 상태는 그대로 있어요. 다시 시도해 주세요.');return}
   if(r==='dup')api.flash('이미 저장된 독서예요.');
  }else if(!putSession(null)){pickError('진행 상태를 정리하지 못했어요. 다시 시도해 주세요.');return}
 }
 if(b.status==='want')api.patchBook(id,x=>({...x,status:'reading'}),`「${titleOf(b)}」을(를) 읽는 중으로 옮겼어요.`);
 const cur=getSession();
 if(!cur||cur.bookId!==id){if(!putSession(newSession(id,false))){pickError('새 독서를 시작하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.');return}}
 closePicker();closeModal(true);show();
}
function pickError(msg){const card=picker?.querySelector('.rm-pickcard');if(!card)return;let el=card.querySelector('.rm-saveerr');if(!el){el=document.createElement('p');el.className='rm-saveerr';el.setAttribute('role','alert');card.querySelector('.rm-actions')?.before(el)}el.textContent=msg;el.hidden=false}
// 컬렉션의 '독서모드': 진행 중이면 그 화면, 아니면 가장 최근에 읽던 '읽는 중' 책, 없으면 고르기 창.
export function openReadModeDefault(){
 const s=getSession();if(s&&book(s.bookId)){show();return}
 const reading=api.books().filter(b=>b.status==='reading').sort((a,b)=>String(b.readAt||'').localeCompare(String(a.readAt||''))||String(b.createdAt).localeCompare(String(a.createdAt)));
 if(reading.length){openReadMode(reading[0].id);return}
 openPicker();
}

// ---------- 독서 마치기 ----------
// 책의 총 독서 시간(readSec)에 더하고, 마지막으로 읽은 시각(readAt)·세션 번호(readLast)를 남깁니다. notes가 문자열이면 감상도 함께 저장합니다.
// v2.28.0 저장 순서: ① 같은 세션이 이미 더해졌는지(readLast) 확인 ② 여러 탭 동시 저장 잠금 ③ 책에 시간 더하기(브라우저 저장 성공 확인)
// ④ 성공한 뒤에만 진행 중 세션을 지웁니다. 실패하면 세션·누적 시간·책을 그대로 두고 다시 시도할 수 있습니다.
let savingTime=false;
const LOCK_KEY='my-library-readsave-lock-v1';
function saveSessionTime(s,sec,notes){
 if(savingTime)return 'busy';
 const cur=getSession();if(!cur||cur.id!==s.id){const b0=book(s.bookId);return b0&&b0.readLast===s.id?'dup':'gone'}
 const b=book(s.bookId);
 if(!b){return putSession(null)?'ok':'fail'}
 if(b.readLast===s.id){putSession(null);return 'dup'}
 let lock=null;try{lock=JSON.parse(localStorage.getItem(LOCK_KEY)||'null')}catch{}
 if(lock&&lock.sid===s.id&&lock.tab!==TAB_ID&&now()-lock.at<10000)return 'busy';
 try{localStorage.setItem(LOCK_KEY,JSON.stringify({sid:s.id,tab:TAB_ID,at:now()}))}catch{}
 savingTime=true;
 try{
  if(!addTime(s,sec,notes))return 'fail';
  if(!putSession(null))api.flash('독서 시간은 저장했지만 진행 상태를 정리하지 못했어요. 다시 열면 ‘이미 저장된 독서’로 정리돼요.');
  return 'ok';
 }finally{savingTime=false;try{const l=JSON.parse(localStorage.getItem(LOCK_KEY)||'null');if(l&&l.tab===TAB_ID)localStorage.removeItem(LOCK_KEY)}catch{}}
}
const TAB_ID=Math.random().toString(36).slice(2,10);
function addTime(s,sec,notes){
 const b=book(s.bookId);if(!b)return true;
 if(b.readLast===s.id){api.flash('이미 저장된 독서예요.');return true}
 const keepNotes=notes===null||notes===undefined||notes===(b.notes||'')||(!notes.trim()&&!!b.notes);
 return api.patchBook(b.id,x=>({...x,readSec:(Number(x.readSec)||0)+sec,readLast:s.id,readAt:new Date().toISOString(),...(keepNotes?{}:{notes})}),
  `「${titleOf(b)}」 ${fmtDuration(sec)}을 기록했어요.${uid()?'':' (이 기기에만 저장됨)'}`);
}
function openFinish(){
 const s=getSession(),b=s&&book(s.bookId);if(!s)return;
 const wasRunning=!!s.runFrom;setRunning(false);
 const sec=Math.round(elapsed(getSession())/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);
 openModal(`<h3>독서 마치기</h3><p class="rm-booktitle">${esc(b?titleOf(b):'(지워진 책)')}</p><p class="rm-total">이번 독서 <strong>${esc(fmtClock(sec*1000))}</strong></p>
 <details class="rm-edit"><summary>시간 고치기</summary><div class="rm-hm"><label><input type="number" id="rm-h" min="0" max="99" inputmode="numeric" value="${h}"> 시간</label><label><input type="number" id="rm-m" min="0" max="59" inputmode="numeric" value="${m}"> 분</label></div></details>
 ${b?`<label class="rm-notelabel" for="rm-fnotes">감상 (선택)</label><textarea class="rm-text" id="rm-fnotes" maxlength="100000" placeholder="남기고 싶은 말이 있다면">${esc(b.notes||'')}</textarea>`:''}
 <p class="rm-muted">책의 완독 상태는 바뀌지 않아요. ${uid()?'저장하면 내 계정(클라우드)에도 올라가요.':'로그인하지 않아 이 기기에만 저장돼요.'}</p>
 <p class="rm-saveerr" role="alert" hidden></p>
 <div class="rm-actions wrap"><button type="button" class="rm-btn quiet" data-rm="finish-discard">기록하지 않고 종료</button><span class="rm-grow"></span><button type="button" class="rm-btn" data-rm="finish-back">계속 읽기</button><button type="button" class="rm-btn primary" data-rm="finish-save">저장</button></div>`,{finish:true,wasRunning,sec,h,m,id:s.id,bookId:s.bookId});
}
function finishSave(){
 const c=modalCtx;if(!c?.finish||c.saving)return;const s=getSession();
 if(!s||s.id!==c.id){const b0=c.bookId&&book(c.bookId);closeModal();hide();api.flash(b0&&b0.readLast===c.id?'이미 저장된 독서예요.':'이 독서는 이미 다른 탭에서 마쳤어요.');return}
 const hv=Number(root.querySelector('#rm-h')?.value),mv=Number(root.querySelector('#rm-m')?.value);
 const edited=Number.isFinite(hv)&&Number.isFinite(mv)&&(hv!==c.h||mv!==c.m);
 const sec=edited?Math.max(0,Math.min(99*3600,Math.round(hv)*3600+Math.round(mv)*60)):c.sec;
 const noteEl=root.querySelector('#rm-fnotes'),t=noteEl?noteEl.value:null;
 const btn=root.querySelector('[data-rm="finish-save"]');c.saving=true;if(btn){btn.disabled=true;btn.textContent='저장하는 중…'}
 const r=saveSessionTime(s,sec,t);
 c.saving=false;if(btn){btn.disabled=false;btn.textContent='저장'}
 if(r==='ok'||r==='dup'||r==='gone'){if(r==='dup')api.flash('이미 저장된 독서예요.');closeModal();hide();return}
 if(r==='busy'){setFinishError('다른 탭에서 이 독서를 저장하는 중이에요. 잠시 뒤 다시 눌러 주세요.');return}
 setFinishError('저장하지 못했어요. 이번 독서 시간과 진행 상태는 그대로 있어요. 다시 시도해 주세요.');
}
function setFinishError(msg){const el=root?.querySelector('.rm-saveerr');if(el){el.textContent=msg;el.hidden=false}}
function finishDiscard(){
 const c=modalCtx;if(!c?.finish)return;
 if(!confirm('이번 독서 시간을 기록하지 않고 마칠까요?'))return;
 const s=getSession();if(s&&s.id===c.id&&!putSession(null)){setFinishError('진행 상태를 정리하지 못했어요. 다시 시도해 주세요.');return}
 closeModal();hide();api.flash('기록하지 않고 마쳤어요.');
}

// ---------- 화면 켜두기(지원되는 브라우저에서만) ----------
async function requestWake(){try{if(!wakeLock&&'wakeLock' in navigator&&document.visibilityState==='visible'){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}}catch{wakeLock=null}}
function releaseWake(){try{wakeLock?.release()}catch{}wakeLock=null}

// ---------- 다른 화면의 진행 띠 ----------
function updatePill(){
 const s=getSession(),b=s&&book(s.bookId),want=!!(s&&b&&!root&&isStarted(s));
 if(!pill&&want){pill=document.createElement('button');pill.type='button';pill.id='rm-pill';pill.className='rm-pill';document.body.append(pill);pill.addEventListener('click',()=>show())}
 if(!pill)return;
 pill.hidden=!want;
 if(want){const sig=b.id+'|'+titleOf(b);if(pill.dataset.sig!==sig){pill.dataset.sig=sig;pill.innerHTML=`<span class="rm-pilldot" aria-hidden="true"></span><span class="rm-pilltitle">「${esc(titleOf(b))}」 읽는 중</span><span class="rm-pilltime">${fmtClock(elapsed(s))}</span><span class="rm-pillgo">돌아가기</span>`}}
}

// ---------- 이벤트 ----------
let touchArmed=0,lastPointer='mouse';
function onPickerClick(e){
 if(!picker||picker.hidden||!picker.contains(e.target))return;
 const pk=e.target.closest('[data-rm-pick]');if(pk){pickBook(pk.dataset.rmPick);return}
 const t=e.target.closest('[data-rm]');if(!t){if(e.target===picker)closePicker();return}
 switch(t.dataset.rm){
  case'pick-close':closePicker();break;
  case'switch-cancel':{const c=pickCtx;closePicker();if(c?.was)setRunning(true);break}
  case'switch-save':startWith(pickCtx.target,{saveOld:true});break;
  case'switch-discard':if(confirm('지금까지의 시간을 기록하지 않고 바꿀까요?'))startWith(pickCtx.target);break;
 }
}
function onClick(e){
 if(picker&&!picker.hidden&&picker.contains(e.target)){onPickerClick(e);return}
 if(!root||!root.contains(e.target))return;
 const t=e.target.closest('[data-rm],[data-rm-time],[data-rm-weather],[data-rm-light]');
 if(!t){if(menuOpen&&!e.target.closest('.rm-env'))toggleMenu(false);if(e.target.classList.contains('rm-modal')&&!modalCtx?.finish&&!modalCtx?.gap)closeModal();return}
 if(t.dataset.rmTime){prefs.time=t.dataset.rmTime;savePrefs();applyEnv();return}
 if(t.dataset.rmWeather){prefs.weather=t.dataset.rmWeather;savePrefs();applyEnv();return}
 if(t.dataset.rmLight){const k=t.dataset.rmLight;prefs[k]=!prefs[k];savePrefs();applyEnv();return}
 switch(t.dataset.rm){
  case'start':setRunning(true);root?.querySelector('[data-rm="toggle"]')?.focus({preventScroll:true});break;
  case'toggle':{const s=getSession();setRunning(!s?.runFrom);break}
  case'record':openRecord();break;
  case'rtab':recordTab(t.dataset.tab);break;
  case'record-save':saveRecord();break;
  case'switch':toggleMenu(false);openPicker();break;
  case'lamp':prefs.lamp=!prefs.lamp;savePrefs();applyEnv();break;
  case'modal-cancel':closeModal();break;
  case'rc-continue':hideRecordConfirm();break;
  case'rc-save':confirmSave();break;
  case'rc-discard':confirmDiscard();break;
  case'draft-load':{const c=modalCtx,m=root.querySelector('#rm-memo');if(c?.memoDraft&&m){m.value=c.memoDraft.text;keepDraft('memo');root.querySelector('.rm-draftask')?.remove();recordStatus('메모 초안을 불러왔어요. 저장을 눌러야 감상에 반영돼요.');m.focus()}break}
  case'draft-drop':{const c=modalCtx;if(c?.record){putDraft(c.bid,'memo',null);c.memoDraft=null;root.querySelector('.rm-draftask')?.remove();root.querySelector('.rm-dot')?.remove();recordStatus('메모 초안을 버렸어요.')}break}
  case'finish':toggleMenu(false);openFinish();break;
  case'finish-save':finishSave();break;
  case'finish-discard':finishDiscard();break;
  case'finish-back':{const c=modalCtx;closeModal();if(c?.wasRunning)setRunning(true);break}
  case'away-keep':{const s=getSession();if(s){s.beat=now();putSession(s)}closeModal();break}
  case'away-drop':{const s=getSession(),g=modalCtx?.gap||0;if(s&&s.runFrom){s.runFrom=Math.min(now(),s.runFrom+g);s.beat=now();putSession(s)}closeModal();tick(true);api.flash('자리를 비운 시간을 뺐어요.');break}
  case'env':toggleMenu(!menuOpen);break;
  case'wake':{prefs.wake=!!t.checked;savePrefs();prefs.wake?requestWake():releaseWake();break}
  case'exit':{
   // 터치 화면은 첫 번째 누름에 '화면 나가기' 문구를 보여 주고, 한 번 더 누르면 나갑니다. 마우스는 올리면 문구가 보이고 누르면 나갑니다.
   if(lastPointer!=='mouse'&&now()-touchArmed>3000){touchArmed=now();t.classList.add('armed');setTimeout(()=>t.classList.remove('armed'),3000);return}
   {const st=isStarted(getSession());hide();if(st)api.flash('독서모드 화면을 나왔어요. 타이머는 계속 흘러요.')}break}
 }
}
function toggleMenu(open){menuOpen=open;const m=root?.querySelector('.rm-env'),b=root?.querySelector('[data-rm="env"]');if(m)m.hidden=!open;if(b)b.setAttribute('aria-expanded',String(open))}
function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
function loadPrefs(){const p=readJSON(PREF_KEY)||{};prefs={time:TIMES[p.time]?p.time:'auto',weather:WEATHERS[p.weather]?p.weather:'clear',wake:p.wake===true,lamp:p.lamp!==false,shelf:p.shelf!==false}}

export function initReadMode(a){
 api=a;loadPrefs();
 document.addEventListener('click',onClick);
 document.addEventListener('pointerdown',e=>{lastPointer=e.pointerType||'mouse'},true);
 document.addEventListener('keydown',e=>{
  // 독서모드의 작은 창 안에서 Tab이 창 밖으로 나가지 않게 합니다(확인창이 열려 있으면 확인창 안에서만).
  if(e.key==='Tab'&&root){const m=root.querySelector('.rm-modal:not([hidden])');if(m){const scope=m.querySelector('.rm-confirm:not([hidden])')||m.querySelector('.rm-card');const f=[...scope.querySelectorAll('button:not([disabled]),textarea,input,summary,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);if(f.length){const i=f.indexOf(document.activeElement);if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&(i===-1||i===f.length-1)){e.preventDefault();f[0].focus()}}}}
  if(e.key==='Escape'&&picker&&!picker.hidden){e.stopPropagation();closePicker();return}
  if(!root||e.key!=='Escape')return;e.stopPropagation();
  if(menuOpen)toggleMenu(false);else if(modalCtx?.confirming)hideRecordConfirm();else if(modalCtx&&!modalCtx.finish&&!modalCtx.gap)closeModal()},true);
 document.addEventListener('input',e=>{if(!root||!modalCtx?.record)return;const id=e.target.id;if(id==='rm-quote'||id==='rm-page')keepDraft('quote');else if(id==='rm-memo')keepDraft('memo');if(id)recordStatus('')});
 document.addEventListener('visibilitychange',()=>{
  const s=getSession();
  if(document.visibilityState==='hidden'){if(s&&s.runFrom){s.beat=now();putSession(s)}return}
  tick(true);if(root){checkAway();if(prefs.wake)requestWake()}
 });
 // 다른 탭에서 멈춤·재개·마치기를 하면 이 탭에도 바로 반영합니다(같은 기록 하나를 함께 봅니다).
 window.addEventListener('popstate',()=>{if(ignorePop){ignorePop=false;return}if(root){pushedState=false;hide({fromPop:true})}});
 window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith(SESSION_KEY)){tick(true);updatePill()}if(e.key===PREF_KEY){loadPrefs();applyEnv()}});
 let rt=0;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(!root)return;const n=innerWidth<760||innerHeight>innerWidth*1.05;if(n!==root.classList.contains('rm-narrow')){root.classList.toggle('rm-narrow',n)}layoutShelf()},150)});
 ticker=setInterval(()=>{if(document.visibilityState==='visible')tick(false);updatePill()},1000);
 updatePill();
}
// 앱이 다시 그려진 뒤(로그인·계정 전환 등) 띠를 맞춥니다.
export function syncReadModeUI(){if(!api)return;if(root){const s=getSession();if(!s)hide()}updatePill()}
