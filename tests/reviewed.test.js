// v2.15.0 — 검수 소개(관리자 JSON) 서재 연동. 실행: npm test
// 가짜 Supabase가 work_cache 행을 메모리에 들고 있어 조회·동기화를 흉내 냅니다. Gemini는 호출 횟수만 셉니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, openApp, fixtureBooks, stored, fakeSession } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GKEY = { 'my-library-gemini-key-v1': 'AIza' + 'T'.repeat(35) };
// 줄바꿈이 있는 600자 남짓의 합성 검수 소개(공백 두 칸·특수문자 포함)
const REVIEWED = '한 줄 후킹 문장이다?\n\n' + '합성 작품 내용 문장이다. '.repeat(30) + '\n\n가치  문장 — “인용” 포함.';
const KEY = '합성작품|김합성';

function supabase(rows = []) {
  const st = { rows: new Map(rows.map(r => [r.key, { source: 'ai', rev: 0, ai_summary: '', tags: [], motif_idea: '', custom_motif: '', reviewed_at: null, ...r }])), calls: [], anon: 0 };
  const mock = async (route, u) => {
    if (!u.hostname.endsWith('supabase.co')) return false;
    const req = route.request(), m = req.method(), q = decodeURIComponent(u.search), auth = !!req.headers()['authorization'];
    st.calls.push(m + ' ' + u.pathname + q); if (!auth) st.anon++;
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/rest/v1/work_cache' && m === 'GET') {
      let list = [...st.rows.values()];
      if (!auth || /source=eq\.reviewed/.test(q)) list = list.filter(r => r.source === 'reviewed');
      const inm = q.match(/key=in\.\(([^)]*)\)/);
      if (inm) { const ks = inm[1].split(',').map(k => k.replace(/^"|"$/g, '')); list = list.filter(r => ks.includes(r.key)); }
      if (/reviewed_at=not\.is\.null/.test(q)) list = list.filter(r => r.reviewed_at);
      const gt = q.match(/reviewed_at=gt\.([^&]+)/); if (gt) list = list.filter(r => r.reviewed_at && Date.parse(r.reviewed_at) > Date.parse(gt[1]));
      return json(list), true;
    }
    if (u.pathname === '/rest/v1/books' && m === 'GET') return json([]), true;
    await route.fulfill({ status: m === 'GET' ? 200 : 201, contentType: 'application/json', body: m === 'GET' ? '[]' : '' });
    return true;
  };
  return { st, mock };
}
function gemini(delay = 80) {
  const log = { n: 0 };
  const mock = async (route, u) => {
    if (u.hostname !== 'generativelanguage.googleapis.com') return false;
    log.n++; await sleep(delay);
    const t = JSON.parse(route.request().postData()).contents[0].parts[0].text;
    const text = t.includes('"summary":"..."') ? JSON.stringify({ summary: 'Gemini가 만든 소개다. 둘째 문장이다.', tags: [], motifIdea: '' }) : '<circle cx="20" cy="20" r="8"/>';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }) });
    return true;
  };
  return { log, mock };
}
const both = (...ms) => async (route, u) => { for (const m of ms) if (await m(route, u)) return true; return false; };
async function addBook(p, title = '합성 작품', author = '김합성') {
  await p.click('.topbuttons [data-action="add"]');
  await p.waitForSelector('#bookform');
  await p.fill('#title', title); await p.fill('#author', author);
  await p.click('#bookform button[type="submit"]');
}
const book = async (p, title = '합성 작품') => (await stored(p)).find(b => b.title === title);
const waitBook = (p, fn, title = '합성 작품', timeout = 15000) => // 전체 테스트를 함께 돌릴 때(5,000권 시험과 동시) 느려질 수 있어 15초까지 기다림
  p.waitForFunction(([t, f]) => { const b = JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(x => x.title === t); return b && new Function('b', 'return ' + f)(b); }, [title, fn], { timeout });
const NOW = () => new Date().toISOString();

test('우선순위 ①: 검수 소개가 있으면 Gemini 0회, 글자·줄바꿈 그대로, 상세에 "검수된 소개"', async () => {
  const sb = supabase([{ key: KEY, summary: REVIEWED, source: 'reviewed', rev: 1, reviewed_at: NOW() }]);
  const g = gemini();
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: { ...GKEY, ...fakeSession() }, mock: both(g.mock, sb.mock) });
  const p = app.page;
  try {
    await addBook(p);
    await waitBook(p, "b.aiSrc==='reviewed'");
    const b = await book(p);
    assert.equal(b.aiSummary, REVIEWED, '받은 글 그대로(줄바꿈·공백 두 칸 포함)');
    assert.equal(b.aiRev, 1);
    await sleep(800);
    assert.equal(g.log.n, 0, 'Gemini 호출 없음');
    await p.click(`.spine[data-book="${b.id}"]`);
    assert.equal(await p.textContent('.aisummary'), REVIEWED);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.aisummary')).whiteSpace), 'pre-wrap');
    assert.match(await p.textContent('.aisrc'), /검수된 소개/);
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});

