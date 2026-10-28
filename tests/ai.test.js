// v2.14.1 — Gemini 호출 최적화(프롬프트 4.8). 실행: npm test
// 가짜 Gemini가 받은 요청을 종류별·모델별로 세어, 앱이 몇 번 부르는지 확인합니다. 실제 Gemini는 부르지 않습니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, openApp, fixtureBooks, stored, fakeSession } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAST = 'gemini-3.5-flash-lite';
const GKEY = { 'my-library-gemini-key-v1': 'AIza' + 'T'.repeat(35) }; // 합성 값(형식만 맞춤)
const SVG = '<circle cx="20" cy="20" r="8"/><path d="M12 28h16"/>';

const ok = (route, text) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }) });
const fail = (route, status, body = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const DAILY = { error: { message: 'Quota exceeded', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
const MINUTE = { error: { message: 'Quota exceeded', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '30s' }] } };

// 요청 본문으로 작업 종류를 가립니다.
function kindOf(text) {
  if (text.includes('{"items":[')) return 'analysisMany';
  if (/^### 1$/m.test(text)) return 'drawMany';
  if (text.includes('도형 요소만')) return 'draw';
  if (text.includes('{"summary":"..."')) return 'analysis';
  if (text.includes('{"motifIdea":"사물 — 이유"}')) return 'idea';
  return 'other';
}
// over: { 종류: async (route, info, n) => true(직접 응답함) | undefined(기본 응답) }, n은 그 종류의 몇 번째 호출인지(1부터)
function gemini(over = {}, { analysisIdea = '종이학 — 분석이 고른 이유' } = {}) {
  const log = { calls: [], kinds: {}, models: {}, inflight: 0, last: 0 };
  const mock = async (route, u) => {
    if (u.hostname !== 'generativelanguage.googleapis.com') return false;
    const model = decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0]);
    const text = JSON.parse(route.request().postData()).contents[0].parts[0].text;
    const kind = kindOf(text);
    log.kinds[kind] = (log.kinds[kind] || 0) + 1; log.models[model] = (log.models[model] || 0) + 1;
    log.calls.push({ model, kind }); log.inflight++; log.last = Date.now();
    try {
      await sleep(80);
      if (over[kind] && await over[kind](route, { model, text }, log.kinds[kind])) return true;
      if (kind === 'analysis') await ok(route, JSON.stringify({ summary: '합성 소개 첫 문장이다. 합성 소개 둘째 문장이다.', tags: [], motifIdea: analysisIdea }));
      else if (kind === 'analysisMany') { const n = (text.match(/^\[책 \d+\]$/gm) || []).length; await ok(route, JSON.stringify({ items: Array.from({ length: n }, (_, i) => ({ n: i + 1, summary: `묶음 소개 ${i + 1}이다. 둘째 문장이다.`, tags: [], motifIdea: `종이학 — 묶음 ${i + 1}` })) })); }
      else if (kind === 'idea') await ok(route, JSON.stringify({ motifIdea: '종이학 — 추가 화면에서 고른 이유' }));
      else if (kind === 'draw') await ok(route, SVG);
      else if (kind === 'drawMany') { const n = (text.match(/^\[\d+\] 그릴 사물/gm) || []).length; await ok(route, Array.from({ length: n }, (_, i) => `### ${i + 1}\n${SVG}`).join('\n')); }
      else await ok(route, '');
      return true;
    } finally { log.inflight--; log.last = Date.now(); }
  };
  return { log, mock };
}
const total = log => log.calls.length;
// 요청이 끝나고 ms 동안 새 요청이 없을 때까지 기다림
async function quiet(log, ms = 1500, timeout = 15000) {
  const start = Date.now(), end = start + timeout;
  while (Date.now() < end) { if (!log.inflight && Date.now() - Math.max(log.last, start) >= ms) return; await sleep(100); }
  throw new Error('요청이 멈추지 않음');
}
const onlyFast = log => assert.deepEqual(Object.keys(log.models).filter(m => m !== FAST), [], '빠른 모델 외 호출 없음(3.8 Flash 0회)');
async function addBook(p, title, author = '합성 저자') {
  await p.click('.topbuttons [data-action="add"]');
  await p.waitForSelector('#bookform');
  await p.fill('#title', title);
  await p.fill('#author', author);
  await p.click('#bookform button[type="submit"]');
  return (await stored(p)).find(b => b.title === title);
}
const bookBy = async (p, title) => (await stored(p)).find(b => b.title === title);
const undrawn = (extra = {}) => ({ id: 'ai-undrawn', title: '합성 미완성 상징 책', author: '합성 저자', status: 'done', rating: 3, color: '#2f4a3d', colorMode: 'custom', createdAt: '2026-09-01T00:00:00.000Z', aiSummary: '이미 있는 소개다.', aiAt: '2026-09-01T00:00:00.000Z', motifIdea: '종이학 — 그리지 못한 상징', motifDrawnFor: '', motif: 'auto', ...extra });

