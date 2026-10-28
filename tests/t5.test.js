// T5 (U09) — 최근 삭제 1건 실행 취소. 실행: npm test
// 가짜 Supabase(mock)가 books 줄의 deleted 값을 실제로 기억해, 되돌린 뒤 서버 최종 상태가 '되살림'으로 맞춰지는지 확인합니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, openApp, fixtureBooks, stored, fakeSession } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const X = 'fx-long-ko-unrated';

function fakeServer({ patchDelay = 100 } = {}) {
  const rows = new Map(fixtureBooks().map(b => [b.id, { deleted: false, data: b }]));
  const st = { rows, patches: 0, posts: 0, active: 0, patchStarted: false, patchDone: false, offline: false, patchDelay };
  const mock = async (route, u) => {
    if (!u.hostname.endsWith('supabase.co')) return false;
    if (st.offline) { await route.abort('internetdisconnected'); return true; }
    const req = route.request(), m = req.method();
    st.active++;
    try {
      if (u.pathname === '/rest/v1/books' && m === 'PATCH') {
        st.patchStarted = true;
        await sleep(st.patchDelay);
        const ids = decodeURIComponent(u.search).match(/"([^"]+)"/g).map(x => x.slice(1, -1));
        for (const id of ids) { const r = rows.get(id) || { data: null }; rows.set(id, { ...r, deleted: true }); }
        st.patches++; st.patchDone = true;
        await route.fulfill({ status: 204, body: '' });
      } else if (u.pathname === '/rest/v1/books' && m === 'POST') {
        await sleep(80);
        for (const r of JSON.parse(req.postData())) rows.set(r.id, { deleted: r.deleted, data: r.data });
        st.posts++;
        await route.fulfill({ status: 201, body: '' });
      } else {
        await sleep(30);
        await route.fulfill({ status: m === 'GET' ? 200 : 201, contentType: 'application/json', body: m === 'GET' ? '[]' : '' });
      }
    } finally { st.active--; }
    return true;
  };
  return { st, mock };
}
// 올릴 변경·지운 책 목록이 비고 요청이 없는 상태가 0.6초 이어질 때까지 기다림
async function settle(p, st, timeout = 15000) {
  const end = Date.now() + timeout; let calm = 0;
  while (Date.now() < end) {
    const meta = await p.evaluate(() => JSON.parse(localStorage.getItem('my-library-sync-v1') || '{}'));
    const busy = /동기화 중/.test(await p.textContent('.topsync'));
    if (!meta.dirty?.length && !meta.removed?.length && st.active === 0 && !busy) { if ((calm += 100) >= 600) return; } else calm = 0;
    await sleep(100);
  }
  throw new Error('동기화가 끝나지 않음');
}
async function deleteBook(p, id) {
  await p.click(`.spine[data-book="${id}"]`);
  await p.click('#dialog [data-action="delete"]'); // confirm은 helpers가 승인
  await p.waitForSelector('.undobar');
}
async function expectRestored(p, st, original) {
  const list = await stored(p);
  const idx = list.findIndex(b => b.id === X);
  assert.equal(idx, original.index, '원래 자리');
  assert.deepEqual(list[idx], original.book, '내용 그대로');
  assert.equal(st.rows.get(X).deleted, false, '서버 최종 상태: 되살림');
  assert.deepEqual(st.rows.get(X).data, original.book, '서버 데이터도 그대로');
  assert.equal(await p.$('.undobar'), null, '되살린 뒤 안내 사라짐');
}
async function setup(opts) {
  const { st, mock } = fakeServer(opts);
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: fakeSession(), mock });
  await settle(app.page, st);
  // 기준값을 앱이 정규화한 모양으로 맞추려고, 평점을 1 → 0으로 두 번 저장(값은 원래대로)
  await app.page.click(`.spine[data-book="${X}"]`);
  await app.page.click('[data-rate="1"]'); await app.page.click('[data-rate="1"]');
  await app.page.keyboard.press('Escape');
  await settle(app.page, st);
  const list = await stored(app.page);
  const index = list.findIndex(b => b.id === X);
  return { app, p: app.page, st, original: { index, book: list[index] } };
}

test('U09 삭제 직후(전송 전) 되돌리기 → 원래 자리·내용, 서버 삭제 표시 없음', async () => {
  const { app, p, st, original } = await setup();
  try {
    await deleteBook(p, X);
    assert.ok(!(await stored(p)).some(b => b.id === X));
    await p.click('.undobar [data-action="undo-delete"]');
    await settle(p, st);
    await expectRestored(p, st, original);
    assert.equal(st.patches, 0, '전송 전이면 삭제 표시를 보내지 않음');
  } finally { await app.browser.close(); }
});

test('U09 삭제 표시 전송 중에 되돌리기 → 다음 회차에 다시 올려 최종 되살림', async () => {
  const { app, p, st, original } = await setup({ patchDelay: 2500 });
  try {
    await deleteBook(p, X);
    await p.waitForFunction(() => true, null, { timeout: 100 });
    const end = Date.now() + 8000; while (!st.patchStarted && Date.now() < end) await sleep(50);
    assert.ok(st.patchStarted && !st.patchDone, '삭제 표시가 전송 중');
    await p.click('.undobar [data-action="undo-delete"]');
    await settle(p, st, 20000);
    assert.equal(st.patches, 1);
    await expectRestored(p, st, original);
  } finally { await app.browser.close(); }
});

