// T4 (U05·U06·U08·U12) — 찾기와 저장 상태. 실행: npm test
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, openApp, fixtureBooks, stored, fakeSession } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());
const sleep = ms => new Promise(r => setTimeout(r, ms));

const shelfIds = p => p.$$eval('.spine[data-book]', els => els.map(e => e.dataset.book));
const listIds = p => p.$$eval('.listrow[data-book]', els => els.map(e => e.dataset.book));
async function bothViews(p) {
  if (await p.$('.booklist')) await p.click('[data-shelf-view="shelf"]');
  const a = await shelfIds(p);
  await p.click('[data-shelf-view="list"]');
  const b = await listIds(p);
  await p.click('[data-shelf-view="shelf"]');
  return [a, b];
}
// 서로 다른 날짜·평점의 합성 완독 책을 더해 정렬 차이가 드러나게 함
const books = () => [...fixtureBooks(), { id: 'fx-extra', title: '나중 합성 책', author: '합성 저자', status: 'done', rating: 2, notes: '합성 감상 둘', color: '#384656', colorMode: 'custom', createdAt: '2026-07-01T00:00:00.000Z' }];

test('U05·U08 책장과 목록이 정렬·검색·태그·필터 조합마다 같은 ID와 순서', async () => {
  const app = await openApp(srv.base, { books: books() });
  const p = app.page;
  try {
    for (const sort of ['new', 'title', 'rating']) {
      await p.selectOption('#sort', sort);
      const [a, b] = await bothViews(p);
      assert.equal(a.length, 5, sort);
      assert.deepEqual(b, a, '정렬 ' + sort);
    }
    await p.selectOption('#sort', 'new');
    const combos = [['notes'], ['life'], ['unrated'], ['notes', 'life'], []];
    for (const c of combos) {
      for (const k of c) await p.click(`[data-filter-toggle="${k}"]`);
      const [a, b] = await bothViews(p);
      assert.deepEqual(b, a, '필터 ' + c.join('+'));
      for (const k of c) await p.click(`[data-filter-toggle="${k}"]`); // 하나씩 해제
    }
    await p.fill('#search', '합성');
    let [a, b] = await bothViews(p);
    assert.deepEqual(b, a); assert.ok(a.length > 0);
    await p.fill('#search', '');
    await p.click('.tagbar [data-tag="테스트태그"]');
    [a, b] = await bothViews(p);
    assert.deepEqual(a, ['fx-done-rated']); assert.deepEqual(b, a);
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});

test('U08 필터 AND 결합·결과 수·하나씩 해제·모두 해제, 0건은 "검색 결과 없음"', async () => {
  const app = await openApp(srv.base, { books: books() });
  const p = app.page;
  try {
    await p.click('[data-filter-toggle="notes"]');
    assert.deepEqual((await shelfIds(p)).sort(), ['fx-done-rated', 'fx-extra']);
    assert.match(await p.textContent('#filterSummary'), /^2권 · 감상 있음/);
    await p.click('[data-filter-toggle="life"]'); // 인생책 AND 감상 있음 → 없음
    assert.deepEqual(await shelfIds(p), []);
    assert.match(await p.textContent('.shelf'), /검색 결과 없음/);
    await p.click('[data-filter-toggle="notes"]'); // 감상 필터만 해제
    assert.deepEqual(await shelfIds(p), ['fx-long-en-life']);
    assert.equal(await p.getAttribute('[data-filter-toggle="life"]', 'aria-pressed'), 'true');
    await p.click('[data-filter-toggle="unrated"]');
    await p.click('[data-shelf-view="list"]');
    assert.match(await p.textContent('.booklist'), /검색 결과 없음/, '목록 보기도 같은 빈 결과');
    await p.click('.booklist [data-action="clear-filters"]');
    assert.equal((await listIds(p)).length, 5);
    assert.equal((await p.textContent('#filterSummary')).trim(), '');
    assert.equal(await p.getAttribute('[data-filter-toggle="life"]', 'aria-pressed'), 'false');
  } finally { await app.browser.close(); }
});

test('U08 검색 범위: 제목·작가·문장·감상에 더해 소개·출판사도 유지, 안내 문구', async () => {
  const app = await openApp(srv.base, { books: books() });
  const p = app.page;
  try {
    assert.match(await p.getAttribute('#search', 'placeholder'), /문장 · 감상/);
    for (const [q, want] of [['합성 문장 둘', 'fx-done-rated'], ['두 번째 줄', 'fx-done-rated'], ['합성출판', 'fx-done-rated'], ['합성 AI 소개', 'fx-done-rated'], ['Synthetic Author', 'fx-long-en-life']]) {
      await p.fill('#search', q);
      assert.deepEqual(await shelfIds(p), [want], q);
    }
    await p.fill('#search', '없는 검색어 zz');
    assert.match(await p.textContent('.shelf'), /검색 결과 없음/);
    assert.equal(await p.evaluate(() => document.activeElement.id), 'search', '입력 중 초점 유지');
  } finally { await app.browser.close(); }
});

test('U08·U12 빈 서재와 검색 0건을 구분, 완독 없이 이전 기록만 있을 때 안내', async () => {
  const empty = await openApp(srv.base, {});
  try { assert.match(await empty.page.textContent('.shelf'), /첫 번째 책을 기다리고/); } finally { await empty.browser.close(); }
  const arch = await openApp(srv.base, { books: fixtureBooks().filter(b => b.status !== 'done') });
  try {
    assert.match(await arch.page.textContent('.shelf'), /완독한 책이 아직 없어요/);
    assert.doesNotMatch(await arch.page.textContent('.shelf'), /검색 결과 없음/);
  } finally { await arch.browser.close(); }
});

test('U05 보기 선호만 UI 키에 저장 → 새로고침해도 목록 보기, 검색·필터는 새로 열면 비어 있음', async () => {
  const app = await openApp(srv.base, { books: books() });
  const p = app.page;
  try {
    const before = await p.evaluate(() => localStorage.getItem('mnemosyne-library-v1'));
    await p.click('[data-filter-toggle="notes"]');
    await p.fill('#search', '합성');
    await p.click('[data-shelf-view="list"]');
    assert.equal(await p.inputValue('#search'), '합성', '보기를 바꿔도 검색 유지');
    assert.equal(await p.getAttribute('[data-filter-toggle="notes"]', 'aria-pressed'), 'true', '보기를 바꿔도 필터 유지');
    assert.equal(await p.evaluate(() => localStorage.getItem('my-library-ui-v1')), '{"shelfView":"list"}');
    assert.equal(await p.evaluate(() => localStorage.getItem('mnemosyne-library-v1')), before, '책 데이터는 그대로');
    await p.reload(); await p.waitForSelector('.booklist .listrow');
    assert.equal((await listIds(p)).length, 5);
    assert.equal(await p.inputValue('#search'), '');
    // 목록에서 연 상세를 닫으면 그 줄로 초점 복귀
    await p.focus('.listrow[data-book="fx-extra"]');
    await p.keyboard.press('Enter');
    await p.waitForSelector('#newQuote');
    await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(() => document.activeElement?.dataset.book), 'fx-extra');
  } finally { await app.browser.close(); }
});

