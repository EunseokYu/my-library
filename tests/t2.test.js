// T2 — 구조 분리(CSS·JS 외부 파일) 회귀 검증. 실행: npm test
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, openApp, fixtureBooks, stored } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());
const ROOT = path.resolve(__dirname, '..');

test('/my-library/ 하위 경로에서 CSS·JS를 상대 경로로 불러오고 404가 없음', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  try {
    const bad = [];
    app.page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    await app.page.reload();
    await app.page.waitForSelector('.spine[data-book]');
    assert.deepEqual(bad, []);
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    assert.ok(refs.length >= 2);
    for (const r of refs) {
      assert.ok(!/^(\/|https?:)/.test(r), '상대 경로여야 함: ' + r);
      assert.ok(fs.existsSync(path.join(ROOT, r.split('?')[0])), '파일 있음: ' + r);
    }
    // 스타일이 실제로 적용됐는지(외부 CSS 로드)
    const bg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.notEqual(bg, 'rgba(0, 0, 0, 0)');
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});

test('인증 복귀 주소와 Supabase 공개 설정은 그대로', () => {
  const js = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(js, /const APP_URL='https:\/\/eunseokyu\.github\.io\/my-library\/';/);
  assert.match(js, /const SB_URL='https:\/\/samgvnfsxmbbsavsvsut\.supabase\.co';/);
  for (const k of ['mnemosyne-library-v1', 'my-library-kakao-key-v1', 'my-library-gemini-key-v1', 'my-library-theme-v1', 'my-library-ai-pause-v1', 'my-library-auth-v1', 'my-library-sync-v1', 'my-library-edition-map-v1'])
    assert.ok(js.includes(`'${k}'`), k);
});

test('예전 형식(version 1) 백업 복원 → 다시 내보내기 → 다시 복원해도 같음', async () => {
  const legacy = path.join(__dirname, 'fixtures', 'legacy-v1.json');
  const app = await openApp(srv.base, {});
  try {
    const p = app.page;
    await p.click('.app [data-view="settings"]');
    await p.setInputFiles('#importer', legacy);
    await p.click('[data-action="merge"]');
    const a = await stored(p);
    assert.deepEqual(a.map(b => b.id), ['legacy-1', 'legacy-2', 'legacy-3']);
    assert.deepEqual(a.map(b => b.status), ['done', 'reading', 'want'], '상태가 없으면 want, 나머지는 그대로');
    assert.equal(a[0].color, '#6b3438'); assert.equal(a[0].colorMode, 'custom', '예전 책은 원래 색 유지');
    assert.equal(a[0].googleBooksId, 'legacyGB1'); assert.equal(a[0].notes, '예전 감상');
    assert.equal(a[1].notionUrl, 'https://www.notion.so/synthetic-page');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.analysis [data-action="export"]')]);
    const f = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'mylib-')), 'b.json');
    await dl.saveAs(f);
    const ex = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(ex.app, 'Mnemosyne'); assert.equal(ex.version, 2);
    assert.deepEqual(ex.books, a);
    const app2 = await openApp(srv.base, {});
    try {
      await app2.page.click('.app [data-view="settings"]');
      await app2.page.setInputFiles('#importer', f);
      await app2.page.click('[data-action="merge"]');
      assert.deepEqual(await stored(app2.page), a);
    } finally { await app2.browser.close(); }
  } finally { await app.browser.close(); }
});

test('핵심 흐름: 제목만으로 등록·평점·문장·검색·테마', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    await p.click('.topbuttons [data-action="add"]');
    await p.waitForSelector('#bookform');
    await p.fill('#title', '합성 새 책');
    await p.click('#bookform button[type="submit"]');
    let list = await stored(p);
    const nb = list.find(b => b.title === '합성 새 책');
    assert.ok(nb, '제목만으로 저장');
    assert.equal(nb.status, 'done');
    await p.reload(); await p.waitForSelector('.spine[data-book]');
    assert.ok(await p.$(`.spine[data-book="${nb.id}"]`), '새로고침 후 유지');

    await p.click(`.spine[data-book="${nb.id}"]`);
    await p.click('[data-rate="4"]');
    await p.fill('#newQuote', '고유한 검색용 문장 Q7');
    await p.click('[data-action="add-quote"]');
    list = await stored(p);
    const saved = list.find(b => b.id === nb.id);
    assert.equal(saved.rating, 4);
    assert.deepEqual(saved.quotes.map(q => q.text), ['고유한 검색용 문장 Q7']);
    await p.keyboard.press('Escape');

    await p.fill('#search', '고유한 검색용 문장 Q7'); // 문장으로 검색
    assert.deepEqual(await p.$$eval('.spine[data-book]', els => els.map(e => e.dataset.book)), [nb.id]);
    await p.fill('#search', '');

    await p.click('.app [data-view="settings"]');
    await p.click('[data-theme="forest"]');
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'forest');
    assert.equal(await p.evaluate(() => localStorage.getItem('my-library-theme-v1')), 'forest');
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});
