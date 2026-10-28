// 실행: npm test  (또는 node --test tests/)
// 기준점 테스트(T0). 앱 동작을 바꾸지 않고 현재 동작을 기록합니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { startServer, openApp, fixtureBooks, stored } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());

const DONE_IDS = fixtureBooks().filter(b => b.status === 'done').map(b => b.id).sort();

test('기본 로드: 오류 없음, 완독 책만 책장에 표시, 바깥 API 호출 없음', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  try {
    assert.match(await app.page.title(), /^나의 서재 v\d+\.\d+\.\d+$/);
    const ids = await app.page.$$eval('.spine[data-book]', els => els.map(e => e.dataset.book).sort());
    assert.deepEqual(ids, DONE_IDS);
    assert.deepEqual(app.errors, []);
    const api = app.external.filter(h => /supabase\.co|kakao\.com|googleapis\.com\/v1beta|generativelanguage/.test(h));
    assert.deepEqual(api, [], '로그아웃·키 없음 상태에서는 API를 부르지 않아야 함');
    const raw = await stored(app.page);
    assert.equal(raw.length, 6, 'reading/want 기록도 저장소에 그대로 남아 있어야 함');
  } finally { await app.browser.close(); }
});

test('JSON 백업 왕복: 내보내기 → 빈 서재에 병합 복원 → 같은 데이터', async () => {
  const a = await openApp(srv.base, { books: fixtureBooks() });
  let exported, file;
  try {
    await a.page.click('[data-view="settings"]');
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('[data-action="export"]')]);
    file = require('path').join(fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'mylib-')), 'backup.json');
    await dl.saveAs(file); // 브라우저를 닫으면 임시 다운로드가 지워지므로 따로 보관
    exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  } finally { await a.browser.close(); }

  assert.equal(exported.app, 'Mnemosyne');
  assert.equal(exported.version, 2);
  assert.equal(exported.books.length, 6);
  const fx = Object.fromEntries(fixtureBooks().map(b => [b.id, b]));
  for (const b of exported.books) {
    const o = fx[b.id];
    assert.ok(o, '모르는 ID ' + b.id);
    for (const k of ['title', 'author', 'status', 'rating', 'notes', 'color', 'createdAt', 'publisher', 'isbn', 'translator', 'motifIdea', 'spineTitle'])
      if (o[k] !== undefined) assert.deepEqual(b[k], o[k], `${b.id}.${k}`);
    assert.equal(b.lifeBook, o.lifeBook === true, `${b.id}.lifeBook`);
    assert.deepEqual(b.quotes, o.quotes || [], `${b.id}.quotes`);
  }

  const c = await openApp(srv.base, { books: null });
  try {
    await c.page.click('[data-view="settings"]');
    await c.page.setInputFiles('#importer', file);
    await c.page.click('[data-action="merge"]');
    const back = await stored(c.page);
    assert.deepEqual(back, exported.books, '복원 후 저장 데이터가 백업과 같아야 함');
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

// U01/U02 재현 테스트는 T1에서 고쳐져 tests/t1.test.js로 옮겼어요.
