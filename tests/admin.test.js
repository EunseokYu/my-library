// v2.15.0 — 관리자 페이지(admin.html). 실행: npm test
// 가짜 Supabase가 work_cache·이력과 관리자 함수(admin_upsert_reviewed 등)를 DB 함수와 같은 규칙으로 흉내 냅니다.
// 실제 DB 함수·권한은 별도로 트랜잭션 시험(18개 항목)으로 확인했습니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, openApp, fixtureBooks, stored, fakeSession } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PILOT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pilot-10-v4.json'), 'utf8'));
const approved = (j = PILOT) => ({ ...j, reviewStatus: 'approved', books: j.books.map(b => ({ ...b, reviewStatus: 'approved' })) });
const tmp = (name, obj) => { const f = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'mylib-admin-')), name); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
// 지금 운영 DB의 기존 공유 기록 중 시범 10권과 겹치는 두 작품(AI 소개)
const EXISTING = [{ key: '죄와벌|도스토예프스키', title: '죄와 벌', author: '표도르 도스토예프스키', summary: '기존 AI 소개(죄와 벌).', source: 'ai', rev: 0 },
                  { key: '남아있는나날|가즈오이시구로', title: '남아 있는 나날', author: '가즈오 이시구로', summary: '기존 AI 소개(남아 있는 나날).', source: 'ai', rev: 0 }];