function supa({ keysFail = false } = {}) {
  const log = { posts: 0, offline: false, tries: 0 };
  return [log, async (route, u) => {
    if (!u.hostname.endsWith('supabase.co')) return false;
    log.tries++;
    if (log.offline) { await route.abort('internetdisconnected'); return true; } // 실제 오프라인처럼 연결 실패
    const m = route.request().method();
    if (u.pathname === '/rest/v1/user_settings' && keysFail) { await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: '가짜 키 보관 오류' }) }); return true; }
    if (m === 'POST' && u.pathname === '/rest/v1/books') log.posts++;
    await sleep(150);
    await route.fulfill({ status: m === 'GET' ? 200 : 201, contentType: 'application/json', body: m === 'GET' ? '[]' : '' });
    return true;
  }];
}
const topText = p => p.textContent('.topsync');

test('U06 상단 저장 상태: 로컬 전용 / 클라우드 저장 / 오프라인 저장 → 온라인 복귀 후 업로드(mock)', async () => {
  const local = await openApp(srv.base, { books: books() });
  try { assert.equal((await topText(local.page)).trim(), '이 기기에만 저장'); } finally { await local.browser.close(); }

  const [log, mock] = supa();
  const app = await openApp(srv.base, { books: books(), seed: fakeSession(), mock });
  const p = app.page;
  try {
    await p.waitForFunction(() => /클라우드에 저장됨/.test(document.querySelector('.topsync')?.textContent || ''), null, { timeout: 8000 });
    assert.equal(await p.getAttribute('.topsync', 'data-sync-tone'), 'ok');
    await app.context.setOffline(true); log.offline = true;
    const triesBefore = log.tries;
    await p.waitForFunction(() => /오프라인/.test(document.querySelector('.topsync').textContent));
    await p.click('.spine[data-book="fx-extra"]');
    await p.click('[data-rate="5"]');
    assert.match(await p.textContent('.toast'), /평점을 저장했어요/, '로컬 저장은 성공');
    assert.equal((await stored(p)).find(b => b.id === 'fx-extra').rating, 5);
    await sleep(1800);
    assert.match(await topText(p), /오프라인 · 이 기기에 저장됨 · 올릴 변경 1건/);
    assert.equal(log.posts, 0);
    assert.equal(log.tries, triesBefore, '오프라인 동안에는 요청을 보내지 않음');
    await p.keyboard.press('Escape');
    log.offline = false; await app.context.setOffline(false);
    await p.waitForFunction(() => /클라우드에 저장됨/.test(document.querySelector('.topsync').textContent), null, { timeout: 8000 });
    assert.equal(log.posts, 1, '온라인이 되면 올림');
  } finally { await app.browser.close(); }
});