test('우선순위 ①(로그아웃): 검수 소개만 읽어 Gemini 0회로 붙임', async () => {
  const sb = supabase([{ key: KEY, summary: REVIEWED, source: 'reviewed', rev: 1, reviewed_at: NOW() }]);
  const g = gemini();
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock: both(g.mock, sb.mock) });
  const p = app.page;
  try {
    await addBook(p);
    await waitBook(p, "b.aiSrc==='reviewed'");
    await sleep(500);
    assert.equal(g.log.n, 0);
    assert.ok(sb.st.calls.some(c => /work_cache.*source=eq\.reviewed/.test(c)), '로그아웃 조회는 검수 소개만 요청');
    assert.ok(sb.st.anon > 0);
  } finally { await app.browser.close(); }
});

test('우선순위 ②·③: 공유 AI 소개가 있으면 재사용(0회), 아무것도 없으면 Gemini 1회', async () => {
  const sb = supabase([{ key: KEY, summary: '공유된 AI 소개다.', source: 'ai', tags: ['소설'] }]);
  const g = gemini();
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: { ...GKEY, ...fakeSession() }, mock: both(g.mock, sb.mock) });
  const p = app.page;
  try {
    await addBook(p);
    await waitBook(p, "b.aiSrc==='shared'");
    assert.equal((await book(p)).aiSummary, '공유된 AI 소개다.');
    await addBook(p, '합성 새 작품', '이다른');
    await waitBook(p, "b.aiSrc==='ai'", '합성 새 작품');
    assert.equal(g.log.n, 1, '공유 기록이 없는 작품만 Gemini 1회(소개)');
  } finally { await app.browser.close(); }
});

test('늦게 온 Gemini 응답은 그사이 들어온 검수 소개를 덮지 않음', async () => {
  const sb = supabase([]);
  const g = gemini(2500);
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: { ...GKEY, ...fakeSession() }, mock: both(g.mock, sb.mock) });
  const p = app.page;
  try {
    await addBook(p);
    await p.waitForFunction(() => true); await sleep(700); // Gemini 요청이 나간 뒤
    assert.equal(g.log.n, 1);
    sb.st.rows.set(KEY, { key: KEY, summary: REVIEWED, source: 'reviewed', rev: 1, ai_summary: '', tags: [], motif_idea: '', custom_motif: '', reviewed_at: NOW() });
    await p.click('.app [data-view="settings"]');
    await p.click('[data-action="sync-now"]');
    await waitBook(p, "b.aiSrc==='reviewed'");
    await sleep(2500); // Gemini 응답 도착
    const b = await book(p);
    assert.equal(b.aiSummary, REVIEWED, 'Gemini 결과로 덮이지 않음');
    assert.equal(b.aiSrc, 'reviewed');
  } finally { await app.browser.close(); }
});

const mine = extra => ({ id: 'rv-1', title: '합성 작품', author: '김합성', status: 'done', rating: 4, notes: '내 감상', color: '#2f4a3d', colorMode: 'custom', spineType: 'C', lifeBook: true, publisher: '내 판본 출판사', isbn: '9790000000097', translator: '내 번역자', createdAt: '2026-05-01T00:00:00.000Z', aiTags: ['소설'], tags: ['내 태그'], motifIdea: '종이학 — 내 상징', motifDrawnFor: '종이학 — 내 상징', customMotif: '<circle cx="20" cy="20" r="6"/>', motif: 'auto', quotes: [{ id: 'q1', text: '내 문장', page: '3', createdAt: '2026-05-02T00:00:00.000Z' }], ...extra });

test('동기화 반영: 공유 AI 소개와 같은 예전 기록은 자동으로 검수 소개로, 개인 기록·판본·책등·상징·태그는 그대로', async () => {
  const sb = supabase([{ key: KEY, summary: REVIEWED, source: 'reviewed', rev: 2, ai_summary: '예전 공유 AI 소개다.', reviewed_at: NOW() }]);
  const app = await openApp(srv.base, { books: [mine({ aiSummary: '예전 공유 AI 소개다.' })], seed: fakeSession(), mock: sb.mock });
  const p = app.page;
  try {
    const before = (await stored(p))[0];
    await waitBook(p, "b.aiSrc==='reviewed'");
    const after = (await stored(p))[0];
    assert.equal(after.aiSummary, REVIEWED); assert.equal(after.aiRev, 2);
    for (const k of Object.keys(before)) if (!['aiSummary', 'aiSrc', 'aiRev'].includes(k)) assert.deepEqual(after[k], before[k], k);
  } finally { await app.browser.close(); }
});

