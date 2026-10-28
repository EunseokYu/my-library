// T3 (U03·U04·U07·U10) — 등록과 기록을 짧게. 실행: npm test
// 카카오·Gemini는 가짜 응답(mock), 데이터는 합성 fixture만 씁니다.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, openApp, fixtureBooks, stored } = require('./helpers');

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.server.close());

const A = 'fx-done-rated';
const KAKAO = { 'my-library-kakao-key-v1': '0123456789abcdef0123456789abcdef' }; // 합성 값(형식만 맞춤)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const doc = (title, author, publisher, isbn, translator = '') => ({ title, authors: [author], translators: translator ? [translator] : [], publisher, isbn: `${isbn.slice(3, 13)} ${isbn}`, contents: `${title} 합성 소개`, thumbnail: '' });
const kakaoMock = docs => async (route, u) => {
  if (u.hostname !== 'dapi.kakao.com') return false;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ documents: docs, meta: { total_count: docs.length, pageable_count: docs.length, is_end: true } }) });
  return true;
};
function answerConfirm(page, accept) {
  const log = { asked: 0 };
  page.removeAllListeners('dialog');
  page.on('dialog', d => { log.asked++; accept ? d.accept() : d.dismiss(); });
  return log;
}
const openAdd = async p => { await p.click('.topbuttons [data-action="add"]'); await p.waitForSelector('#bookform'); };
const visible = (p, sel) => p.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }, sel);

test('U03 기본 폼: 검색·제목·저자·평점·감상만 펼쳐져 있고 나머지 세 칸은 접혀 있음', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    await openAdd(p);
    const st = await p.evaluate(() => ({
      sections: [...document.querySelectorAll('#bookform details.formsection')].map(d => [d.dataset.sec, d.open]),
      shown: ['apiQuery', 'title', 'author', 'rating', 'notes', 'notionUrl'].map(id => !!document.getElementById(id)?.checkVisibility()),
      hidden: ['workTitle', 'publisher', 'summary', 'tags', 'spineType', 'bookColor', 'motif'].map(id => !!document.getElementById(id)?.checkVisibility()),
      names: [...new FormData(document.getElementById('bookform')).keys()].sort(),
    }));
    assert.deepEqual(st.sections, [['edition', false], ['intro', false], ['design', false]]);
    assert.ok(st.shown.every(Boolean), '기본 칸이 보여야 함');
    assert.ok(st.hidden.every(x => !x), '접힌 칸은 보이지 않음');
    for (const n of ['status', 'editionTitle', 'googleBooksId', 'customMotif', 'motifIdea', 'motifDrawnFor', 'colorMode', 'publisher', 'summary', 'spineType'])
      assert.ok(st.names.includes(n), '접혀도 폼 값에 포함: ' + n);
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});

test('U03 모바일 390px: 저장 버튼이 항상 화면 안, 마지막 칸이 저장 줄에 가리지 않음', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks(), width: 390, height: 640 });
  const p = app.page;
  try {
    await openAdd(p);
    assert.ok(await visible(p, '#bookform button[type="submit"]'), '처음부터 저장 버튼이 보임');
    await p.click('#bookform details[data-sec="design"] > summary');
    await p.focus('#motif');
    await p.evaluate(() => document.querySelector('#dialog .modal').scrollTop = 99999);
    assert.ok(await visible(p, '#bookform button[type="submit"]'), '맨 아래로 내려도 저장 버튼이 보임');
    await p.evaluate(() => document.querySelector('#dialog .modal').scrollTop = 0);
    await p.focus('#notionUrl');
    await p.keyboard.type('x');
    const r = await p.evaluate(() => { const f = document.getElementById('notionUrl').getBoundingClientRect(), b = document.querySelector('.formactions').getBoundingClientRect(); return { fieldBottom: f.bottom, barTop: b.top }; });
    assert.ok(r.fieldBottom <= r.barTop + 1, `입력 칸(${r.fieldBottom})이 저장 줄(${r.barTop}) 위에 있어야 함`);
  } finally { await app.browser.close(); }
});

test('U03 접힌 칸 안의 값 오류는 그 칸을 열어 알려 줌', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    await openAdd(p);
    await p.fill('#title', '합성 오류 시험');
    await p.evaluate(() => { document.getElementById('pages').value = '99999'; }); // max 9999 초과
    await p.click('#bookform button[type="submit"]');
    assert.equal(await p.evaluate(() => document.querySelector('details[data-sec="edition"]').open), true);
    assert.ok(!(await stored(p)).some(b => b.title === '합성 오류 시험'), '저장되지 않음');
  } finally { await app.browser.close(); }
});

