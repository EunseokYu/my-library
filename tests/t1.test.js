// T1 (U01·U02·U11) — 입력 보호와 모달 접근성. 실행: npm test
// 바깥 API는 모두 가짜 응답(mock)이고, 데이터는 합성 fixture만 씁니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, openApp, fixtureBooks, stored } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());

const A = 'fx-done-rated', B = 'fx-long-ko-unrated';
const QUOTE = '아직 저장하지 않은 문장', PAGE = '77';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openDetail(page, bid) {
  await page.click(`.spine[data-book="${bid}"]`);
  await page.waitForSelector('#newQuote');
}
async function typeDraft(page) {
  await page.fill('#newQuote', QUOTE);
  await page.fill('#newQuotePage', PAGE);
}
async function expectDraft(page, q = QUOTE, p = PAGE) {
  assert.equal(await page.inputValue('#newQuote'), q, '문장 칸');
  assert.equal(await page.inputValue('#newQuotePage'), p, '쪽수 칸');
}
// confirm() 응답을 정하고, 물어봤는지 기록합니다.
function answerConfirm(page, accept) {
  const log = { asked: 0 };
  page.removeAllListeners('dialog');
  page.on('dialog', d => { log.asked++; accept ? d.accept() : d.dismiss(); });
  return log;
}

for (const width of [1440, 390]) {
  test(`U01 [${width}px] 문장 입력 중 평점·인생책을 바꿔도 입력·커서가 남고, 바뀐 값은 저장됨`, async () => {
    const app = await openApp(srv.base, { books: fixtureBooks(), width, height: width === 390 ? 844 : 900 });
    const { page } = app;
    try {
      await openDetail(page, A);
      await typeDraft(page);
      await page.click('[data-rate="2"]');
      await expectDraft(page);
      assert.equal((await stored(page)).find(b => b.id === A).rating, 2, '평점은 저장되어야 함');
      await page.click('[data-action="toggle-life"]');
      await expectDraft(page);
      assert.equal((await stored(page)).find(b => b.id === A).lifeBook, true);
      // 커서 위치: 문장 칸 가운데에 커서를 두고 바깥에서 다시 그려도(키보드로 별점 선택) 문장 칸 상태가 유지되는지
      await page.focus('#newQuote');
      await page.evaluate(() => document.getElementById('newQuote').setSelectionRange(2, 5));
      await page.dispatchEvent('[data-rate="3"]', 'click'); // 초점을 옮기지 않는 클릭
      const st = await page.evaluate(() => { const f = document.getElementById('newQuote'); return [document.activeElement === f, f.selectionStart, f.selectionEnd]; });
      assert.deepEqual(st, [true, 2, 5], '초점·선택 범위 유지');
      // 모바일 폭: 문장 추가 버튼까지 닿을 수 있어야 함
      await page.click('[data-action="add-quote"]');
      assert.deepEqual(app.errors, []);
    } finally { await app.browser.close(); }
  });
}

test('U01 모달 스크롤 위치가 평점 저장 뒤에도 유지됨', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks(), width: 1440, height: 500 });
  const { page } = app;
  try {
    await openDetail(page, A);
    await typeDraft(page);
    const before = await page.evaluate(() => { const m = document.querySelector('#dialog .modal'); m.scrollTop = 120; return m.scrollTop; });
    assert.ok(before > 0, '스크롤할 만큼 창이 길어야 함');
    await page.dispatchEvent('[data-rate="4"]', 'click');
    const after = await page.evaluate(() => document.querySelector('#dialog .modal').scrollTop);
    assert.equal(after, before);
    await expectDraft(page);
  } finally { await app.browser.close(); }
});

test('문장 저장 성공 → 초안 정리 / 저장 실패 → 초안 유지·성공 표시 없음', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const { page } = app;
  try {
    await openDetail(page, A);
    await typeDraft(page);
    await page.click('[data-action="add-quote"]');
    await expectDraft(page, '', '');
    const q = (await stored(page)).find(b => b.id === A).quotes;
    assert.equal(q.length, 3);
    assert.deepEqual([q[2].text, q[2].page], [QUOTE, PAGE]);
    assert.deepEqual(q.slice(0, 2).map(x => x.id), ['fx-q1', 'fx-q2'], '기존 문장 id 유지');
    // 평점을 바꿔도 지운 초안이 되살아나지 않음
    await page.click('[data-rate="1"]');
    await expectDraft(page, '', '');

    // 저장 실패: 이 테스트 브라우저의 localStorage 쓰기를 막음
    await typeDraft(page);
    await page.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'mnemosyne-library-v1') throw new Error('가짜 저장 실패'); return orig.call(this, k, v); }; });
    await page.click('[data-action="add-quote"]');
    await expectDraft(page);
    const toast = await page.textContent('.toast');
    assert.match(toast, /저장 실패/);
    assert.equal((await stored(page)).find(b => b.id === A).quotes.length, 3, '실패한 문장은 저장되지 않음');
    // 실패 뒤 다른 갱신(평점)도 실패하지만 초안은 남아야 함
    await page.click('[data-rate="5"]');
    await expectDraft(page);
  } finally { await app.browser.close(); }
});

