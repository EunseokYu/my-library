// 나의 서재 — 관리자 페이지(v2.15.0). 검수된 작품 소개 JSON을 확인하고 work_cache에 저장합니다.
// - 소개문은 받은 그대로 저장합니다(자르거나 고치지 않음). 길이는 JavaScript 문자열 길이(공백·줄바꿈 포함)로 500~700자를 검사합니다.
// - 관리자 권한은 서버 함수(is_admin, admin_upsert_reviewed)가 확인합니다. 이 화면의 버튼 표시는 편의일 뿐 권한이 아닙니다.
// - 원작 판별은 서재와 같은 js/workkey.js를 씁니다.
import {canonicalWork,workKeyOf} from './workkey.js?v=2.15.0';

const SB_URL='https://samgvnfsxmbbsavsvsut.supabase.co';
const SB_KEY='sb_publishable_4Rgm0HZw_7Dg-8p-X2H2lA_Cqyuo6lA'; // 공개용 키(서재 앱과 같음). 비밀 키는 쓰지 않습니다.
const AUTH_KEY='my-library-auth-v1';                          // 서재 앱의 로그인 정보를 함께 씁니다.
const BATCH=50,MIN_LEN=500,MAX_LEN=700,SHOW_STEP=200;
const STATUS={new:'신규',change:'변경',same:'동일',conflict:'충돌',error:'오류'};

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let session=null,isAdmin=null,adminError='';
let fileName='',fileError='',items=[],existing=new Map(),edMap=[];
let filter='all',shown=SHOW_STEP,open=new Set(),selected=new Set();
let run=null;            // {total,done,ok,fail,stopped,running}
let failures=new Map();  // key → {kind,msg}
let hist={q:'',rows:null,err:''};