test('U03 판본 선택 등록(mock 검색) → 칸 요약 표시 → 저장', async () => {
  const docs = [doc('가상의 별', '합성 작가', '합성출판', '9790000000035', '합성 번역'), doc('가상의 별 (리커버 에디션)', '합성 작가', '다른출판', '9790000000042')];
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: KAKAO, mock: kakaoMock(docs) });
  const p = app.page;
  try {
    await openAdd(p);
    assert.equal(await p.$('.api-status'), null, '키가 있으면 연결 안내 없음');
    await p.fill('#apiQuery', '가상의 별');
    await p.click('[data-action="api-search"]');
    await p.click('[data-api-work="0"]');
    await p.click('[data-api-pick]');
    assert.equal(await p.inputValue('#publisher'), '합성출판');
    assert.match(await p.textContent('[data-hint="edition"]'), /합성출판/);
    await p.click('#bookform button[type="submit"]');
    const nb = (await stored(p)).find(b => b.isbn === '9790000000035');
    assert.ok(nb, '저장됨');
    assert.deepEqual([nb.title, nb.author, nb.publisher, nb.translator, nb.status], ['가상의 별', '합성 작가', '합성출판', '합성 번역', 'done']);
    assert.deepEqual(app.errors, []);
  } finally { await app.browser.close(); }
});

test('U03 기존 책 수정: 접힌 칸 값·숨은 값·감상·문장·AI 결과가 그대로 보존', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    const before = (await stored(p)).find(b => b.id === A);
    await p.click(`.spine[data-book="${A}"]`);
    await p.click('[data-action="edit"]');
    await p.waitForSelector('#bookform');
    assert.equal(await p.$('#notes'), null, '기존 책 수정 폼에는 감상 칸이 없음(상세에서 수정)');
    await p.fill('#author', '테스트 작가 2');
    await p.click('#bookform details[data-sec="edition"] > summary');
    await p.fill('#publisher', '바뀐출판');
    await p.click('#bookform button[type="submit"]');
    const after = (await stored(p)).find(b => b.id === A);
    assert.equal(after.author, '테스트 작가 2');
    assert.equal(after.publisher, '바뀐출판');
    for (const k of Object.keys(before)) if (!['author', 'publisher'].includes(k)) assert.deepEqual(after[k], before[k], k);
  } finally { await app.browser.close(); }
});

test('U04 상세에서 감상만 수정: 저장/취소, 평점 변경에도 초안 유지, 다른 필드 보존, 닫기 보호', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    const before = (await stored(p)).find(b => b.id === A);
    await p.click(`.spine[data-book="${A}"]`);
    await p.click('[data-action="edit-notes"]');
    assert.equal(await p.inputValue('#detailNotes'), before.notes);
    await p.fill('#detailNotes', '바꾼 감상');
    await p.dispatchEvent('[data-rate="1"]', 'click');
    assert.equal(await p.inputValue('#detailNotes'), '바꾼 감상', '평점 저장 뒤에도 감상 초안 유지');
    const no = answerConfirm(p, false);
    await p.keyboard.press('Escape');
    assert.equal(no.asked, 1, '저장하지 않은 감상이 있으면 닫기 전에 확인');
    await p.click('[data-action="cancel-notes"]');
    assert.equal((await stored(p)).find(b => b.id === A).notes, before.notes, '취소하면 그대로');
    await p.click('[data-action="edit-notes"]');
    await p.fill('#detailNotes', '바꾼 감상');
    await p.click('[data-action="save-notes"]');
    const after = (await stored(p)).find(b => b.id === A);
    assert.equal(after.notes, '바꾼 감상');
    assert.equal(after.rating, 1);
    for (const k of ['aiSummary', 'summary', 'quotes', 'motifIdea', 'motifDrawnFor', 'publisher', 'color', 'tags', 'aiTags', 'createdAt']) assert.deepEqual(after[k], before[k], k);
    assert.equal(await p.$('#detailNotes'), null, '저장 뒤 보기 상태');
    assert.match(await p.textContent('.detailnotes'), /바꾼 감상/);
    const none = answerConfirm(p, false);
    await p.keyboard.press('Escape');
    assert.equal(none.asked, 0, '저장 뒤에는 묻지 않음');
  } finally { await app.browser.close(); }
});

test('U04 문장 수정: id·createdAt 유지, 빈 문장은 저장 거부, 저장 실패 시 초안 유지', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    const q0 = (await stored(p)).find(b => b.id === A).quotes[0];
    await p.click(`.spine[data-book="${A}"]`);
    await p.click('[data-action="edit-quote"][data-qid="fx-q1"]');
    await p.fill('#qtext-fx-q1', '');
    await p.click('[data-action="save-quote"][data-qid="fx-q1"]');
    assert.equal((await stored(p)).find(b => b.id === A).quotes[0].text, q0.text, '빈 문장은 저장하지 않음');
    await p.fill('#qtext-fx-q1', '고친 합성 문장');
    await p.fill('#qpage-fx-q1', '13');
    await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'mnemosyne-library-v1' && window.__fail) throw new Error('가짜 실패'); return o.call(this, k, v); }; window.__fail = true; });
    await p.click('[data-action="save-quote"][data-qid="fx-q1"]');
    assert.equal(await p.inputValue('#qtext-fx-q1'), '고친 합성 문장', '실패하면 초안 유지');
    await p.evaluate(() => { window.__fail = false; });
    await p.click('[data-action="save-quote"][data-qid="fx-q1"]');
    const qs = (await stored(p)).find(b => b.id === A).quotes;
    assert.deepEqual(qs[0], { ...q0, text: '고친 합성 문장', page: '13' });
    assert.equal(qs.length, 2);
  } finally { await app.browser.close(); }
});