test('U02 닫기 보호: Esc·×·배경·태그 이동·정보 수정 — "취소"면 유지, "확인"이면 초안 버림', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const { page } = app;
  try {
    await openDetail(page, A);
    await typeDraft(page);
    const no = answerConfirm(page, false);
    await page.keyboard.press('Escape');
    await page.click('#dialog button.close');
    await page.mouse.click(5, 5); // 배경(overlay)
    await page.click('#dialog [data-tag]');
    await page.click('#dialog [data-action="edit"]');
    assert.equal(no.asked, 5, '다섯 경로 모두 확인을 물어야 함');
    await expectDraft(page);
    assert.ok(await page.$('#newQuote'), '상세 창이 그대로 열려 있어야 함');

    const yes = answerConfirm(page, true);
    await page.keyboard.press('Escape');
    assert.equal(yes.asked, 1);
    assert.equal(await page.$('#dialog .modal'), null, '확인하면 닫힘');
    // 같은 책·다른 책을 다시 열면 빈 칸(버린 초안이 섞이지 않음)
    await openDetail(page, A);
    await expectDraft(page, '', '');
    const none = answerConfirm(page, true);
    await page.keyboard.press('Escape'); // 빈 초안이면 묻지 않음
    assert.equal(none.asked, 0);
    await openDetail(page, B);
    await expectDraft(page, '', '');
  } finally { await app.browser.close(); }
});

test('U02 공백만 적은 경우는 묻지 않고, 편집 폼의 기존 경고는 유지', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const { page } = app;
  try {
    await openDetail(page, A);
    await page.fill('#newQuote', '   ');
    const log = answerConfirm(page, false);
    await page.keyboard.press('Escape');
    assert.equal(log.asked, 0);
    assert.equal(await page.$('#dialog .modal'), null);

    await page.click('[data-action="add"]');
    await page.waitForSelector('#bookform');
    await page.fill('#title', '합성 새 책');
    await page.keyboard.press('Escape');
    assert.equal(log.asked, 1, '편집 폼 경고');
    assert.ok(await page.$('#bookform'), '취소하면 폼 유지');
    assert.equal(await page.inputValue('#title'), '합성 새 책');
  } finally { await app.browser.close(); }
});

test('beforeunload: 초안이 있을 때만 이탈 확인', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const { page } = app;
  try {
    await openDetail(page, A);
    const fire = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    assert.equal(await fire(), false);
    await typeDraft(page);
    assert.equal(await fire(), true);
  } finally { await app.browser.close(); }
});

test('U01 AI 상징 응답(mock)이 도착해 다시 그려져도 입력 유지', async () => {
  const books = fixtureBooks().map(b => b.id === A ? { ...b, motifIdea: '종이학 — 합성 이유', motifDrawnFor: '', motif: 'auto' } : b);
  let answered = 0;
  const mock = async (route, u) => {
    if (u.hostname !== 'generativelanguage.googleapis.com') return false;
    await sleep(1200);
    answered++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>' }] }, finishReason: 'STOP' }] }) });
    return true;
  };
  const app = await openApp(srv.base, { books, mock, seed: { 'my-library-gemini-key-v1': 'AIza' + 'T'.repeat(35) } });
  const { page } = app;
  try {
    await openDetail(page, A); // v2.14.1: 책을 열기만 해서는 그리지 않음 → '상징 그리기'로 시작
    await typeDraft(page);
    await page.evaluate(() => { document.querySelector('#dialog .modal').__old = true; });
    await page.dispatchEvent('[data-action="retry-motif"]', 'click'); // 초점을 옮기지 않는 클릭
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(b => b.id === 'fx-done-rated').motifDrawnFor === '종이학 — 합성 이유', null, { timeout: 8000 });
    await sleep(200);
    assert.ok(answered >= 1, 'mock 응답을 받았어야 함');
    assert.equal(await page.evaluate(() => document.querySelector('#dialog .modal').__old), undefined, '상세 창이 실제로 다시 그려졌어야 함(갱신을 막지 않음)');
    await expectDraft(page);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'newQuotePage', '마지막으로 쓰던 칸에 초점 유지');
  } finally { await app.browser.close(); }
});

