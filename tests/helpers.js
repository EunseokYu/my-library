// 테스트 공통 도구 — 개발용. 배포 앱(index.html)은 이 파일을 쓰지 않습니다.
// - 저장소 루트를 http://127.0.0.1:<port>/my-library/ 로 서비스합니다(GitHub Pages 하위 경로와 같은 모양).
// - 바깥 주소(Supabase·카카오·Gemini·글꼴)는 모두 막고 기록만 합니다. 실제 계정·공유 기록을 건드리지 않습니다.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('/opt/npm-tools/node_modules/playwright'); } // 저장소에 node_modules가 없는 환경용

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'books.json');
const STORE_KEY = 'mnemosyne-library-v1'; // 앱과 같은 키. 바꾸지 말 것.
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith('/my-library/')) { res.writeHead(404); return res.end(); }
    let rel = url.slice('/my-library/'.length) || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, base: `http://127.0.0.1:${server.address().port}/my-library/` })));
}

function fixtureBooks() { return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).books; }

// 새 브라우저 페이지. books를 주면 앱이 열리기 전에 localStorage에 넣습니다(이 테스트 브라우저 안에서만).
// mock(route, url): 바깥 요청을 직접 처리하면 true. 처리하지 않은 바깥 요청은 막습니다.
// seed: { localStorage키: 값 } — 책 말고도 가짜 로그인 정보·합성 키 등을 넣을 때 씁니다.
async function openApp(base, { books = null, seed = {}, mock = null, width = 1440, height = 900 } = {}) {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', acceptDownloads: true });
  const external = [], errors = [];
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    external.push(u.hostname + u.pathname);
    if (mock && await mock(route, u)) return;
    return route.abort();
  });
  const all = { ...seed };
  if (books) all[STORE_KEY] = JSON.stringify(books);
  if (Object.keys(all).length) {
    await context.addInitScript(entries => {
      if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of entries) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); }
    }, Object.entries(all));
  }
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept()); // confirm() 기본 승인. 테스트별로 바꿀 수 있음.
  await page.goto(base);
  await page.waitForSelector('#root *');
  return { browser, context, page, external, errors };
}

const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), STORE_KEY);

module.exports = { startServer, openApp, fixtureBooks, stored, STORE_KEY, FIXTURE };
