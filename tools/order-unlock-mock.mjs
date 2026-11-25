#!/usr/bin/env node
/**
 * Mock the jiahao order gate in Chrome. Does not call the live API.
 *
 *   cd /tmp && npm install puppeteer-core
 *   NODE_PATH=/tmp/node_modules node tools/order-unlock-mock.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ORDER_HOST = 'snappy-tundra-7uesdvk-zengpenghui420-glitch.vercel.app';
const LEGACY_HOST = 'snappy-tundra-7uesdvk.tmp.now';
const ORDER = 'P102938475610293847';
const FULLWIDTH = 'Ｐ102938475610293848';
const FULLWIDTH_ID = 'P102938475610293848';
const BOUND = 'P564738291056473829';
const T1 = 'P192837465019283746';
const T2 = 'P019283746501928374';
const T3 = 'P657483920165748392';
const CODE_OK = 'JH7K2M';
const CODE_USED = 'JH9K2M';
const CODE_BAD = 'JH8K2M';
const SHOTS = '/opt/cursor/artifacts';

const state = {
  orders: new Map(),
  codes: new Map(),
  calls: [],
  hangPosts: 0,
  hangCommits: false,
  forcePost: null
};

function resetState(){
  state.orders = new Map();
  state.codes = new Map([
    [CODE_OK, {max:3, remaining:3}],
    [CODE_USED, {max:3, remaining:0}]
  ]);
  state.calls = [];
  state.hangPosts = 0;
  state.hangCommits = false;
  state.forcePost = null;
}

function cors(extra){
  return Object.assign({
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization,X-Device-Id,X-Fingerprint',
    'cache-control': 'no-store'
  }, extra || {});
}

function send(req, status, body){
  req.respond({
    status,
    contentType: 'application/json',
    headers: cors(),
    body: JSON.stringify(body)
  });
}

function orderView(rec, orderId){
  return {
    ok: true,
    remaining: rec.max - rec.uses,
    max: rec.max,
    uses: rec.uses,
    quiz: rec.quiz,
    orderId,
    bound: true,
    paidVerified: false
  };
}

function handleApi(req){
  const url = new URL(req.url());
  const method = req.method();
  if(method === 'OPTIONS'){
    req.respond({status: 204, headers: cors()});
    return;
  }
  const headers = req.headers();
  const device = headers['x-device-id'] || '';
  const base = {method, host: url.host, path: url.pathname, device, url: url.pathname + url.search};
  if(url.host === ORDER_HOST && url.pathname === '/order/get'){
    const quiz = url.searchParams.get('quiz');
    const orderId = url.searchParams.get('orderId');
    state.calls.push(Object.assign({kind: 'order-peek', quiz, orderId}, base));
    const rec = state.orders.get(orderId);
    if(!rec) return send(req, 404, {ok: false, error: 'not_found'});
    if(rec.quiz !== quiz) return send(req, 403, {ok: false, error: 'bound_other_quiz'});
    return send(req, 200, orderView(rec, orderId));
  }
  if(url.host === ORDER_HOST && url.pathname === '/order/redeem' && method === 'POST'){
    let body = {};
    try{body = JSON.parse(req.postData() || '{}')}catch(e){body = {}}
    const quiz = body.quiz;
    const orderId = body.orderId;
    state.calls.push(Object.assign({kind: 'order-redeem', quiz, orderId, body}, base));
    if(state.hangPosts > 0){
      state.hangPosts -= 1;
      const rec = state.orders.get(orderId) || {quiz, uses: 0, max: 3};
      if(state.hangCommits){
        if(rec.quiz === quiz && rec.uses < rec.max) rec.uses += 1;
        state.orders.set(orderId, rec);
      }
      return;
    }
    if(state.forcePost === 'exhausted'){
      return send(req, 403, {ok: false, error: 'exhausted', remaining: 0, max: 3});
    }
    let rec = state.orders.get(orderId);
    if(!rec){
      rec = {quiz, uses: 0, max: 3};
      state.orders.set(orderId, rec);
    }
    if(rec.quiz !== quiz) return send(req, 403, {ok: false, error: 'bound_other_quiz'});
    if(rec.uses >= rec.max) return send(req, 403, {ok: false, error: 'exhausted', remaining: 0, max: 3});
    rec.uses += 1;
    return send(req, 200, orderView(rec, orderId));
  }
  if(url.host === LEGACY_HOST && url.pathname === '/get' && method === 'GET'){
    const quiz = url.searchParams.get('quiz');
    const code = url.searchParams.get('code');
    state.calls.push(Object.assign({kind: 'code-peek', quiz, code}, base));
    const rec = state.codes.get(code);
    if(!rec) return send(req, 404, {ok: false, error: 'not_found'});
    return send(req, 200, {ok: true, remaining: rec.remaining, max: rec.max, quiz});
  }
  if(url.host === LEGACY_HOST && url.pathname === '/redeem' && method === 'POST'){
    let body = {};
    try{body = JSON.parse(req.postData() || '{}')}catch(e){body = {}}
    state.calls.push(Object.assign({kind: 'code-redeem', quiz: body.quiz, code: body.code, body}, base));
    const rec = state.codes.get(body.code);
    if(!rec) return send(req, 404, {ok: false, error: 'not_found'});
    if(rec.remaining <= 0) return send(req, 403, {ok: false, error: 'exhausted', remaining: 0, max: rec.max});
    rec.remaining -= 1;
    return send(req, 200, {ok: true, remaining: rec.remaining, max: rec.max});
  }
  state.calls.push(Object.assign({kind: 'unexpected'}, base));
  return send(req, 500, {ok: false, error: 'unexpected'});
}

function attach(page){
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('request', req => {
    const url = req.url();
    let host = '';
    try{host = new URL(url).host}catch(e){host = ''}
    if(host === ORDER_HOST || host === LEGACY_HOST){
      handleApi(req);
      return;
    }
    req.continue();
  });
  return errors;
}

function assert(cond, msg){
  if(!cond) throw new Error(msg);
}

function ofKind(list, kind){return list.filter(c => c.kind === kind)}

async function openModal(page){
  await page.click('#btnStart');
  await page.waitForSelector('.code-mask.show', {timeout: 4000});
}

async function submit(page, value){
  await openModal(page);
  await page.$eval('#codeInput', el => {el.value = ''});
  await page.type('#codeInput', value);
  await page.click('#btnCodeOk');
}

async function waitQuiz(page){
  await page.waitForSelector('#quiz.active', {timeout: 8000});
}

async function answerOne(page, value){
  await page.waitForSelector('#quiz.active .opt', {timeout: 8000});
  const before = await page.$eval('#qprog', el => el.textContent);
  await page.evaluate(v => {
    const btn = [...document.querySelectorAll('#opts .opt')].find(b => b.querySelector('.onum') && b.querySelector('.onum').textContent === String(v));
    if(!btn) throw new Error('missing choice');
    btn.click();
  }, value);
  await page.waitForFunction(prev => {
    const quiz = document.getElementById('quiz').classList.contains('active');
    const result = document.getElementById('result').classList.contains('active');
    const loading = document.getElementById('loading').classList.contains('active');
    return result || loading || (quiz && document.getElementById('qprog').textContent !== prev);
  }, {timeout: 4000}, before);
}

async function answerAll(page){
  for(let i = 0; i < 18; i++) await answerOne(page, 5);
  await page.waitForSelector('#result.active', {timeout: 8000});
}

async function toastText(page){
  await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'), {timeout: 8000});
  return page.$eval('#toast', el => el.textContent);
}

async function overflow(page){
  return page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }));
}

function assertNoX(box){
  assert(box.sw <= box.cw + 1, 'horizontal overflow ' + box.sw + '>' + box.cw);
}

async function shot(page, name){
  fs.mkdirSync(SHOTS, {recursive: true});
  await page.screenshot({path: path.join(SHOTS, name), fullPage: true});
}

function sourceContract(){
  assert(HTML.includes("const API_BASE='https://snappy-tundra-7uesdvk-zengpenghui420-glitch.vercel.app'"), 'API_BASE');
  assert(HTML.includes("const LEGACY_API_BASE='https://snappy-tundra-7uesdvk.tmp.now'"), 'legacy host');
  assert(HTML.includes("const QUIZ_KEY='jiahao'"), 'quiz key');
  assert(HTML.includes("LEGACY_API_BASE+'/get?quiz='"), 'legacy peek path');
  assert(HTML.includes("LEGACY_API_BASE+'/redeem'"), 'legacy redeem path');
  assert(HTML.includes("API_BASE+'/order/redeem'"), 'order redeem path');
  assert(HTML.includes("API_BASE+'/order/get?quiz='"), 'order peek path');
  assert(HTML.includes('进群或进门之前，你会先在心里排一句「够酷」的开场'), 'question copy');
  assert(HTML.includes('赛级嘉豪苗子'), 'tier copy');
  assert(!HTML.includes('mantledb'), 'no Mantle');
  assert(!HTML.includes('已有验证码'), 'no code advertisement');
  assert(!HTML.includes('验证付款'), 'no payment check copy');
  assert(!HTML.includes('paidVerified'), 'paid flag is not rendered');
  assert(HTML.includes('到小红书「我的订单」复制订单号贴过来。每个订单号可以测 3 次。'), 'order hint');
  const script = HTML.match(/<script>([\s\S]*)<\/script>/)[1];
  fs.writeFileSync('/tmp/jiahao-script.js', script);
}

async function bootPage(browser, width){
  resetState();
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors = attach(page);
  await page.setRequestInterception(true);
  await page.setViewport({width, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
  await page.goto('http://127.0.0.1:' + serverPort + '/', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#btnStart');
  return {page, errors};
}

function assertClean(errors){
  const bad = state.calls.filter(c => c.kind === 'unexpected');
  assert(bad.length === 0, 'unexpected requests ' + JSON.stringify(bad));
  assert(errors.length === 0, 'page errors ' + errors.join('\n'));
}
async function clickForToast(page, selector){
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await page.click(selector);
  return toastText(page);
}

let serverPort = 0;

async function main(){
  sourceContract();
  const server = http.createServer((req, res) => {
    const file = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    const full = path.join(ROOT, decodeURIComponent(file));
    if(!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()){
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, {'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'});
    fs.createReadStream(full).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  serverPort = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const report = [];
  async function run(name, fn){
    try{
      await fn();
      report.push('PASS ' + name);
      console.log('PASS ' + name);
    }catch(err){
      report.push('FAIL ' + name + ' — ' + err.message);
      console.error('FAIL ' + name);
      console.error(err);
    }
  }

  await run('layout 320 and 390', async () => {
    for(const width of [320, 390]){
      const {page, errors} = await bootPage(browser, width);
      assertNoX(await overflow(page));
      await shot(page, 'jiahao-' + width + '-start.png');
      const startText = await page.$eval('#start', el => el.innerText);
      assert(!startText.includes('验证码'), 'start advertises codes');
      assert(startText.includes('开始测试'), 'start button');
      assert(startText.includes('嘉豪浓度测试'), 'product title');
      await openModal(page);
      await page.$eval('#codeInput', el => {el.value = 'P102938475610293847'});
      const panel = await page.$eval('.code-panel', el => el.innerText);
      assert(panel.includes('输入订单号'), 'modal title');
      assert(panel.includes('我的订单'), 'xiaohongshu copy');
      assert(panel.includes('3 次'), 'three uses');
      assert(!panel.includes('验证码'), 'modal advertises codes');
      assert(!panel.includes('验证付款'), 'modal says payment');
      assert(!panel.includes('付款'), 'modal says paid');
      const fit = await page.$eval('#codeInput', el => ({sw: el.scrollWidth, cw: el.clientWidth}));
      assert(fit.sw <= fit.cw + 1, 'order id clipped ' + width + ' ' + JSON.stringify(fit));
      assertNoX(await overflow(page));
      await shot(page, 'jiahao-' + width + '-modal.png');
      await page.click('#btnCodeOk');
      await waitQuiz(page);
      assertNoX(await overflow(page));
      await shot(page, 'jiahao-' + width + '-quiz.png');
      const posts = ofKind(state.calls, 'order-redeem');
      assert(posts.length === 1, 'layout redeem count');
      assert(posts[0].quiz === 'jiahao' && posts[0].orderId === ORDER, 'layout quiz/order');
      assert(posts[0].host === ORDER_HOST, 'layout host');
      assert(posts[0].device && posts[0].device.length >= 8, 'device header');
      assertClean(errors);
      await page.close();
    }
  });

  await run('first redeem, refresh, continue', async () => {
    const {page, errors} = await bootPage(browser, 390);
    const mark = state.calls.length;
    await submit(page, 'p102938475610293847');
    await waitQuiz(page);
    const first = state.calls.slice(mark);
    assert(ofKind(first, 'order-redeem').length === 1, 'first post ' + JSON.stringify(first));
    assert(ofKind(first, 'order-peek').length === 1, 'peek before redeem');
    assert(ofKind(first, 'code-redeem').length === 0, 'order used code path');
    assert(first.every(c => c.host === ORDER_HOST), 'order host only');
    assert(JSON.stringify(ofKind(first, 'order-redeem')[0].body) === JSON.stringify({quiz: 'jiahao', orderId: ORDER}), 'redeem body');
    const q1 = await page.$eval('#qtext', el => el.textContent);
    assert((await page.$eval('#qprog', el => el.textContent)) === '1 / 18', 'starts at 1');
    await answerOne(page, 4);
    await page.waitForFunction(() => document.getElementById('qprog').textContent === '2 / 18');
    const q2 = await page.$eval('#qtext', el => el.textContent);
    const beforeReload = state.calls.length;
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => document.getElementById('quiz').classList.contains('active') && document.getElementById('qprog').textContent === '2 / 18');
    const mid = state.calls.slice(beforeReload);
    assert(ofKind(mid, 'order-redeem').length === 0, 'mid refresh redeemed');
    assert(ofKind(mid, 'order-peek').length === 1, 'mid refresh peek ' + JSON.stringify(mid));
    assert((await page.$eval('#qtext', el => el.textContent)) === q2, 'resumed question');
    await page.click('#qback');
    await page.waitForFunction(() => document.getElementById('qprog').textContent === '1 / 18');
    assert((await page.$eval('#qtext', el => el.textContent)) === q1, 'back to first');
    await page.click('#qback');
    await page.waitForSelector('#start.active');
    const beforeContinue = state.calls.length;
    await page.click('#btnStart');
    await page.waitForFunction(() => document.getElementById('quiz').classList.contains('active') && document.getElementById('qprog').textContent === '1 / 18');
    const cont = state.calls.slice(beforeContinue);
    assert(ofKind(cont, 'order-redeem').length === 0, 'continue redeemed');
    assert(ofKind(cont, 'order-peek').length === 1, 'continue peek');
    assert((await page.$eval('#qtext', el => el.textContent)) === q1, 'continue same question');
    assert(state.orders.get(ORDER).uses === 1, 'uses stayed 1');
    assertClean(errors);
    await page.close();
  });

  await run('result refresh, retest, fourth reject', async () => {
    const {page, errors} = await bootPage(browser, 390);
    await submit(page, ORDER);
    await waitQuiz(page);
    await answerAll(page);
    const index = await page.$eval('.index-num', el => el.textContent.trim());
    const name = await page.$eval('#typeTitle', el => el.textContent.trim());
    assert(index === '61', 'concentration ' + index);
    assert(name === '赛级嘉豪苗子', 'tier ' + name);
    assert(state.orders.get(ORDER).uses === 1, 'uses after first finish');
    const beforeReload = state.calls.length;
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#result.active', {timeout: 8000});
    const refreshed = state.calls.slice(beforeReload);
    assert(ofKind(refreshed, 'order-redeem').length === 0, 'result refresh redeemed');
    assert(ofKind(refreshed, 'order-peek').length === 1, 'result refresh peek');
    assert((await page.$eval('.index-num', el => el.textContent.trim())) === '61', 'result kept');
    const stored = await page.evaluate(() => localStorage.getItem('jiahao_last_result'));
    assert(stored && stored.includes('"concentration":61'), 'stored result ' + stored);
    state.forcePost = 'exhausted';
    const denied = await clickForToast(page, '#btnRetry');
    assert(denied.includes('3 次已经用完了'), 'post exhausted toast ' + denied);
    assert((await page.$eval('.index-num', el => el.textContent.trim())) === '61', 'result after post reject');
    state.forcePost = null;
    state.orders.get(ORDER).uses = 3;
    const beforeFourth = state.calls.length;
    const fourth = await clickForToast(page, '#btnRetry');
    assert(fourth.includes('3 次已经用完了'), 'fourth toast ' + fourth);
    const fourthCalls = state.calls.slice(beforeFourth);
    assert(ofKind(fourthCalls, 'order-redeem').length === 0, 'fourth still posted');
    assert(ofKind(fourthCalls, 'order-peek').length === 1, 'fourth peeks');
    assert((await page.$eval('.index-num', el => el.textContent.trim())) === '61', 'fourth kept result');
    assert(state.orders.get(ORDER).uses === 3, 'uses not increased');
    const still = await page.evaluate(() => localStorage.getItem('jiahao_last_result'));
    assert(still === stored, 'local result wiped');
    const viewed = await clickForToast(page, '#btnViewLast');
    assert(viewed.includes('不扣次'), 'local last ' + viewed);
    assert((await page.$eval('.index-num', el => el.textContent.trim())) === '61', 'local last score');
    assert(ofKind(state.calls.slice(beforeFourth), 'order-redeem').length === 0, 'view last redeemed');
    await shot(page, 'jiahao-390-result.png');
    await page.setViewport({width: 320, height: 780, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
    assertNoX(await overflow(page));
    await shot(page, 'jiahao-320-result.png');
    assertClean(errors);
    await page.close();
  });

  await run('retest deducts a new attempt', async () => {
    const {page, errors} = await bootPage(browser, 390);
    await submit(page, ORDER);
    await waitQuiz(page);
    await answerAll(page);
    const before = state.calls.length;
    await page.click('#btnRetry');
    await waitQuiz(page);
    const again = state.calls.slice(before);
    assert(ofKind(again, 'order-redeem').length === 1, 'retest post');
    assert(ofKind(again, 'order-peek').length === 1, 'retest peek');
    assert(state.orders.get(ORDER).uses === 2, 'uses 2');
    assert((await page.$eval('#qprog', el => el.textContent)) === '1 / 18', 'new attempt');
    assertClean(errors);
    await page.close();
  });

  await run('invalid order and wrong binding', async () => {
    const {page, errors} = await bootPage(browser, 390);
    await page.evaluate(() => localStorage.setItem('jiahao_last_result', JSON.stringify({F:10,E:10,S:10,C:10,U:10,R:10,concentration:10,name:'x'})));
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForSelector('#btnLast:not([hidden])');
    await openModal(page);
    const samples = ['P111111111111111111', 'P123456789012345678', 'P1234567890123', 'hello'];
    for(const sample of samples){
      const before = state.calls.length;
      await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
      await page.$eval('#codeInput', el => {el.value = ''});
      await page.type('#codeInput', sample);
      await page.click('#btnCodeOk');
      const msg = await toastText(page);
      assert(msg.includes('订单号格式不对'), sample + ' ' + msg);
      assert(state.calls.length === before, sample + ' hit the network');
      assert(!(await page.$eval('#quiz', el => el.classList.contains('active'))), sample + ' opened quiz');
    }
    state.orders.set(BOUND, {quiz: 'bazi', uses: 1, max: 3});
    const before = state.calls.length;
    await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
    await page.$eval('#codeInput', el => {el.value = ''});
    await page.type('#codeInput', BOUND);
    await page.click('#btnCodeOk');
    const msg = await toastText(page);
    assert(msg.includes('别的测试'), msg);
    const calls = state.calls.slice(before);
    assert(ofKind(calls, 'order-peek').length === 1, 'bound peek');
    assert(ofKind(calls, 'order-redeem').length === 0, 'bound redeemed');
    assert(ofKind(calls, 'order-peek')[0].quiz === 'jiahao', 'bound request quiz');
    assert(!(await page.$eval('#quiz', el => el.classList.contains('active'))), 'bound opened quiz');
    await page.click('#codeClose');
    const viewed = await clickForToast(page, '#btnLast');
    assert(viewed.includes('不扣次'), 'last after bind ' + viewed);
    assert((await page.$eval('.index-num', el => el.textContent.trim())) === '23', 'last score');
    const shown = await page.$eval('#result', el => el.classList.contains('active'));
    assert(shown, 'last result hidden');
    assertClean(errors);
    await page.close();
  });

  await run('timeout reconcile', async () => {
    const {page, errors} = await bootPage(browser, 390);
    await page.evaluate(() => {globalThis.__ORDER_TIMEOUT_MS = 250; globalThis.__ORDER_RECONCILE_MS = 20});
    state.hangPosts = 1;
    state.hangCommits = true;
    await submit(page, T1);
    await waitQuiz(page);
    assert(ofKind(state.calls, 'order-redeem').length === 1, 'committed timeout posted once');
    assert(state.orders.get(T1).uses === 1, 'committed uses');
    assertClean(errors);
    await page.close();

    const second = await bootPage(browser, 390);
    await second.page.evaluate(() => {globalThis.__ORDER_TIMEOUT_MS = 250; globalThis.__ORDER_RECONCILE_MS = 20});
    state.hangPosts = 1;
    state.hangCommits = false;
    await submit(second.page, T2);
    await waitQuiz(second.page);
    assert(ofKind(state.calls, 'order-redeem').length === 2, 'uncommitted timeout retried once');
    assert(state.orders.get(T2).uses === 1, 'retry uses');
    assertClean(second.errors);
    await second.page.close();

    const third = await bootPage(browser, 390);
    await third.page.evaluate(() => {globalThis.__ORDER_TIMEOUT_MS = 250; globalThis.__ORDER_RECONCILE_MS = 20});
    state.hangPosts = 5;
    state.hangCommits = false;
    await submit(third.page, T3);
    const msg = await toastText(third.page);
    assert(msg.includes('暂时验证不了'), msg);
    assert(ofKind(state.calls, 'order-redeem').length === 2, 'stopped after two posts ' + ofKind(state.calls, 'order-redeem').length);
    assert(!state.orders.has(T3), 'uncommitted order created');
    assert(!(await third.page.$eval('#quiz', el => el.classList.contains('active'))), 'timeout opened quiz');
    assertClean(third.errors);
    await third.page.close();
    assertClean(errors);
  });

  await run('legacy code path', async () => {
    const {page, errors} = await bootPage(browser, 390);
    await submit(page, 'jh7k2m');
    await waitQuiz(page);
    const posts = ofKind(state.calls, 'code-redeem');
    assert(posts.length === 1, 'code posts');
    assert(posts[0].host === LEGACY_HOST, 'legacy host ' + posts[0].host);
    assert(posts[0].path === '/redeem', 'legacy path');
    assert(JSON.stringify(posts[0].body) === JSON.stringify({quiz: 'jiahao', code: CODE_OK}), 'code body');
    assert(!posts[0].device, 'legacy sent device header');
    assert(ofKind(state.calls, 'order-redeem').length === 0, 'code used order redeem');
    assert(ofKind(state.calls, 'code-peek').length === 0, 'unlock peeked a code');
    assert(state.codes.get(CODE_OK).remaining === 2, 'code remaining');
    await page.click('#qback');
    await page.waitForSelector('#start.active');
    const before = state.calls.length;
    await page.click('#btnStart');
    await waitQuiz(page);
    assert(state.calls.length === before, 'unlocked code session redeemed again');
    await page.close();

    const bad = await bootPage(browser, 390);
    await submit(bad.page, CODE_BAD);
    assert((await toastText(bad.page)).includes('验证码不正确'), 'invalid code toast');
    assert(ofKind(state.calls, 'code-redeem')[0].host === LEGACY_HOST, 'invalid still legacy');
    assert(!(await bad.page.$eval('#quiz', el => el.classList.contains('active'))), 'bad code entered');
    await bad.page.close();

    const used = await bootPage(browser, 390);
    await submit(used.page, CODE_USED);
    assert((await toastText(used.page)).includes('此验证码已用完'), 'exhausted code toast');
    assert(!(await used.page.$eval('#quiz', el => el.classList.contains('active'))), 'used code entered');
    assertClean(used.errors);
    assertClean(bad.errors);
    assertClean(errors);
    await used.page.close();
  });

  await run('fullwidth order id', async () => {
    const {page, errors} = await bootPage(browser, 390);
    await submit(page, FULLWIDTH);
    await waitQuiz(page);
    const post = ofKind(state.calls, 'order-redeem')[0];
    assert(post.orderId === FULLWIDTH_ID, 'normalized ' + post.orderId);
    assert(post.quiz === 'jiahao', 'quiz');
    assertClean(errors);
    await page.close();
  });

  await browser.close();
  server.close();
  const failed = report.filter(line => line.startsWith('FAIL'));
  console.log(report.join('\n'));
  if(failed.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