function db({ admin = true, rows = EXISTING, edition = [], fail = {} } = {}) {
  const st = { rows: new Map(rows.map(r => [r.key, { genre: '', original_title: '', ...r }])), history: [], rpc: 0, payloads: [], restored: [] };
  const mock = async (route, u) => {
    if (!u.hostname.endsWith('supabase.co')) return false;
    const req = route.request(), m = req.method(), q = decodeURIComponent(u.search);
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/rest/v1/rpc/is_admin') return json(admin), true;
    if (u.pathname === '/rest/v1/rpc/admin_upsert_reviewed') {
      st.rpc++; const n = st.rpc;
      if (fail[n] === 'network') return route.abort('internetdisconnected').then(() => true);
      if (!admin || fail[n] === 'auth') return json({ code: '42501', message: 'not_admin' }, 403), true;
      const items = JSON.parse(req.postData()).items; st.payloads.push(items);
      if (items.length > 100) return json({ message: 'bad_batch' }, 400), true;
      const res = items.map(it => {
        const r = st.rows.get(it.key);
        if (fail.staleKey === it.key) return { key: it.key, status: 'error', error: 'stale' };
        if (r && r.source === 'reviewed' && r.summary === it.summary && r.genre === (it.genre || '') && r.original_title === (it.originalTitle || '')) return { key: it.key, status: 'same' };
        if (r) { if (it.expectRev != null && r.rev !== it.expectRev) return { key: it.key, status: 'error', error: 'stale' };
          st.history.push({ id: st.history.length + 1, key: it.key, action: 'update', old_row: { ...r }, new_summary: it.summary, new_rev: r.rev + 1, changed_at: new Date().toISOString() });
          st.rows.set(it.key, { ...r, summary: it.summary, source: 'reviewed', rev: r.rev + 1, genre: it.genre || '', original_title: it.originalTitle || '' }); return { key: it.key, status: 'updated' }; }
        st.rows.set(it.key, { key: it.key, title: it.title, author: it.author, summary: it.summary, source: 'reviewed', rev: 1, genre: it.genre || '', original_title: it.originalTitle || '' });
        st.history.push({ id: st.history.length + 1, key: it.key, action: 'insert', old_row: null, new_summary: it.summary, new_rev: 1, changed_at: new Date().toISOString() });
        return { key: it.key, status: 'inserted' };
      });
      return json(res), true;
    }
    if (u.pathname === '/rest/v1/rpc/admin_restore_reviewed') { st.restored.push(JSON.parse(req.postData()).history_id); return json({ status: 'restored' }), true; }
    if (u.pathname === '/rest/v1/work_cache' && m === 'GET') {
      const off = Number((q.match(/offset=(\d+)/) || [])[1] || 0), lim = Number((q.match(/limit=(\d+)/) || [])[1] || 1000);
      return json([...st.rows.values()].sort((a, b) => a.key < b.key ? -1 : 1).slice(off, off + lim)), true;
    }
    if (u.pathname === '/rest/v1/edition_map') return json(/offset=0/.test(q) ? edition : []), true;
    if (u.pathname === '/rest/v1/work_cache_history') { const k = (q.match(/key=eq\.([^&]+)/) || [])[1]; return json(st.history.filter(h => !k || h.key === k).reverse()), true; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return true;
  };
  return { st, mock };
}
async function openAdmin({ seed = fakeSession(), ...opt } = {}) {
  const d = db(opt);
  const app = await openApp(srv.base, { seed, mock: d.mock });
  await app.page.goto(srv.base + 'admin.html');
  await app.page.waitForSelector('#admin h1');
  return { ...app, d, p: app.page };
}
const load = async (p, file) => { await p.waitForSelector('#jsonfile:not([disabled])'); const n = await p.evaluate(() => Number(document.body.dataset.loads || 0)); await p.setInputFiles('#jsonfile', file); await p.waitForFunction(k => Number(document.body.dataset.loads || 0) > k, n, { timeout: 60000 }); };
const chip = async (p, k) => Number(await p.textContent(`[data-filter="${k}"] b`));
const saveAll = async p => { await p.click('[data-act="select-all"]'); await p.click('[data-act="save"]'); await p.waitForFunction(() => /끝 ·/.test(document.querySelector('.progress + p')?.textContent || ''), null, { timeout: 150000 }); };

test('#8 로그인 안 함 / 관리자 아님: 파일을 읽을 수 없고 저장 버튼도 없음(권한은 서버가 판단)', async () => {
  const a = await openAdmin({ seed: {} });
  try { assert.match(await a.p.textContent('.who'), /로그인이 필요해요/); assert.ok(await a.p.$('#jsonfile[disabled]')); } finally { await a.browser.close(); }
  const b = await openAdmin({ admin: false });
  try {
    await b.p.waitForFunction(() => /관리자 권한이 없어요/.test(document.querySelector('.who')?.textContent || ''));
    assert.ok(await b.p.$('#jsonfile[disabled]'));
    assert.equal(b.d.st.rpc, 0);
  } finally { await b.browser.close(); }
});

test('#1·#4 시범 JSON(draft) 그대로: 미리보기만, 기존 두 작품은 "변경", 나머지 8권은 "신규", 저장 가능 0건', async () => {
  const a = await openAdmin();
  try {
    await load(a.p, tmp('pilot.json', PILOT));
    assert.deepEqual([await chip(a.p, 'all'), await chip(a.p, 'new'), await chip(a.p, 'change'), await chip(a.p, 'draft'), await chip(a.p, 'error')], [10, 8, 2, 10, 0]);
    assert.match(await a.p.textContent('[data-act="select-all"]'), /저장 가능한 0건/);
    assert.equal(await a.p.$$eval('[data-sel]:not([disabled])', e => e.length), 0, 'draft는 선택 불가');
    // 변경 미리보기: 지금 DB(AI 소개)와 JSON 소개를 나란히
    const i = PILOT.books.findIndex(b => b.title === '죄와 벌');
    await a.p.click(`[data-open="${i}"]`);
    const pv = await a.p.$$eval('.preview div', e => e.map(x => x.textContent));
    assert.match(pv[0], /AI 소개[\s\S]*기존 AI 소개\(죄와 벌\)/);
    assert.ok(pv[1].includes(PILOT.books[i].aiSummary), 'JSON 소개 그대로(줄바꿈 포함)');
    assert.equal(await a.p.evaluate(() => getComputedStyle(document.querySelectorAll('.preview div')[1]).whiteSpace), 'pre-wrap');
    assert.deepEqual(a.errors, []);
  } finally { await a.browser.close(); }
});

test('#2·#3·#5·#6 approved만 저장, 소개·줄바꿈 그대로 전송, 같은 파일 재등록은 0건, 수정하면 다시 반영', async () => {
  const a = await openAdmin();
  try {
    const file = approved();
    await load(a.p, tmp('approved.json', file));
    await saveAll(a.p);
    assert.equal(a.d.st.rpc, 1, '10건은 한 묶음');
    const sent = a.d.st.payloads[0];
    assert.equal(sent.length, 10);
    for (const b of file.books) { const it = sent.find(x => x.summary === b.aiSummary); assert.ok(it, b.title + ' 소개가 글자 그대로 전송'); assert.ok(it.summary.includes('\n\n')); assert.equal(it.genre, b.genre); assert.equal(it.originalTitle, b.originalTitle); }
    assert.equal(sent.find(x => x.key === '죄와벌|도스토예프스키').expectRev, 0, '기존 행은 미리보기한 번호로만 교체');
    assert.equal(await chip(a.p, 'same'), 10, '저장 뒤 모두 동일');
    // 같은 파일을 다시: 동일 10, 저장 가능 0
    await load(a.p, tmp('approved.json', file));
    assert.equal(await chip(a.p, 'same'), 10); assert.match(await a.p.textContent('[data-act="select-all"]'), /저장 가능한 0건/);
    // 한 권 수정 → 변경 1 → 저장 → rev 2
    const edited = approved(); edited.books[2] = { ...edited.books[2], aiSummary: edited.books[2].aiSummary.replace('칼 세이건은', '칼 세이건은 다시') };
    await load(a.p, tmp('edited.json', edited));
    assert.equal(await chip(a.p, 'change'), 1);
    await saveAll(a.p);
    assert.equal(a.d.st.rows.get('코스모스|칼세이건').rev, 2);
    assert.equal(a.d.st.rows.get('코스모스|칼세이건').summary, edited.books[2].aiSummary);
    assert.equal(a.d.st.history.filter(h => h.key === '코스모스|칼세이건').length, 2, '이전 소개가 이력에 남음');
  } finally { await a.browser.close(); }
});

test('#3·#7 형식·분량·중복 오류와 원작 충돌은 저장 대상에서 빠짐', async () => {
  const a = await openAdmin({ rows: [...EXISTING, { key: '코스모스|다른저자', title: '코스모스', author: '다른 저자', summary: '다른 작품', source: 'ai', rev: 0 }],
                              edition: [{ title_key: '모순', author_key: '다른사람', work_title: '모순', work_author: '다른 사람' }] });
  try {
    const j = approved(); const b = j.books;
    b[0] = { ...b[0], aiSummary: '가'.repeat(499) };                       // 499자
    b[1] = { ...b[1], aiSummary: '가'.repeat(350) + '\n' + '나'.repeat(350) }; // 701자(줄바꿈 포함)
    b[3] = { ...b[3], genre: '' };
    b[4] = { ...b[4], reviewStatus: 'ok' };
    j.books.push({ ...b[6] });                                               // 파일 안 중복
    await load(a.p, tmp('bad.json', j));
    const reasons = await a.p.$$eval('.reasons', e => e.map(x => x.textContent).join('\n'));
    for (const r of [/소개 길이 499자/, /소개 길이 701자/, /genre가 비어 있음/, /reviewStatus가 approved 또는 draft가 아님/, /같은 원작이 2번/, /같은 제목의 다른 저자 기록이 있어요: 코스모스\|다른저자/, /판본 묶기 기록이 이 제목을 다른 저자/]) assert.match(reasons, r);
    assert.equal(await chip(a.p, 'error'), 6); assert.equal(await chip(a.p, 'conflict'), 2);
    assert.match(await a.p.textContent('[data-act="select-all"]'), /저장 가능한 3건/);
  } finally { await a.browser.close(); }
  const c = await openAdmin();
  try {
    await c.p.waitForSelector('#jsonfile:not([disabled])');
    await c.p.setInputFiles('#jsonfile', tmp('v2.json', { ...approved(), schemaVersion: 2 }));
    await c.p.waitForFunction(() => /schemaVersion이 1이어야/.test(document.body.textContent));
    await c.p.setInputFiles('#jsonfile', tmp('broken.json', '{"books": ['));
    await c.p.waitForFunction(() => /JSON 형식이 아니에요/.test(document.body.textContent));
  } finally { await c.browser.close(); }
});

test('#11 5,000권: 검증·비교 후 50건씩 100번, 중간 네트워크 실패·미리보기 뒤 변경은 따로 표시, 실패만 다시 시도', async () => {
  const n = 5000, body = i => `${i}번 합성 소개 첫 줄이다.\n\n` + '합성 소개 문장이다. '.repeat(55);
  const j = { schemaVersion: 1, books: Array.from({ length: n }, (_, i) => ({ title: `합성${i}번 작품`, author: `김합성${i % 97}`, genre: '소설', aiSummary: body(i), reviewStatus: 'approved' })) };
  assert.ok(j.books.every(b => b.aiSummary.length >= 500 && b.aiSummary.length <= 700));
  const a = await openAdmin({ rows: [], fail: { 37: 'network', staleKey: '합성4321번작품|김합성53' } });
  try {
    const t0 = Date.now();
    await load(a.p, tmp('5000.json', j));
    const tLoad = Date.now() - t0;
    assert.equal(await chip(a.p, 'new'), n);
    assert.equal(await a.p.$$eval('.items .item', e => e.length), 200, '처음에는 200건만 그림');
    const t1 = Date.now();
    await saveAll(a.p);
    const tSave = Date.now() - t1;
    console.log(`  # 5,000권: 검증·비교 ${tLoad}ms, 저장(가짜 서버) ${tSave}ms`);
    assert.equal(a.d.st.rpc, 100); assert.ok(a.d.st.payloads.every(x => x.length <= 50));
    const txt = await a.p.textContent('.progress + p');
    assert.match(txt, /5000 \/ 5000 · 성공 4949 · 실패 51/, txt);
    assert.equal(a.d.st.rows.size, 4949, '실패와 관계없이 성공분은 저장됨');
    assert.match(await a.p.textContent('[data-act="retry"]'), /실패한 50건 다시 시도/, '미리보기 뒤 변경(1건)은 자동 재시도 대상이 아님');
    await a.p.click('[data-act="retry"]');
    await a.p.waitForFunction(() => /끝 ·.*성공 50/.test(document.querySelector('.progress + p')?.textContent || ''), null, { timeout: 20000 });
    assert.equal(a.d.st.rpc, 101, '실패한 50건만 한 묶음으로');
    assert.equal(a.d.st.rows.size, 4999);
  } finally { await a.browser.close(); }
});

test('저장 중 권한 오류: 멈추고 남은 묶음은 보내지 않음, 성공분은 보존', async () => {
  const j = { schemaVersion: 1, books: Array.from({ length: 160 }, (_, i) => ({ title: `권한${i}번 시험`, author: '김합성', genre: '소설', aiSummary: '가'.repeat(520) + i, reviewStatus: 'approved' })) };
  const a = await openAdmin({ rows: [], fail: { 2: 'auth' } });
  try {
    await load(a.p, tmp('auth.json', j));
    await saveAll(a.p);
    assert.equal(a.d.st.rpc, 2, '권한 오류 뒤 남은 2묶음은 보내지 않음');
    assert.equal(a.d.st.rows.size, 50);
    assert.match(await a.p.textContent('.progress + p'), /멈춤: 관리자 권한이 없어요/);
    assert.match(await a.p.textContent('.reasons'), /권한 오류|앞의 권한 오류/);
  } finally { await a.browser.close(); }
});

test('되돌리기: 작품 이력을 찾아 그 변경을 되돌림(서버 함수 호출)', async () => {
  const a = await openAdmin();
  try {
    await load(a.p, tmp('approved.json', approved()));
    await saveAll(a.p);
    await a.p.fill('#histq', '죄와벌|도스토예프스키');
    await a.p.click('#histform button');
    await a.p.waitForSelector('[data-restore]');
    assert.match(await a.p.textContent('.hist'), /바꾸기 전: 기존 AI 소개\(죄와 벌\)/);
    await a.p.click('[data-restore]');
    await a.p.waitForFunction(() => true); await sleep(500);
    assert.deepEqual(a.d.st.restored, [1]);
  } finally { await a.browser.close(); }
});

test('#9 판본으로 넣기(서재) 정상: 다른 작품의 판본을 묶으면 ISBN→작품 기록이 남고 목록이 합쳐짐', async () => {
  const docs = [
    { title: '데미안', authors: ['헤르만 헤세'], translators: [], publisher: '가출판', isbn: '8900000001 9790000001001', contents: '', thumbnail: '' },
    { title: 'Demian', authors: ['Hermann Hesse'], translators: [], publisher: 'Nabu', isbn: '8900000002 9790000001002', contents: '', thumbnail: '' }];
  const mock = async (route, u) => { if (u.hostname !== 'dapi.kakao.com') return false; await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ documents: docs, meta: { is_end: true } }) }); return true; };
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: { 'my-library-kakao-key-v1': '0123456789abcdef0123456789abcdef' }, mock });
  const p = app.page;
  try {
    await p.click('.topbuttons [data-action="add"]'); await p.fill('#apiQuery', '데미안'); await p.click('[data-action="api-search"]');
    await p.waitForSelector('[data-api-work]');
    assert.equal(await p.$$eval('[data-api-work]', e => e.length), 2, '원서·한글판은 처음엔 다른 작품');
    const demianIdx = await p.$$eval('[data-api-work]', e => e.findIndex(x => x.textContent.includes('Demian')));
    await p.click(`[data-api-bind="${demianIdx}"]`);
    await p.click('[data-api-bind-to]');
    const map = await p.evaluate(() => JSON.parse(localStorage.getItem('my-library-edition-map-v1') || '{}'));
    assert.ok(Object.keys(map).some(k => k.includes('9790000001002')), 'Demian ISBN이 기록됨');
    assert.equal(await p.$$eval('[data-api-work]', e => e.length), 1, '한 작품으로 합쳐짐');
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});