// ---------- 로그인 ----------
function readSession(){try{const s=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');return s&&s.refresh_token&&s.user?.id?s:null}catch{return null}}
function saveSession(d){
 const p=(()=>{try{return JSON.parse(atob(String(d.access_token).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return {}}})();
 session={access_token:d.access_token,refresh_token:d.refresh_token||session?.refresh_token||'',expires_at:Number(d.expires_at)||Number(p.exp)||Math.floor(Date.now()/1000)+(Number(d.expires_in)||3600),user:{id:String(d.user?.id||p.sub||session?.user?.id||''),email:String(d.user?.email||p.email||session?.user?.email||'')}};
 try{localStorage.setItem(AUTH_KEY,JSON.stringify(session))}catch{}
}
async function refresh(){
 const r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session?.refresh_token||''})});
 const d=await r.json().catch(()=>null);
 if(r.ok&&d?.access_token){saveSession(d);return true}
 return false;
}
async function token(){
 if(!session)return '';
 if(session.expires_at*1000-Date.now()<60000)await refresh().catch(()=>false);
 return session?.access_token||'';
}
// 오류 종류: network(연결) · auth(로그인·권한) · server(그 밖)
async function sb(path,{method='GET',body,again=true}={}){
 const headers={apikey:SB_KEY,Authorization:'Bearer '+await token()};
 if(body!==undefined)headers['Content-Type']='application/json';
 let r;
 try{r=await fetch(SB_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
 catch{const e=Error('서버에 연결하지 못했어요(인터넷 연결 확인).');e.kind='network';throw e}
 if(r.status===401&&again&&await refresh().catch(()=>false))return sb(path,{method,body,again:false});
 const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
 if(!r.ok){
  const msg=String(data?.message||data?.msg||data?.error||'HTTP '+r.status);
  const e=Error(/not_admin/.test(msg)?'관리자 권한이 없어요.':msg.slice(0,200));
  e.kind=r.status===401||r.status===403||/not_admin|42501|permission/i.test(msg+' '+(data?.code||''))?'auth':'server';
  throw e;
 }
 return data;
}

// ---------- 기존 기록 ----------
async function loadExisting(){
 const rows=[];
 for(let off=0;;off+=1000){
  const page=await sb(`/rest/v1/work_cache?select=key,title,author,summary,source,rev,genre,original_title&order=key.asc&limit=1000&offset=${off}`);
  if(!Array.isArray(page))break;rows.push(...page);if(page.length<1000)break;
 }
 existing=new Map(rows.map(r=>[r.key,r]));
 const em=[];
 for(let off=0;;off+=1000){
  const page=await sb(`/rest/v1/edition_map?select=title_key,author_key,work_title,work_author&limit=1000&offset=${off}`);
  if(!Array.isArray(page))break;em.push(...page);if(page.length<1000)break;
 }
 edMap=em;
}

// ---------- JSON 검사 ----------
function checkFile(text){
 items=[];fileError='';selected.clear();open.clear();failures.clear();run=null;shown=SHOW_STEP;
 let data;
 try{data=JSON.parse(text)}catch(e){fileError='JSON 형식이 아니에요: '+e.message;return}
 if(!data||typeof data!=='object'||!Array.isArray(data.books)){fileError='최상위에 books 배열이 있어야 해요.';return}
 if(data.schemaVersion!==1){fileError=`schemaVersion이 1이어야 해요(지금: ${JSON.stringify(data.schemaVersion)}).`;return}
 const topStatus=data.reviewStatus;
 items=data.books.map((b,i)=>{
  const errs=[],str=(v,name,max,need)=>{if(v===undefined||v===null){if(need)errs.push(`${name} 없음`);return ''}if(typeof v!=='string'){errs.push(`${name}가 문자열이 아님`);return ''}if(need&&!v.trim())errs.push(`${name}가 비어 있음`);if(v.length>max)errs.push(`${name}가 ${max}자를 넘음(${v.length}자)`);return v};
  if(!b||typeof b!=='object'||Array.isArray(b))return {i,title:'',author:'',originalTitle:'',genre:'',summary:'',review:'',key:'',work:null,errs:['항목이 객체가 아님'],raw:b};
  const title=str(b.title,'title',150,true),author=str(b.author,'author',120,true),originalTitle=str(b.originalTitle,'originalTitle',200,false),genre=str(b.genre,'genre',60,true);
  const summary=typeof b.aiSummary==='string'?b.aiSummary:'';
  if(typeof b.aiSummary!=='string')errs.push('aiSummary 없음');
  else if(summary.length<MIN_LEN||summary.length>MAX_LEN)errs.push(`소개 길이 ${summary.length}자(${MIN_LEN}~${MAX_LEN}자, 공백·줄바꿈 포함)`);
  const review=b.reviewStatus??topStatus;
  if(review!=='approved'&&review!=='draft')errs.push(`reviewStatus가 approved 또는 draft가 아님(${JSON.stringify(review)})`);
  const key=title&&author?workKeyOf({title,author}):'',c=key?canonicalWork({title,author}):null;
  if(title&&author&&!key)errs.push('원작 키를 만들 수 없음(저자 표기 확인)');
  return {i,title,author,originalTitle,genre,summary,review,key,work:c?{title:c.title,author:c.author}:null,errs,raw:b};
 });
 const count=new Map();for(const it of items)if(it.key)count.set(it.key,(count.get(it.key)||0)+1);
 for(const it of items)if(it.key&&count.get(it.key)>1)it.errs.push(`파일 안에서 같은 원작이 ${count.get(it.key)}번 나옴`);
 classify();
}
// 기존 기록과 비교해 신규·변경·동일·충돌·오류로 나눕니다.
function classify(){
 const byTitle=new Map();for(const k of existing.keys()){const [t]=k.split('|');if(!byTitle.has(t))byTitle.set(t,[]);byTitle.get(t).push(k)}
 for(const it of items){
  it.conflicts=[];
  if(it.errs.length){it.status='error';continue}
  const [t,a]=it.key.split('|'),ex=existing.get(it.key);
  if(!ex){
   for(const k of byTitle.get(t)||[])if(k!==it.key)it.conflicts.push(`같은 제목의 다른 저자 기록이 있어요: ${k} — 같은 작품이면 JSON의 저자 표기를 기존과 맞추고, 다른 작품이면 그대로 두세요(자동 저장 안 함).`);
   for(const m of edMap)if(m.title_key===t&&m.author_key&&m.author_key!==a)it.conflicts.push(`판본 묶기 기록이 이 제목을 다른 저자(${m.work_author||m.author_key})의 작품으로 연결하고 있어요.`);
  }
  it.ex=ex||null;
  it.status=it.conflicts.length?'conflict':!ex?'new':(ex.source==='reviewed'&&ex.summary===it.summary&&(ex.genre||'')===it.genre&&(ex.original_title||'')===it.originalTitle)?'same':'change';
 }
 for(const k of [...selected])if(!canSave(items.find(x=>x.key===k)))selected.delete(k);
}
const canSave=it=>!!it&&it.review==='approved'&&(it.status==='new'||it.status==='change');

// ---------- 저장 ----------
function payload(it){return {key:it.key,title:it.work.title,author:it.work.author,summary:it.summary,genre:it.genre,originalTitle:it.originalTitle,expectRev:it.ex?Number(it.ex.rev)||0:null}}
async function save(list){
 if(!list.length||run?.running)return;
 run={total:list.length,done:0,ok:0,fail:0,stopped:'',running:true};render();
 for(let i=0;i<list.length;i+=BATCH){
  const chunk=list.slice(i,i+BATCH);
  if(run.stopped){for(const it of chunk){failures.set(it.key,{kind:'skipped',msg:'앞의 권한 오류로 보내지 않았어요.'});run.fail++;run.done++}continue}
  try{
   const res=await sb('/rest/v1/rpc/admin_upsert_reviewed',{method:'POST',body:{items:chunk.map(payload)}});
   const by=new Map((Array.isArray(res)?res:[]).map(r=>[r.key,r]));
   for(const it of chunk){
    const r=by.get(it.key);run.done++;
    if(r&&(r.status==='inserted'||r.status==='updated'||r.status==='same')){
     run.ok++;failures.delete(it.key);selected.delete(it.key);
     if(r.status!=='same')existing.set(it.key,{key:it.key,title:it.work.title,author:it.work.author,summary:it.summary,source:'reviewed',rev:(it.ex?Number(it.ex.rev)||0:0)+1,genre:it.genre,original_title:it.originalTitle});
    }else{
     run.fail++;
     const e=r?.error||'결과 없음';
     failures.set(it.key,e==='stale'?{kind:'stale',msg:'미리보기 뒤에 다른 곳에서 바뀌었어요. "기존 기록 다시 불러오기" 뒤 확인하세요.'}:{kind:'server',msg:'저장 실패: '+e});
    }
   }
  }catch(err){
   for(const it of chunk){failures.set(it.key,{kind:err.kind||'server',msg:(err.kind==='network'?'네트워크 오류: ':err.kind==='auth'?'권한 오류: ':'저장 실패: ')+err.message});run.fail++;run.done++}
   if(err.kind==='auth')run.stopped=err.message;   // 권한 문제는 남은 묶음도 같으므로 멈춥니다(성공한 항목은 그대로).
  }
  classify();render();
  if(i+BATCH<list.length)await sleep(300);
 }
 run.running=false;render();
}
const retryList=()=>items.filter(it=>{const f=failures.get(it.key);return f&&(f.kind==='network'||f.kind==='server'||f.kind==='skipped')&&canSave(it)});

// ---------- 되돌리기(이력) ----------
async function findHistory(q){
 hist={q,rows:null,err:''};render();
 try{
  const key=q.includes('|')?q:'';
  const filterQ=key?'key=eq.'+encodeURIComponent(key):'key=like.'+encodeURIComponent('*'+q.replace(/\s+/g,'')+'*');
  hist.rows=await sb(`/rest/v1/work_cache_history?select=id,key,action,old_row,new_summary,new_rev,changed_at&${filterQ}&order=id.desc&limit=30`);
 }catch(err){hist.err=err.message}
 render();
}
async function restore(id){
 const h=(hist.rows||[]).find(x=>x.id===id);if(!h)return;
 if(!confirm(`「${h.key}」의 이 변경(${h.action}, ${new Date(h.changed_at).toLocaleString('ko-KR')})을 되돌릴까요? 되돌린 것도 이력에 남아요.`))return;
 try{await sb('/rest/v1/rpc/admin_restore_reviewed',{method:'POST',body:{history_id:id}});alert('되돌렸어요. 각 서재에는 다음 동기화 때 반영돼요.');await loadExisting();classify();await findHistory(hist.q)}
 catch(err){alert('되돌리지 못했어요: '+err.message)}
}

// ---------- 화면 ----------
function counts(){const c={all:items.length,new:0,change:0,same:0,conflict:0,error:0,draft:0,saveable:0};for(const it of items){c[it.status]++;if(it.review==='draft')c.draft++;if(canSave(it))c.saveable++}return c}
function visible(){return items.filter(it=>filter==='all'||(filter==='draft'?it.review==='draft':filter==='failed'?failures.has(it.key):it.status===filter))}
function itemHTML(it){
 const f=failures.get(it.key),ok=canSave(it),isOpen=open.has(it.i);
 const reasons=[...(it.errs||[]),...(it.conflicts||[])];
 return `<li class="item"><div class="head"><input type="checkbox" data-sel="${it.i}" aria-label="${esc(it.title)} 저장 선택" ${selected.has(it.key)?'checked':''} ${ok&&!run?.running?'':'disabled'}>
 <div class="name">${esc(it.title||'(제목 없음)')} · ${esc(it.author||'')}<small>${esc(it.key||'원작 키 없음')}${it.work&&(it.work.title!==it.title)?` · 원작 제목: ${esc(it.work.title)}`:''} · ${it.summary.length}자</small></div>
 <div class="side"><span class="badge ${it.status}">${STATUS[it.status]}</span>${it.review==='draft'?'<span class="badge draft">초안 · 저장 불가</span>':''}${f?`<span class="badge fail">${esc(f.kind==='stale'?'다시 확인 필요':'실패')}</span>`:''}${it.status!=='error'?`<button type="button" class="link" data-open="${it.i}">${isOpen?'접기':'미리보기'}</button>`:''}</div></div>
 ${reasons.length||f?`<div class="reasons">${reasons.map(esc).join('<br>')}${f?`${reasons.length?'<br>':''}${esc(f.msg)}`:''}</div>`:''}
 ${isOpen?`<div class="preview"><div><h3>지금 DB ${it.ex?`(${it.ex.source==='reviewed'?'검수 소개 · '+esc(it.ex.rev)+'번':'AI 소개'})`:'— 없음(신규)'}</h3>${it.ex?esc(it.ex.summary):''}</div><div><h3>JSON 소개 · ${it.summary.length}자${it.genre?' · '+esc(it.genre):''}</h3>${esc(it.summary)}</div></div>`:''}</li>`;
}
function render(){
 const root=$('#admin');if(!root)return;
 const c=counts(),list=visible();
 const who=!session?`<p class="who bad">로그인이 필요해요. <a class="link" href="./">서재</a>의 설정에서 이메일로 로그인한 뒤 이 페이지를 새로고침하세요.</p>`
  :`<p class="who"><strong>${esc(session.user.email||session.user.id)}</strong> · ${isAdmin===null?'관리자 확인 중…':isAdmin?'관리자 확인됨(서버)':`<span class="bad">관리자 권한이 없어요${adminError?' — '+esc(adminError):''}. 저장할 수 없어요.</span>`}</p>`;
 root.innerHTML=`<p class="eyebrow">MY LIBRARY / ADMIN</p><h1>작품 소개 관리</h1>${who}
 <section><h2>1. 검수 JSON 불러오기</h2><div class="row"><input type="file" id="jsonfile" accept="application/json,.json" ${session&&isAdmin?'':'disabled'}><button type="button" class="btn" data-act="reload" ${session&&isAdmin?'':'disabled'}>기존 기록 다시 불러오기</button></div>
 <p class="muted">reviewStatus가 "approved"인 작품만 저장할 수 있고, "draft"는 미리보기만 돼요. 소개문은 고치거나 자르지 않고 그대로 저장해요(${MIN_LEN}~${MAX_LEN}자, 공백·줄바꿈 포함).</p>
 ${fileName?`<p class="who">파일: <strong>${esc(fileName)}</strong> · 기존 기록 ${existing.size}개와 비교</p>`:''}${fileError?`<p class="reasons" style="margin-left:0">${esc(fileError)}</p>`:''}
 ${items.length?`<div class="chips" role="group" aria-label="분류">${[['all','전체'],['new','신규'],['change','변경'],['same','동일'],['conflict','충돌'],['error','오류'],['draft','초안'],['failed','실패']].map(([k,l])=>`<button type="button" class="chip" data-filter="${k}" aria-pressed="${filter===k}">${l}<b>${k==='failed'?failures.size:c[k]}</b></button>`).join('')}</div>`:''}</section>
 ${items.length?`<section><h2>2. 확인하고 선택하기</h2><div class="row"><button type="button" class="btn" data-act="select-all" ${c.saveable&&!run?.running?'':'disabled'}>저장 가능한 ${c.saveable}건 모두 선택</button><button type="button" class="btn" data-act="select-none" ${selected.size?'':'disabled'}>선택 해제</button><span class="muted">선택 ${selected.size}건</span></div>
 <ul class="items">${list.slice(0,shown).map(itemHTML).join('')}</ul>${list.length>shown?`<p><button type="button" class="btn" data-act="more">${list.length-shown}건 더 보기</button></p>`:''}${!list.length?'<p class="muted">이 분류에 해당하는 항목이 없어요.</p>':''}</section>
 <section><h2>3. 저장</h2><div class="row"><button type="button" class="btn primary" data-act="save" ${selected.size&&isAdmin&&!run?.running?'':'disabled'}>선택한 ${selected.size}건 저장</button>${retryList().length&&!run?.running?`<button type="button" class="btn" data-act="retry">실패한 ${retryList().length}건 다시 시도</button>`:''}</div>
 ${run?`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${run.done}"><span style="width:${run.total?Math.round(run.done/run.total*100):0}%"></span></div><p class="muted">${run.running?'저장하는 중':'끝'} · ${run.done} / ${run.total} · 성공 ${run.ok} · 실패 ${run.fail}${run.stopped?` · 멈춤: ${esc(run.stopped)}`:''}. ${BATCH}건씩 차례로 보내고, 성공한 항목은 실패와 관계없이 저장돼 있어요.</p>`:''}</section>`:''}
 ${session&&isAdmin?`<section><h2>되돌리기</h2><p class="muted">잘못 반영한 소개는 작품 이력에서 그 변경을 골라 되돌려요. 되돌린 것도 이력에 남고, 각 서재에는 다음 동기화 때 반영돼요.</p><form class="row" id="histform"><input type="text" id="histq" placeholder="제목 또는 작품 키(예: 죄와벌|도스토예프스키)" value="${esc(hist.q)}"><button class="btn">이력 찾기</button></form>
 ${hist.err?`<p class="reasons" style="margin-left:0">${esc(hist.err)}</p>`:''}${hist.rows?(hist.rows.length?`<ul class="hist">${hist.rows.map(h=>`<li><strong>${esc(h.key)}</strong> · ${esc(h.action)} → ${esc(h.new_rev)}번 · ${esc(new Date(h.changed_at).toLocaleString('ko-KR'))} <button type="button" class="link" data-restore="${h.id}">이 변경 되돌리기</button><pre>바꾸기 전: ${esc(h.old_row?.summary??'(없음 — 새로 만든 소개)')}</pre></li>`).join('')}</ul>`:'<p class="muted">이력이 없어요.</p>'):''}</section>`:''}`;
}

document.addEventListener('click',e=>{
 const t=e.target.closest('[data-act],[data-filter],[data-open],[data-restore]');if(!t)return;
 if(t.dataset.filter){filter=t.dataset.filter;shown=SHOW_STEP;render();return}
 if(t.dataset.open){const i=Number(t.dataset.open);open.has(i)?open.delete(i):open.add(i);render();return}
 if(t.dataset.restore){restore(Number(t.dataset.restore));return}
 const a=t.dataset.act;
 if(a==='more'){shown+=SHOW_STEP;render()}
 else if(a==='select-all'){for(const it of items)if(canSave(it))selected.add(it.key);render()}
 else if(a==='select-none'){selected.clear();render()}
 else if(a==='save'){const list=items.filter(it=>selected.has(it.key)&&canSave(it));if(list.length&&confirm(`선택한 ${list.length}건을 저장할까요?\n신규 ${list.filter(x=>x.status==='new').length}건 · 변경 ${list.filter(x=>x.status==='change').length}건. 바꾸기 전 소개는 이력에 남아요.`))save(list)}
 else if(a==='retry'){save(retryList())}
 else if(a==='reload'){(async()=>{try{await loadExisting();classify()}catch(err){fileError='기존 기록을 불러오지 못했어요: '+err.message}render()})()}
});
document.addEventListener('change',async e=>{
 if(e.target.dataset?.sel!==undefined){const it=items[Number(e.target.dataset.sel)];if(it&&canSave(it)){e.target.checked?selected.add(it.key):selected.delete(it.key)}render();return}
 if(e.target.id==='jsonfile'){
  const f=e.target.files[0];if(!f)return;fileName=f.name;
  const done=()=>{document.body.dataset.loads=String(Number(document.body.dataset.loads||0)+1)};
  if(f.size>30*1024*1024){fileError='파일이 너무 커요(30MB 초과).';items=[];render();done();return}
  try{await loadExisting()}catch(err){fileError='기존 기록을 불러오지 못했어요: '+err.message;items=[];render();done();return}
  checkFile(await f.text());filter='all';render();done(); // 불러오기를 마친 횟수(document.body.dataset.loads, 시험·확인용)
 }
});
document.addEventListener('submit',e=>{if(e.target.id!=='histform')return;e.preventDefault();const q=($('#histq')?.value||'').trim();if(q)findHistory(q)});
window.addEventListener('beforeunload',e=>{if(run?.running){e.preventDefault();e.returnValue=''}});

(async()=>{
 session=readSession();render();
 if(!session)return;
 try{isAdmin=(await sb('/rest/v1/rpc/is_admin',{method:'POST',body:{}}))===true}
 catch(err){isAdmin=false;adminError=err.message}
 render();
})();