test('#1·#2·#8 새 책 저장: 소개 1회 + 상징 1회, 모두 Flash-Lite. 다시 열거나 새로고침해도 추가 호출 0', async () => {
  const { log, mock } = gemini();
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
  const p = app.page;
  try {
    await addBook(p, '합성 종이학 책');
    await p.waitForFunction(() => { const b = JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(x => x.title === '합성 종이학 책'); return b && b.motifDrawnFor && b.motifDrawnFor === b.motifIdea; }, null, { timeout: 10000 });
    await quiet(log);
    assert.deepEqual(log.kinds, { analysis: 1, draw: 1 });
    const b = await bookBy(p, '합성 종이학 책');
    assert.equal(b.customMotif, SVG); assert.match(b.aiSummary, /합성 소개/);
    await p.click(`.spine[data-book="${b.id}"]`); await p.keyboard.press('Escape');
    await p.reload(); await p.waitForSelector('.spine[data-book]'); await sleep(3200);
    assert.equal(total(log), 2, '새 책 한 권당 자동 호출 최대 2회');
    onlyFast(log);
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});

test('#4 그림이 없는 기존 책: 앱 열기·책 열기·새로고침으로는 AI 0회, 상세에 상태와 "상징 그리기"', async () => {
  const { log, mock } = gemini();
  const app = await openApp(srv.base, { books: [...fixtureBooks(), undrawn()], seed: GKEY, mock });
  const p = app.page;
  try {
    await sleep(3200); // 앱 시작 2.5초 뒤의 '남은 상징 이어 그리기' 시점을 지남
    await p.click('.spine[data-book="ai-undrawn"]');
    await sleep(1500);
    assert.match(await p.textContent('.motifstatus'), /아직 그리지 않았어요/);
    assert.ok(await p.$('[data-action="retry-motif"]'));
    assert.equal(await p.$('#dialog [data-action="ai-analyze"]'), null, '소개가 있으면 정리 버튼 없음');
    await p.keyboard.press('Escape');
    await p.reload(); await p.waitForSelector('.spine[data-book]'); await sleep(3200);
    await p.click('.spine[data-book="fx-done-rated"]'); await sleep(800);
    assert.equal(await p.$('.motifstatus'), null, '그림이 있는 책에는 다시 그리기 버튼이 없음');
    assert.equal(total(log), 0);
  } finally { await app.browser.close(); }
});

test('#3 추가 화면에서 그린 상징은 저장 뒤 소개 정리가 덮지 않고, 다시 그리지 않음', async () => {
  const { log, mock } = gemini({}, { analysisIdea: '풍차 — 소개 정리가 고른 다른 상징' });
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
  const p = app.page;
  try {
    await p.click('.topbuttons [data-action="add"]');
    await p.waitForSelector('#bookform');
    await p.fill('#title', '합성 손그림 책'); await p.fill('#author', '합성 저자');
    await p.click('#bookform details[data-sec="design"] > summary');
    await p.click('[data-action="ai-motif"]'); // 사용자가 직접 누른 생성(상징 이름 1 + 그림 1)
    await p.waitForFunction(() => document.getElementById('customMotif')?.value, null, { timeout: 8000 });
    await quiet(log, 600);
    assert.deepEqual(log.kinds, { idea: 1, draw: 1 });
    await p.click('#bookform button[type="submit"]');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(x => x.title === '합성 손그림 책')?.aiSummary, null, { timeout: 8000 });
    await quiet(log);
    const b = await bookBy(p, '합성 손그림 책');
    assert.equal(b.motifIdea, '종이학 — 추가 화면에서 고른 이유', '내가 고른 상징 이름 유지');
    assert.equal(b.motifDrawnFor, b.motifIdea); assert.equal(b.customMotif, SVG);
    assert.deepEqual(log.kinds, { idea: 1, draw: 1, analysis: 1 }, '저장 뒤 자동 호출은 소개 1회뿐');
    onlyFast(log);
  } finally { await app.browser.close(); }
});