test('U09 삭제 표시 전송 완료 뒤 되돌리기 → 서버 deleted:false로 되살림', async () => {
  const { app, p, st, original } = await setup();
  try {
    await deleteBook(p, X);
    await settle(p, st);
    assert.equal(st.rows.get(X).deleted, true, '먼저 서버에 삭제 표시가 남음(tombstone)');
    await p.click('.undobar [data-action="undo-delete"]');
    await settle(p, st);
    await expectRestored(p, st, original);
  } finally { await app.browser.close(); }
});

test('U09 오프라인에서 삭제·되돌리기 → 온라인 복귀 후에도 되살린 상태', async () => {
  const { app, p, st, original } = await setup();
  try {
    await app.context.setOffline(true); st.offline = true;
    await deleteBook(p, X);
    await p.click('.undobar [data-action="undo-delete"]');
    await sleep(2000);
    st.offline = false; await app.context.setOffline(false);
    await settle(p, st);
    await expectRestored(p, st, original);
  } finally { await app.browser.close(); }
});

test('U09 전송 중 되돌린 뒤 다시 삭제하면 최종 삭제(되살아나지 않음)', async () => {
  const { app, p, st } = await setup({ patchDelay: 2000 });
  try {
    await deleteBook(p, X);
    const end = Date.now() + 8000; while (!st.patchStarted && Date.now() < end) await sleep(50);
    await p.click('.undobar [data-action="undo-delete"]');
    await deleteBook(p, X);
    await settle(p, st, 20000);
    assert.ok(!(await stored(p)).some(b => b.id === X));
    assert.equal(st.rows.get(X).deleted, true);
  } finally { await app.browser.close(); }
});

test('U09 저장 실패 시 되돌리기 버퍼 유지 → 재시도 성공, 안내는 토스트 뒤에도 남고 새로고침 뒤에는 약속하지 않음', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    await deleteBook(p, X);
    await sleep(4600); // 토스트가 사라진 뒤에도
    assert.ok(await p.$('.undobar'), '되돌리기 줄이 남아 있음');
    assert.match(await p.textContent('.undobar'), /이번 접속 중에만/);
    await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'mnemosyne-library-v1' && window.__fail) throw new Error('가짜 실패'); return o.call(this, k, v); }; window.__fail = true; });
    await p.click('.undobar [data-action="undo-delete"]');
    assert.match(await p.textContent('.toast'), /저장 실패/);
    assert.ok(await p.$('.undobar'), '실패하면 버퍼 유지');
    assert.ok(!(await stored(p)).some(b => b.id === X));
    await p.evaluate(() => { window.__fail = false; });
    await p.click('.undobar [data-action="undo-delete"]');
    assert.ok((await stored(p)).some(b => b.id === X));
    await deleteBook(p, X);
    await p.reload(); await p.waitForSelector('.spine[data-book]');
    assert.equal(await p.$('.undobar'), null, '새로고침 뒤에는 되돌리기를 보여 주지 않음');
  } finally { await app.browser.close(); }
});

test('U09 문장 삭제 되돌리기: id·createdAt·위치 복원, 그사이 바뀐 다른 필드는 유지', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    const A = 'fx-done-rated';
    const before = (await stored(p)).find(b => b.id === A);
    await p.click(`.spine[data-book="${A}"]`);
    await p.click('[data-action="del-quote"][data-qid="fx-q1"]');
    assert.ok(await p.$('#dialog .undobar'), '상세 창 안에 되돌리기');
    await p.click('[data-rate="1"]');
    await p.click('[data-action="edit-notes"]'); await p.fill('#detailNotes', '그사이 바꾼 감상'); await p.click('[data-action="save-notes"]');
    await p.click('#dialog [data-action="undo-delete"]');
    const after = (await stored(p)).find(b => b.id === A);
    assert.deepEqual(after.quotes, before.quotes, '문장 순서·id·createdAt 그대로');
    assert.equal(after.rating, 1); assert.equal(after.notes, '그사이 바꾼 감상');
    assert.equal(await p.$('#dialog .undobar'), null);
  } finally { await app.browser.close(); }
});

test('U09 문장이 있던 책이 사라졌으면 되살리지 않고 이유를 알림', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    const A = 'fx-done-rated';
    await p.click(`.spine[data-book="${A}"]`);
    await p.click('[data-action="del-quote"][data-qid="fx-q2"]');
    await p.keyboard.press('Escape');
    // 다른 탭에서 그 책이 지워진 상황(storage 이벤트)
    await p.evaluate(a => { const k = 'mnemosyne-library-v1', v = JSON.parse(localStorage.getItem(k)).filter(b => b.id !== a); localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new StorageEvent('storage', { key: k })); }, A);
    await p.click('.undobar [data-action="undo-delete"]');
    assert.match(await p.textContent('.toast'), /책이 서재에 없어서/);
    assert.ok(!(await stored(p)).some(b => b.id === A), '책을 임의로 다시 만들지 않음');
    assert.equal(await p.$('.undobar'), null);
  } finally { await app.browser.close(); }
});