test('보호: 내가 고친 소개·출처 모를 다른 소개는 그대로, 상세에서 직접 바꿀 수 있음', async () => {
  const sb = supabase([{ key: KEY, summary: REVIEWED, source: 'reviewed', rev: 1, ai_summary: '공유 AI 소개다.', reviewed_at: NOW() },
                       { key: '합성둘|김합성', summary: REVIEWED + '둘', source: 'reviewed', rev: 1, ai_summary: '공유 AI 소개다.', reviewed_at: NOW() }]);
  const books = [mine({ aiSummary: '내가 고친 소개', aiSrc: 'user' }), mine({ id: 'rv-2', title: '합성둘', aiSummary: '출처를 모르는 다른 소개', aiSrc: '' })];
  const app = await openApp(srv.base, { books, seed: fakeSession(), mock: sb.mock });
  const p = app.page;
  try {
    await sleep(2500);
    let list = await stored(p);
    assert.equal(list[0].aiSummary, '내가 고친 소개'); assert.equal(list[1].aiSummary, '출처를 모르는 다른 소개');
    await p.click('.spine[data-book="rv-2"]');
    await p.waitForSelector('[data-action="use-reviewed"]');
    await p.click('[data-action="use-reviewed"]'); // confirm은 helpers가 승인
    list = await stored(p);
    assert.equal(list[1].aiSummary, REVIEWED + '둘'); assert.equal(list[1].aiSrc, 'reviewed');
    assert.equal(list[0].aiSummary, '내가 고친 소개', '다른 책은 그대로');
    await p.keyboard.press('Escape');
    await p.click('.spine[data-book="rv-1"]');
    await p.waitForSelector('[data-action="use-reviewed"]');
    assert.match(await p.textContent('.aisrc'), /직접 고친 소개/);
  } finally { await app.browser.close(); }
});

test('정보 수정: 소개를 고치면 "내 소개", 다른 칸만 고치면 출처와 최신 소개 유지', async () => {
  const app = await openApp(srv.base, { books: [mine({ aiSummary: REVIEWED, aiSrc: 'reviewed', aiRev: 3 })] });
  const p = app.page;
  try {
    await p.click('.spine[data-book="rv-1"]'); await p.click('#dialog [data-action="edit"]'); await p.waitForSelector('#bookform');
    assert.equal(await p.inputValue('#aiSummary'), REVIEWED, '수정 칸에 줄바꿈 그대로');
    await p.fill('#author', '김합성 2');
    await p.click('#bookform button[type="submit"]');
    let b = (await stored(p))[0];
    assert.equal(b.aiSummary, REVIEWED); assert.equal(b.aiSrc, 'reviewed'); assert.equal(b.aiRev, 3);
    await p.click('.spine[data-book="rv-1"]'); await p.click('#dialog [data-action="edit"]'); await p.waitForSelector('#bookform');
    await p.click('#bookform details[data-sec="intro"] > summary');
    await p.fill('#aiSummary', '내가 다시 쓴 소개\n둘째 줄');
    await p.click('#bookform button[type="submit"]');
    b = (await stored(p))[0];
    assert.equal(b.aiSummary, '내가 다시 쓴 소개\n둘째 줄'); assert.equal(b.aiSrc, 'user');
  } finally { await app.browser.close(); }
});

test('검수 해제(관리자 되돌리기)를 따라가고, 이미 받은 번호는 다시 받지 않음', async () => {
  const at1 = new Date(Date.now() - 60000).toISOString();
  const sb = supabase([{ key: KEY, summary: '공유 AI 소개다.', source: 'ai', rev: 4, reviewed_at: at1 }]);
  const app = await openApp(srv.base, { books: [mine({ aiSummary: REVIEWED, aiSrc: 'reviewed', aiRev: 3 })], seed: fakeSession(), mock: sb.mock });
  const p = app.page;
  try {
    await waitBook(p, "b.aiSrc==='shared'");
    assert.equal((await stored(p))[0].aiSummary, '공유 AI 소개다.');
    const meta = await p.evaluate(() => JSON.parse(localStorage.getItem('my-library-sync-v1')));
    assert.equal(meta.reviewPull, at1, '받은 시각 기록');
    sb.st.calls.length = 0;
    await p.click('.app [data-view="settings"]'); await p.click('[data-action="sync-now"]'); await sleep(1500);
    assert.ok(sb.st.calls.some(c => c.includes('reviewed_at=gt.')), '다음에는 그 뒤에 바뀐 것만 요청');
  } finally { await app.browser.close(); }
});

test('백업 왕복: 출처·번호·줄바꿈 있는 700자 소개 보존', async () => {
  const long = '가'.repeat(340) + '\n\n' + '나'.repeat(358);
  assert.equal(long.length, 700);
  const app = await openApp(srv.base, { books: [mine({ aiSummary: long, aiSrc: 'reviewed', aiRev: 5 })] });
  const p = app.page;
  try {
    const b = (await stored(p))[0];
    assert.equal(b.aiSummary, long); assert.equal(b.aiSrc, 'reviewed'); assert.equal(b.aiRev, 5);
    await p.click('.app [data-view="settings"]');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.analysis [data-action="export"]')]);
    const f = require('path').join(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mylib-')), 'b.json');
    await dl.saveAs(f);
    const ex = JSON.parse(require('fs').readFileSync(f, 'utf8')).books[0];
    assert.equal(ex.aiSummary, long); assert.equal(ex.aiSrc, 'reviewed'); assert.equal(ex.aiRev, 5);
  } finally { await app.browser.close(); }
});