test('U06 키 보관만 실패하면 책 동기화는 성공으로, 키 실패는 따로 표시', async () => {
  const [, mock] = supa({ keysFail: true });
  const app = await openApp(srv.base, { books: books(), seed: fakeSession(), mock });
  const p = app.page;
  try {
    await p.waitForFunction(() => /클라우드에 저장됨/.test(document.querySelector('.topsync')?.textContent || ''), null, { timeout: 8000 });
    assert.equal((await topText(p)).trim(), '클라우드에 저장됨 · 키 보관 실패');
    await p.click('.app [data-view="settings"]');
    const long = await p.textContent('[data-sync-status="long"]');
    assert.match(long, /모든 변경이 클라우드에 저장돼 있어요/);
    assert.match(long, /키 보관 실패/);
    assert.doesNotMatch(long, /동기화가 실패/);
  } finally { await app.browser.close(); }
});

test('U12 통계는 완독 기준, 이전 기록은 설정에 읽기 전용으로 보이고 상태가 바뀌지 않음', async () => {
  const app = await openApp(srv.base, { books: books() });
  const p = app.page;
  try {
    const before = await p.evaluate(() => localStorage.getItem('mnemosyne-library-v1'));
    await p.click('.app [data-view="insights"]');
    const t = await p.textContent('.analysis');
    assert.match(t, /완독 작품 기준/);
    assert.match(t, /완독 5권/);
    assert.match(t, /읽는 중 1권 · 읽고 싶은 책 1권이 보관/);
    await p.click('.app [data-view="settings"]');
    const items = await p.$$eval('.archivelist li', els => els.map(e => e.textContent));
    assert.equal(items.length, 2);
    assert.ok(items.some(x => /읽는 중인 합성 책.*읽는 중/.test(x)));
    assert.equal(await p.$('.archivelist button, .archivelist input, .archivelist select'), null, '읽기 전용');
    assert.equal(await p.evaluate(() => localStorage.getItem('mnemosyne-library-v1')), before, '보기만 해도 데이터 변화 없음');
  } finally { await app.browser.close(); }
});

test('합성 500권: 검색 입력 반응 시간 측정(책장·목록)', async () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: 'perf-' + i, title: `합성 성능 책 ${i} ${'가나다라마바사'.slice(i % 7)}`, author: '합성 저자 ' + (i % 37), status: 'done', rating: i % 6, notes: i % 3 ? '합성 감상 ' + i : '', color: '#2f4a3d', colorMode: 'custom', createdAt: new Date(1.7e12 + i * 864e5).toISOString(), quotes: i % 5 ? [] : [{ id: 'pq' + i, text: '합성 문장 ' + i, page: '', createdAt: '2026-01-01T00:00:00.000Z' }] }));
  const app = await openApp(srv.base, { books: many });
  const p = app.page;
  try {
    const measure = () => p.evaluate(async () => {
      const el = document.getElementById('search'), out = [];
      for (const q of ['합', '합성 성', '합성 성능 책 1', '']) { const t0 = performance.now(); el.value = q; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => requestAnimationFrame(() => r())); out.push(Math.round(performance.now() - t0)); }
      return out;
    });
    const shelf = await measure();
    await p.click('[data-shelf-view="list"]');
    const list = await measure();
    console.log(`  # 500권 검색 반응(ms) 책장 ${shelf.join('/')} · 목록 ${list.join('/')}`);
    assert.ok(Math.max(...shelf, ...list) < 1000, '1초를 넘지 않아야 함');
    assert.equal((await listIds(p)).length, 500);
  } finally { await app.browser.close(); }
});