const FAILS = [
  ['서버 오류 500', (r) => fail(r, 500, { error: { message: '가짜 서버 오류' } }), /AI 서버 오류/],
  ['하루 한도 429', (r) => fail(r, 429, DAILY), /오늘 무료 사용량을 다 써서/],
  ['분당 한도 429', (r) => fail(r, 429, MINUTE), /요청이 잠깐 몰림/],
  ['네트워크 끊김', (r) => r.abort('internetdisconnected').then(() => true), /네트워크 오류/],
  ['잘못된 SVG', (r) => ok(r, '그림 대신 설명 글만 있음').then(() => true), /응답 형식 오류/],
];
for (const [name, respond, label] of FAILS) {
  test(`#5 상징 실패(${name}): 자동 반복 0회, 소개·데이터 유지, 상태 표시`, async () => {
    const { log, mock } = gemini({ draw: async r => { await respond(r); return true; } });
    const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
    const p = app.page;
    try {
      await addBook(p, '합성 실패 책');
      await quiet(log, 2500);
      assert.deepEqual(log.kinds, { analysis: 1, draw: 1 }, '실패해도 다시 보내지 않음');
      const b = await bookBy(p, '합성 실패 책');
      assert.match(b.aiSummary, /합성 소개/, '소개는 저장됨'); assert.equal(b.customMotif, ''); assert.equal(b.motifDrawnFor, '');
      await p.click(`.spine[data-book="${b.id}"]`);
      assert.match(await p.textContent('.motifstatus'), label);
      await sleep(2000);
      assert.equal(total(log), 2, '상세를 열어도 다시 보내지 않음');
      await p.keyboard.press('Escape');
      await p.reload(); await p.waitForSelector('.spine[data-book]'); await sleep(3200);
      assert.equal(total(log), 2, '새로고침해도 다시 보내지 않음');
      onlyFast(log);
      assert.ok(!(await p.evaluate(() => document.body.innerText)).includes('AIza'), '키가 화면에 보이지 않음');
    } finally { await app.browser.close(); }
  });
}

test('#5 소개 실패(500): 1회로 끝나고 상징도 부르지 않음, 책은 저장됨', async () => {
  const { log, mock } = gemini({ analysis: async r => { await fail(r, 500, { error: { message: '가짜' } }); return true; } });
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
  const p = app.page;
  try {
    await addBook(p, '합성 소개 실패 책');
    await quiet(log, 2500);
    assert.deepEqual(log.kinds, { analysis: 1 });
    assert.ok(await bookBy(p, '합성 소개 실패 책'));
    await p.waitForFunction(() => /책은 저장됐어요/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 5000 });
  } finally { await app.browser.close(); }
});

test('#5 문체가 어긋난 소개도 한 번으로 끝냄(다시 요청 0회)', async () => {
  const { log, mock } = gemini({ analysis: async r => { await ok(r, JSON.stringify({ summary: '이 책은 무엇을 말할까요? 합성 소개입니다', tags: [], motifIdea: '종이학 — 이유' })); return true; } });
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
  const p = app.page;
  try {
    await addBook(p, '합성 문체 책');
    await quiet(log, 2000);
    assert.equal(log.kinds.analysis, 1);
    assert.ok((await bookBy(p, '합성 문체 책')).aiSummary, '결과는 저장');
  } finally { await app.browser.close(); }
});