test('U01 동기화 응답(mock)으로 다른 책이 바뀌어 다시 그려져도 입력 유지', async () => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'none' })}.${b64({ sub: 'u-test', email: 'test@example.invalid', exp: 4102444800 })}.x`;
  const remote = { ...fixtureBooks().find(b => b.id === B), rating: 5 };
  let pulled = 0;
  const mock = async (route, u) => {
    if (!u.hostname.endsWith('supabase.co')) return false;
    const m = route.request().method();
    if (m === 'GET' && u.pathname === '/rest/v1/books') {
      await sleep(1200); pulled++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: B, data: remote, deleted: false, updated_at: '2026-10-28T01:00:00Z' }]) });
    } else await route.fulfill({ status: m === 'GET' ? 200 : 201, contentType: 'application/json', body: '[]' });
    return true;
  };
  const seed = {
    'my-library-auth-v1': JSON.stringify({ access_token: jwt, refresh_token: 'fake-refresh', expires_at: 4102444800, user: { id: 'u-test', email: 'test@example.invalid' } }),
    'my-library-sync-v1': JSON.stringify({ userId: 'u-test', lastPull: '2026-10-28T00:00:00Z', backupFor: 'u-test', cacheSeeded: 'u-test|k2', dirty: [], removed: [], keysDirty: [] }),
  };
  const app = await openApp(srv.base, { books: fixtureBooks(), seed, mock });
  const { page } = app;
  try {
    await openDetail(page, A);
    await typeDraft(page);
    await page.evaluate(() => { document.querySelector('#dialog .modal').__old = true; });
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('mnemosyne-library-v1')).find(b => b.id === id).rating === 5, B, { timeout: 8000 });
    await sleep(200);
    assert.equal(pulled, 1);
    assert.equal(await page.evaluate(() => document.querySelector('#dialog .modal').__old), undefined, '상세 창이 실제로 다시 그려졌어야 함(갱신을 막지 않음)');
    await expectDraft(page);
    assert.ok(app.external.every(h => /supabase\.co|googleapis\.com/.test(h)), '모든 바깥 요청은 mock 대상');
  } finally { await app.browser.close(); }
});

test('U11 키보드: 창 의미·배경 비활성화·Tab 순환·Esc 뒤 여는 버튼으로 초점 복귀', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const { page } = app;
  try {
    // 책등을 키보드로 열기
    await page.focus(`.spine[data-book="${A}"]`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#newQuote');
    const info = await page.evaluate(() => { const m = document.querySelector('#dialog .modal'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), label: document.getElementById(m.getAttribute('aria-labelledby'))?.textContent || '', focused: document.activeElement === m, inert: document.querySelector('#root>.app').inert && document.querySelector('#root>.mobile-nav').inert }; });
    assert.equal(info.role, 'dialog'); assert.equal(info.modal, 'true');
    assert.ok(info.label.length > 0, '창 제목 연결');
    assert.ok(info.focused, '처음 초점은 창');
    assert.ok(info.inert, '배경 비활성화');
    // Tab 40번: 초점이 창 밖으로 나가지 않음
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.querySelector('#dialog .modal').contains(document.activeElement)), `Tab ${i + 1}`);
    }
    // Shift+Tab: 첫 요소에서 마지막으로
    await page.evaluate(() => document.querySelector('#dialog .modal button.close').focus());
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => { const m = document.querySelector('#dialog .modal'); return m.contains(document.activeElement) && document.activeElement !== m.querySelector('button.close'); }));
    // 별점을 키보드로 고르면 다시 그린 뒤에도 그 별에 초점
    await page.focus('[data-rate="3"]');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.rate), '3');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.book), A, '책등으로 복귀');
    assert.equal(await page.evaluate(() => document.querySelector('#root>.app').inert), false);
    // + 책 추가 버튼으로 열고 닫기
    await page.focus('.topbuttons [data-action="add"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#bookform');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#dialog .modal')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'add', '추가 버튼으로 복귀');
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});