test('U07 중복 안내: 판본 선택 직후·직접 입력 확정 시 안내 → 기존 기록 열기, 저장 직전 검사 유지', async () => {
  const docs = [doc('가상의 강', '테스트 작가', '세번째출판', '9790000000059')];
  const app = await openApp(srv.base, { books: fixtureBooks(), seed: KAKAO, mock: kakaoMock(docs) });
  const p = app.page;
  try {
    await openAdd(p);
    await p.fill('#apiQuery', '가상의 강');
    await p.click('[data-action="api-search"]');
    await p.click('[data-api-work="0"]');
    await p.click('[data-api-pick]');
    assert.match(await p.textContent('#dupNotice'), /이미 서재에 있는 작품/);
    await p.click('#bookform button[type="submit"]');
    assert.equal((await stored(p)).length, 6, '저장 직전 검사로 막힘');
    const yes = answerConfirm(p, true);
    await p.click('[data-action="open-existing"]');
    assert.equal(yes.asked, 1, '작성 중인 폼을 떠나기 전에 확인');
    await p.waitForSelector('#newQuote');
    assert.match(await p.textContent('#dialog h2'), /가상의 강/);
    await p.keyboard.press('Escape');

    await openAdd(p);
    await p.fill('#title', '가상의 강 2');
    await p.fill('#author', '테스트 작가');
    await p.press('#author', 'Tab'); // 확정(blur → change)
    assert.match(await p.textContent('#dupNotice'), /가상의 강/);
    await p.fill('#author', '전혀 다른 작가');
    await p.press('#author', 'Tab');
    assert.equal((await p.textContent('#dupNotice')).trim(), '', '다른 저자면 안내 없음');
  } finally { await app.browser.close(); }
});

test('U10 검색 미연결: 안내 → 설정 이동 → 키 저장 → 작성하던 책으로 돌아가기(초안·검색어 보존)', async () => {
  const app = await openApp(srv.base, { books: fixtureBooks() });
  const p = app.page;
  try {
    await openAdd(p);
    assert.match(await p.textContent('.api-status'), /연결되지 않았어요/);
    await p.fill('#apiQuery', '가상의 탑');
    await p.click('[data-action="api-search"]');
    assert.match(await p.textContent('#api-results'), /제목만 적어 저장/);
    await p.fill('#title', '가상의 탑');
    await p.selectOption('#rating', '3');
    await p.fill('#notes', '설정 다녀와도 남는 감상');
    await p.click('#bookform details[data-sec="design"] > summary');
    await p.check('#lifeBook');
    const unload = () => p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    await p.click('[data-action="connect-search"]');
    assert.equal(await p.$('#bookform'), null);
    assert.equal(await p.evaluate(() => document.activeElement?.id), 'gb-key', '키 칸으로 이동');
    assert.equal(await unload(), true, '보관 중인 초안이 있으면 이탈 경고');
    await p.fill('#gb-key', '0123456789abcdef0123456789abcdef');
    await p.click('[data-action="save-key"]');
    await p.click('[data-action="resume-add"]');
    await p.waitForSelector('#bookform');
    assert.deepEqual([await p.inputValue('#apiQuery'), await p.inputValue('#title'), await p.inputValue('#rating'), await p.inputValue('#notes'), await p.isChecked('#lifeBook')], ['가상의 탑', '가상의 탑', '3', '설정 다녀와도 남는 감상', true]);
    assert.equal(await p.$('.api-status'), null, '키를 저장했으니 안내가 사라짐');
    await p.click('#bookform button[type="submit"]');
    const nb = (await stored(p)).find(b => b.title === '가상의 탑');
    assert.ok(nb); assert.deepEqual([nb.rating, nb.notes, nb.lifeBook], [3, '설정 다녀와도 남는 감상', true]);
    assert.equal(await unload(), false);
  } finally { await app.browser.close(); }
});

test('AI 정리 실패(mock 500)여도 책 저장은 성공으로 표시', async () => {
  const mock = async (route, u) => {
    if (u.hostname !== 'generativelanguage.googleapis.com') return false;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: '가짜 서버 오류' } }) });
    return true;
  };
  const app = await openApp(srv.base, { books: fixtureBooks(), mock, seed: { 'my-library-gemini-key-v1': 'AIza' + 'T'.repeat(35) } });
  const p = app.page;
  try {
    await openAdd(p);
    await p.fill('#title', '합성 AI 실패 책');
    await p.fill('#notes', '합성 감상');
    await p.click('#bookform button[type="submit"]');
    assert.match(await p.textContent('.toast'), /새 책을 추가했어요/);
    assert.ok((await stored(p)).some(b => b.title === '합성 AI 실패 책'));
    await p.waitForFunction(() => /책은 저장됐어요/.test(document.querySelector('.toast')?.textContent || ''), null, { timeout: 15000 });
    assert.equal((await stored(p)).filter(b => b.title === '합성 AI 실패 책').length, 1, '중복 생성 없음');
  } finally { await app.browser.close(); }
});