test('#5 일괄 작업 부분 실패: 소개 묶음·상징 묶음 모두 한 권씩 다시 보내지 않음', async () => {
  const { log, mock } = gemini({
    analysisMany: async r => { await ok(r, JSON.stringify({ items: [{ n: 1, summary: '첫 책 소개다. 둘째 문장이다.', tags: [], motifIdea: '종이학 — 하나' }] })); return true; },
    drawMany: async r => { await ok(r, `### 1\n${SVG}`); return true; },
  });
  const two = [undrawn({ id: 'b1', title: '합성 묶음 하나', aiSummary: '' , motifIdea: '' }), undrawn({ id: 'b2', title: '합성 묶음 둘', aiSummary: '', motifIdea: '' })];
  const app = await openApp(srv.base, { books: [...fixtureBooks().filter(b => b.status !== 'done' || b.aiSummary), ...two], seed: GKEY, mock });
  const p = app.page;
  try {
    await p.click('.app [data-view="settings"]');
    await p.click('[data-action="analyze-all"]');
    await quiet(log, 2500, 30000);
    assert.equal(log.kinds.analysisMany, 1); assert.equal(log.kinds.analysis, undefined, '빠진 책을 한 권씩 다시 보내지 않음');
    const before = total(log);
    // 상징 묶음: 소개가 생긴 b1과, 상징 이름이 있는 다른 책
    await p.evaluate(() => { const k = 'mnemosyne-library-v1', v = JSON.parse(localStorage.getItem(k)); v.find(x => x.id === 'b2').motifIdea = '풍차 — 둘'; localStorage.setItem(k, JSON.stringify(v)); });
    await p.reload(); await p.waitForSelector('.spine[data-book]'); await p.click('.app [data-view="settings"]');
    await p.click('[data-action="draw-all"]');
    await quiet(log, 2500, 20000);
    assert.equal(total(log) - before, 1, '상징 묶음 1회, 빠진 책을 따로 다시 보내지 않음');
    assert.equal(log.kinds.draw, undefined);
    const list = await stored(p);
    assert.equal(list.filter(b => ['b1', 'b2'].includes(b.id) && b.customMotif).length, 1);
    onlyFast(log);
  } finally { await app.browser.close(); }
});

test('#6 "상징 다시 시도"는 그 책만 1회 호출, 다른 책은 그대로', async () => {
  const { log, mock } = gemini({ draw: async (r, info, n) => { if (n === 1) { await fail(r, 500, { error: { message: '가짜' } }); return true; } } });
  const other = undrawn({ id: 'ai-other', title: '합성 다른 미완성 책', motifIdea: '풍차 — 다른 책' });
  const app = await openApp(srv.base, { books: [...fixtureBooks(), other], seed: GKEY, mock });
  const p = app.page;
  try {
    await addBook(p, '합성 재시도 책');
    await quiet(log, 2000);
    assert.deepEqual(log.kinds, { analysis: 1, draw: 1 });
    const b = await bookBy(p, '합성 재시도 책');
    await p.click(`.spine[data-book="${b.id}"]`);
    assert.match(await p.textContent('[data-action="retry-motif"]'), /상징 다시 시도/);
    await p.click('[data-action="retry-motif"]');
    await quiet(log, 1500);
    assert.deepEqual(log.kinds, { analysis: 1, draw: 2 });
    const after = await bookBy(p, '합성 재시도 책');
    assert.equal(after.customMotif, SVG); assert.equal(after.motifDrawnFor, after.motifIdea);
    assert.equal(await p.$('.motifstatus'), null, '그린 뒤에는 버튼이 사라짐');
    assert.equal((await stored(p)).find(x => x.id === 'ai-other').customMotif, '', '다른 책은 그리지 않음');
  } finally { await app.browser.close(); }
});

function supa(row) {
  const log = { gets: 0, patches: 0 };
  return [log, async (route, u) => {
    if (!u.hostname.endsWith('supabase.co')) return false;
    const m = route.request().method();
    if (u.pathname === '/rest/v1/work_cache' && m === 'GET') { log.gets++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row ? [row] : []) }); return true; }
    if (u.pathname === '/rest/v1/work_cache' && m === 'PATCH') log.patches++;
    await route.fulfill({ status: m === 'GET' ? 200 : 201, contentType: 'application/json', body: m === 'GET' ? '[]' : '' });
    return true;
  }];
}
const ROW = { key: '데미안|헤르만헤세', summary: '공유된 소개 첫 문장이다. 둘째 문장이다.', tags: [], motif_idea: '종이학 — 공유된 상징', custom_motif: '<circle cx="20" cy="20" r="5"/>' };

test('#7 공유 기록이 있으면 Gemini 0회로 소개·그림을 가져옴', async () => {
  const { log, mock: gm } = gemini();
  const [slog, sm] = supa(ROW);
  const mock = async (route, u) => (await gm(route, u)) || (await sm(route, u));
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: { ...GKEY, ...fakeSession() }, mock });
  const p = app.page;
  try {
    await addBook(p, '데미안', '헤르만 헤세');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(x => x.title === '데미안')?.customMotif, null, { timeout: 8000 });
    await sleep(1500);
    const b = await bookBy(p, '데미안');
    assert.equal(b.aiSummary, ROW.summary); assert.equal(b.motifIdea, ROW.motif_idea); assert.equal(b.customMotif, ROW.custom_motif);
    assert.equal(total(log), 0, 'Gemini 호출 없음');
    assert.ok(slog.gets >= 1);
  } finally { await app.browser.close(); }
});

test('#7 공유 기록이 내가 고른 상징 이름·그림을 덮지 않음', async () => {
  const { log, mock: gm } = gemini();
  const [, sm] = supa(ROW);
  const mock = async (route, u) => (await gm(route, u)) || (await sm(route, u));
  const mine = undrawn({ id: 'mine', title: '데미안', author: '헤르만 헤세', aiSummary: '', motifIdea: '풍차 — 내가 고른 상징', motifDrawnFor: '풍차 — 내가 고른 상징', customMotif: '<rect x="10" y="10" width="20" height="20"/>', motif: 'custom' });
  const app = await openApp(srv.base, { books: [mine], seed: { ...GKEY, ...fakeSession() }, mock });
  const p = app.page;
  try {
    await p.click('.spine[data-book="mine"]');
    await p.click('#dialog [data-action="ai-analyze"]');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(x => x.id === 'mine').aiSummary, null, { timeout: 8000 });
    const b = (await stored(p)).find(x => x.id === 'mine');
    assert.equal(b.aiSummary, ROW.summary, '소개는 공유 기록에서');
    assert.equal(b.motifIdea, mine.motifIdea, '내 상징 이름 유지');
    assert.equal(b.customMotif, mine.customMotif, '내 그림 유지');
    assert.equal(total(log), 0);
  } finally { await app.browser.close(); }
});

test('4.7 상징 비교 시험: 확인 후 10회, 화면에만 표시하고 저장하지 않음', async () => {
  const { log, mock } = gemini();
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
  const p = app.page;
  try {
    const before = await p.evaluate(() => localStorage.getItem('mnemosyne-library-v1'));
    await p.click('.app [data-view="settings"]');
    let asked = '';
    p.removeAllListeners('dialog'); p.on('dialog', d => { asked = d.message(); d.accept(); });
    await p.click('[data-action="motif-compare"]');
    assert.match(asked, /약 10번 호출/);
    await p.waitForFunction(() => /성공 10 \/ 10/.test(document.querySelector('.comparebox')?.textContent || ''), null, { timeout: 20000 });
    assert.equal(log.kinds.draw, 10); onlyFast(log);
    assert.equal(await p.$$eval('.comparespine svg', e => e.length), 10);
    assert.equal(await p.$$eval('.comparebig svg', e => e.length), 10);
    assert.match(await p.textContent('.comparebox'), /규칙 통과/);
    assert.equal(await p.evaluate(() => localStorage.getItem('mnemosyne-library-v1')), before, '서재 데이터 변화 없음');
  } finally { await app.browser.close(); }
});

test('4.7 비교 시험 중 하루 한도에 걸리면 멈추고 다시 보내지 않음', async () => {
  const { log, mock } = gemini({ draw: async (r, i, n) => { if (n === 3) { await fail(r, 429, DAILY); return true; } } });
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: GKEY, mock });
  const p = app.page;
  try {
    await p.click('.app [data-view="settings"]');
    await p.click('[data-action="motif-compare"]');
    await p.waitForFunction(() => /멈춤/.test(document.querySelector('.comparebox')?.textContent || ''), null, { timeout: 15000 });
    await quiet(log, 1500);
    assert.equal(log.kinds.draw, 3);
    assert.match(await p.textContent('.comparebox'), /성공 2 \/ 10/);
    // 한도 기록이 남아 다시 눌러도 보내지 않음
    await p.click('[data-action="motif-compare"]');
    await sleep(800);
    assert.equal(log.kinds.draw, 3);
  } finally { await app.browser.close(); }
});
