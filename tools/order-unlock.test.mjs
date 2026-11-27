#!/usr/bin/env node
// Order-unlock checks for this quiz. Synthetic ids only.
// Chrome pins the vault, Vercel, and Mantle hosts to 127.0.0.1 so a missed
// mock cannot redeem a real order or an issued code.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire('/tmp/ppt/package.json');
const puppeteer = require('puppeteer-core');

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const VERCEL_HOST = 'snappy-tundra-7uesdvk-zengpenghui420-glitch.vercel.app';
const VAULT_HOST = 'snappy-tundra-7uesdvk.tmp.now';
const ORDER = 'P847291038475610293';
const ORDER_B = 'P102938475610293847';
const CODE = 'JH7K2M';
const PORT = 8941;
const BASE = `http://127.0.0.1:${PORT}/`;
const ART = '/opt/cursor/artifacts';

function patternError(id) {
  if (!/^P\d{18}$/.test(id)) return 'shape';
  const d = id.slice(1);
  for (const size of [1, 2, 3, 6, 9]) {
    if (d.slice(0, size).repeat(d.length / size) === d) return 'repeat';
  }
  const step = (d.charCodeAt(1) - d.charCodeAt(0) + 10) % 10;
  if (step === 1 || step === 9) {
    let seq = true;
    for (let i = 1; i < d.length; i++) {
      if ((d.charCodeAt(i) - d.charCodeAt(i - 1) + 10) % 10 !== step) seq = false;
    }
    if (seq) return 'sequence';
  }
  return '';
}
if (patternError(ORDER) || patternError(ORDER_B)) throw new Error('synthetic order is not a legal id');
if (!/^JH[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(CODE)) throw new Error('synthetic code shape');

function assertSource() {
  const banned = [
    'soft_persimmon_order_uses',
    '/order/redeem',
    '/order/get',
    'vercel.app',
    'mantledb',
    '暂时验证不了',
    '次数已经用完',
    'local-only',
    'cosmetic',
  ];
  for (const item of banned) {
    if (HTML.includes(item)) throw new Error('page contains ' + item);
  }
  const need = [
    "ORDER_USES_KEY='jiahao_order_uses'",
    "const QUIZ_KEY='jiahao'",
    'https://snappy-tundra-7uesdvk.tmp.now',
    "LEGACY_API_BASE+'/redeem'",
    '输入订单号',
    '每个订单号可以测 3 次',
    '进群或进门之前，你会先在心里排一句「够酷」的开场',
    '赛级嘉豪苗子',
    'paidVerified:false',
  ];
  for (const item of need) {
    if (!HTML.includes(item)) throw new Error('page missing ' + item);
  }
}
assertSource();

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type,Authorization,X-Device-Id,X-Fingerprint,X-Mantle-Key',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json',
};

function freshState() {
  return {
    vaultMode: 'ok',
    vaultPosts: 0,
    vaultGets: 0,
    mantleGets: 0,
    mantleDecr: 0,
    mantleIncr: 0,
    bodies: [],
    urls: [],
    unexpected: [],
  };
}

async function send(req, status, obj) {
  await req.respond({ status, headers: CORS, body: JSON.stringify(obj) });
}

async function handleVault(req, u, state) {
  if (req.method() === 'OPTIONS') {
    await req.respond({ status: 204, headers: CORS, body: '' });
    return;
  }
  state.urls.push(req.method() + ' ' + u.pathname + u.search);
  if (u.pathname === '/redeem' && req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    state.bodies.push(body);
    state.vaultPosts++;
    if (state.vaultMode === 'down') {
      await req.abort('failed');
      return;
    }
    if (state.vaultMode === 'not_found') return send(req, 404, { ok: false, error: 'not_found' });
    if (state.vaultMode === 'exhausted') return send(req, 403, { ok: false, error: 'exhausted' });
    return send(req, 200, { ok: true, remaining: 2, max: 3 });
  }
  if (u.pathname === '/get' && req.method() === 'GET') {
    state.vaultGets++;
    return send(req, 200, { ok: true, remaining: 2, max: 3 });
  }
  state.unexpected.push('vault ' + req.method() + ' ' + u.pathname);
  await req.abort('failed');
}

async function arm(page, state) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      const u = new URL(req.url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
        await req.continue();
        return;
      }
      const path = u.pathname;
      const orderish = path.includes('/orders/') || path.includes('/order/');
      const vercel = u.hostname === VERCEL_HOST || u.hostname.endsWith('.vercel.app');
      const mantle = u.hostname === 'mantledb.sh';
      if (vercel || mantle || orderish) {
        state.unexpected.push((vercel ? 'vercel ' : mantle ? 'mantle ' : 'order ') + req.method() + ' ' + u.hostname + path);
        if (mantle && req.method() === 'GET') state.mantleGets++;
        if (mantle && path.includes('/increment/')) {
          const body = JSON.parse(req.postData() || '{}');
          if (body.by === -1) state.mantleDecr++;
          if (body.by === 1) state.mantleIncr++;
        }
        await req.abort('failed');
        return;
      }
      if (u.hostname === VAULT_HOST) return await handleVault(req, u, state);
      state.unexpected.push(u.hostname + path);
      await req.abort('failed');
    } catch (e) {
      state.unexpected.push('handler ' + e.message);
      try { await req.abort('failed'); } catch (err) {}
    }
  });
}

function assert(cond, msg, state) {
  if (!cond) {
    const extra = state ? '\n' + JSON.stringify({
      vaultPosts: state.vaultPosts,
      vaultGets: state.vaultGets,
      mantleGets: state.mantleGets,
      mantleDecr: state.mantleDecr,
      mantleIncr: state.mantleIncr,
      bodies: state.bodies,
      urls: state.urls,
      unexpected: state.unexpected,
    }, null, 2) : '';
    throw new Error(msg + extra);
  }
}

function assertNoOrderNet(state, msg) {
  const hit = state.urls.concat(state.unexpected).filter((u) => /order|vercel|mantle/i.test(u));
  assert(hit.length === 0 && state.unexpected.length === 0, msg, state);
  assert(state.vaultPosts === 0 && state.vaultGets === 0, msg, state);
  assert(state.mantleGets === 0 && state.mantleDecr === 0 && state.mantleIncr === 0, msg, state);
}

async function openAndSubmit(page, value) {
  await page.click('#btnStart');
  await page.waitForSelector('#codeMask.show');
  await page.$eval('#codeInput', (el, v) => { el.value = v; }, value);
  await page.click('#btnCodeOk');
}

async function waitQuiz(page) {
  await page.waitForFunction(() => document.getElementById('quiz').classList.contains('active'), { timeout: 8000 });
}

async function waitResult(page) {
  await page.waitForFunction(() => document.getElementById('result').classList.contains('active'), { timeout: 8000 });
}

async function fastFinish(page) {
  await page.evaluate(() => {
    ans = Array(QS.length).fill(3);
    qi = QS.length - 1;
    finish();
  });
  await waitResult(page);
}

async function answerOne(page) {
  const before = await page.$eval('#qprog', (el) => el.textContent);
  await page.click('#opts .opt');
  await page.waitForFunction((prev) => document.getElementById('qprog').textContent !== prev, { timeout: 4000 }, before);
}

async function overflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    let max = 0;
    let min = 0;
    let offender = '';
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > max) {
        max = r.right;
        offender = (el.id || el.className || el.tagName).toString().slice(0, 80);
      }
      if (r.left < min) min = r.left;
    }
    const input = document.getElementById('codeInput');
    const inputFit = !input || input.getClientRects().length === 0
      ? null
      : input.scrollWidth <= input.clientWidth + 2;
    return { vw, max: Math.round(max), min: Math.round(min), offender, inputFit, overflow: max > vw + 1 || min < -1 };
  });
}

async function shot(page, name) {
  await mkdir(ART, { recursive: true });
  await page.screenshot({ path: join(ART, name), fullPage: false });
}

async function newPage(browser, state, opts = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => {
    try {
      if (sessionStorage.getItem('__test_ready')) return;
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('__test_ready', '1');
    } catch (e) {}
  });
  await page.setViewport(opts.viewport || { width: 390, height: 844, isMobile: true, hasTouch: true });
  await arm(page, state);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof redeemOrder === 'function' && typeof redeemVault === 'function' && typeof shownOrderUses === 'function');
  await page.waitForSelector('#btnStart');
  return { page, errors };
}

async function shownUses(page, orderId = ORDER) {
  return page.evaluate((id) => shownOrderUses(id), orderId);
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('format helpers reject patterns and keep counts per order id', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  const out = await page.evaluate((order, other) => {
    localStorage.setItem('soft_persimmon_order_uses', JSON.stringify({ [order]: 99 }));
    return {
      good: orderFormatError(order),
      repeat: orderFormatError('P111111111111111111'),
      seq: orderFormatError('P123456789012345678'),
      p19: orderFormatError('P9900000000000001378'),
      p19c: classifyInput('P9900000000000001378').type,
      pasted: classifyInput(' 「p8472-9103-8475-610293」 '),
      code: classifyInput(' jh 7k 2m '),
      junk: classifyInput('hello'),
      shortP: classifyInput('P12345'),
      quiz: QUIZ_KEY,
      key: ORDER_USES_KEY,
      copy: orderSuccessText({ ok: true, uses: 1, remaining: 2 }),
      mid: orderSuccessText({ ok: true, uses: 2, remaining: 1 }),
      lastCopy: orderSuccessText({ ok: true, uses: 3, remaining: 0 }),
      laterCopy: orderSuccessText({ ok: true, uses: 4, remaining: 0 }),
      separate: (() => {
        noteDisplayedUse(order);
        noteDisplayedUse(order);
        const before = shownOrderUses(other);
        noteDisplayedUse(other);
        return {
          first: shownOrderUses(order),
          second: shownOrderUses(other),
          before,
          foreign: localStorage.getItem('soft_persimmon_order_uses'),
          own: localStorage.getItem(ORDER_USES_KEY),
        };
      })(),
      paid: noteDisplayedUse('P564738291056473829').paidVerified,
    };
  }, ORDER, ORDER_B);
  assert(out.good === '', 'legal synthetic id rejected ' + out.good);
  assert(out.repeat === 'invalid' && out.seq === 'invalid' && out.p19 === 'invalid', 'pattern ids should be invalid');
  assert(out.p19c === 'order-invalid', '19-digit classifier ' + out.p19c);
  assert(out.pasted.type === 'order' && out.pasted.orderId === ORDER, 'paste normalize ' + JSON.stringify(out.pasted));
  assert(out.code.type === 'code' && out.code.code === CODE, 'spaced JH code ' + JSON.stringify(out.code));
  assert(out.junk.type === 'order-invalid' && out.shortP.type === 'order-invalid', 'junk classifier');
  assert(out.quiz === 'jiahao' && out.key === 'jiahao_order_uses', 'quiz storage key');
  assert(out.copy === '验证成功，还可以测 2 次', out.copy);
  assert(out.mid === '验证成功，还可以测 1 次', out.mid);
  assert(out.lastCopy === '验证成功，这是最后一次', out.lastCopy);
  assert(out.laterCopy === '验证成功', out.laterCopy);
  assert(out.separate.first === 2 && out.separate.before === 0 && out.separate.second === 1, 'per-id count ' + JSON.stringify(out.separate));
  assert(out.separate.foreign.includes('"P847291038475610293":99') && !out.separate.own.includes('soft_persimmon'), 'foreign key leaked');
  assert(out.paid === false, 'paidVerified');
  assertNoOrderNet(state, 'format checks must not hit the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('first start, refresh, and continue do not change the display count', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  const visible = await page.evaluate(() => document.body.innerText);
  assert(visible.includes('嘉豪浓度测试') && visible.includes('开始测试'), 'product title');
  assert(!visible.includes('验证码') && !visible.includes('已付款') && !visible.includes('paidVerified'), 'start copy');
  await openAndSubmit(page, ' 「p8472-9103-8475-610293」 ');
  await waitQuiz(page);
  assert(await shownUses(page) === 1, 'first start should display one use');
  const toast = await page.$eval('#toast', (el) => el.textContent);
  assert(toast === '验证成功，还可以测 2 次', 'success copy ' + toast);
  assertNoOrderNet(state, 'first start must not call the network');
  const q1 = await page.$eval('#qtext', (el) => el.textContent);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitQuiz(page);
  assert(await shownUses(page) === 1, 'refresh at question 1 changed the display count');
  assert((await page.$eval('#qtext', (el) => el.textContent)) === q1, 'refresh changed the question');
  assertNoOrderNet(state, 'refresh must not call the network');
  await answerOne(page);
  await answerOne(page);
  const prog = await page.$eval('#qprog', (el) => el.textContent);
  assert(prog === '3 / 18', 'progress ' + prog);
  const q3 = await page.$eval('#qtext', (el) => el.textContent);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitQuiz(page);
  const resumed = await page.evaluate(() => ({
    prog: document.getElementById('qprog').textContent,
    text: document.getElementById('qtext').textContent,
    qi,
    a0: ans[0],
    a1: ans[1],
  }));
  assert(resumed.prog === '3 / 18' && resumed.qi === 2 && resumed.a0 === 1 && resumed.a1 === 1 && resumed.text === q3, 'mid refresh ' + JSON.stringify(resumed));
  assert(await shownUses(page) === 1, 'mid refresh changed the display count');
  assertNoOrderNet(state, 'mid refresh must not call the network');
  await page.click('#qback');
  await page.click('#qback');
  await page.click('#qback');
  await page.waitForFunction(() => document.getElementById('start').classList.contains('active'));
  await page.click('#btnStart');
  await waitQuiz(page);
  const cont = await page.evaluate(() => ({
    prog: document.getElementById('qprog').textContent,
    text: document.getElementById('qtext').textContent,
    sel: document.querySelectorAll('#opts .opt.sel').length,
    a0: ans[0],
  }));
  assert(cont.prog === '1 / 18' && cont.sel === 1 && cont.a0 === 1 && cont.text === q1, 'continue reset the attempt ' + JSON.stringify(cont));
  assert(await shownUses(page) === 1, 'continue changed the display count');
  assertNoOrderNet(state, 'continue must not call the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('result restore and 查看上次结果 do not advance; 重新测试 does; a later entry still starts', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, ORDER);
  await waitQuiz(page);
  await fastFinish(page);
  const first = await page.evaluate(() => ({
    index: document.querySelector('.index-num').textContent.trim(),
    name: document.getElementById('typeTitle').textContent.trim(),
  }));
  assert(first.index === '50' && first.name === '赛级嘉豪苗子', 'scoring changed ' + JSON.stringify(first));
  assert(await shownUses(page) === 1, 'finishing changed the display count');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitResult(page);
  const peeked = await page.$eval('.index-num', (el) => el.textContent.trim());
  assert(peeked === '50', 'result refresh changed the index');
  assert(await shownUses(page) === 1, 'result refresh changed the display count');
  assertNoOrderNet(state, 'result refresh must not call the network');

  await page.click('#btnViewLast');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('不扣次'));
  assert(await shownUses(page) === 1, '查看上次 changed the display count');
  await page.evaluate(() => { show('start'); document.getElementById('toast').textContent = ''; });
  await page.click('#btnLast');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('不扣次'));
  assert(await shownUses(page) === 1, '查看上次结果 changed the display count');
  assertNoOrderNet(state, 'view last must not call the network');

  await page.click('#btnRetry');
  await waitQuiz(page);
  assert(await shownUses(page) === 2, 'retest should display the second use');
  const secondToast = await page.$eval('#toast', (el) => el.textContent);
  assert(secondToast === '验证成功，还可以测 1 次', secondToast);
  const restarted = await page.evaluate(() => ({ prog: document.getElementById('qprog').textContent, len: ans.filter((v) => v != null).length }));
  assert(restarted.prog === '1 / 18' && restarted.len === 0, 'retest should open a new attempt ' + JSON.stringify(restarted));
  await fastFinish(page);
  await page.click('#btnRetry');
  await waitQuiz(page);
  assert(await shownUses(page) === 3, 'third displayed use');
  const thirdToast = await page.$eval('#toast', (el) => el.textContent);
  assert(thirdToast === '验证成功，这是最后一次', thirdToast);
  await fastFinish(page);
  await page.click('#btnRetry');
  await waitQuiz(page);
  await page.waitForFunction(() => document.getElementById('toast').textContent === '验证成功');
  const after = await page.evaluate((id) => ({
    quiz: document.getElementById('quiz').classList.contains('active'),
    toast: document.getElementById('toast').textContent,
    uses: shownOrderUses(id),
  }), ORDER);
  assert(after.quiz, 'a later entry must still open the quiz');
  assert(after.toast === '验证成功' && !after.toast.includes('用完') && !after.toast.includes('暂时验证不了'), after.toast);
  assert(after.uses === 4, 'later entry still records a display count');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitQuiz(page);
  assert(await shownUses(page) === 4, 'refresh after a later entry changed the display count');
  assertNoOrderNet(state, 'later entry must not call the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('19-digit, repeating, and sequence ids are rejected on the device', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await page.click('#btnStart');
  await page.waitForSelector('#codeMask.show');
  const samples = ['P9900000000000001378', 'P111111111111111111', 'P123456789012345678', 'hello'];
  for (const sample of samples) {
    await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
    await page.$eval('#codeInput', (el, v) => { el.value = v; }, sample);
    await page.click('#btnCodeOk');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('订单号格式不对'));
    const open = await page.$eval('#quiz', (el) => el.classList.contains('active'));
    assert(!open, sample + ' opened the quiz');
  }
  const stored = await page.evaluate(() => localStorage.getItem('jiahao_order_uses'));
  assert(!stored, 'rejected ids wrote a display count ' + stored);
  assertNoOrderNet(state, 'rejected ids must not call the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('issued codes redeem on the vault and do not call Mantle or an order endpoint', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, 'jh 7k 2m');
  await waitQuiz(page);
  assert(state.vaultPosts === 1 && state.bodies[0].quiz === 'jiahao' && state.bodies[0].code === CODE, 'vault body', state);
  assert(!state.bodies[0].orderId, 'vault redeem must not send orderId', state);
  assert(state.vaultGets === 0, 'unlock must not peek the code', state);
  assert(state.mantleGets === 0 && state.mantleDecr === 0 && state.mantleIncr === 0, 'this quiz must not call Mantle', state);
  assert(state.unexpected.length === 0, 'unexpected', state);
  assert(state.urls.some((u) => u.startsWith('POST /redeem')), 'vault url', state);
  const toast = await page.$eval('#toast', (el) => el.textContent);
  assert(toast.includes('还可以测 2 次'), toast);
  await page.click('#qback');
  await page.waitForSelector('#start.active');
  const before = state.vaultPosts;
  await page.click('#btnStart');
  await waitQuiz(page);
  assert(state.vaultPosts === before, 'unlocked code session redeemed again', state);
  assert(errors.length === 0, errors.join('\n'));
  await page.close();

  const miss = freshState();
  miss.vaultMode = 'not_found';
  const missed = await newPage(browser, miss);
  await openAndSubmit(missed.page, CODE);
  await missed.page.waitForFunction(() => document.getElementById('toast').textContent.includes('验证码不正确'));
  const missQuiz = await missed.page.$eval('#quiz', (el) => el.classList.contains('active'));
  assert(!missQuiz && miss.vaultPosts === 1 && miss.mantleGets === 0 && miss.mantleDecr === 0, 'vault miss fell through', miss);
  assert(miss.unexpected.length === 0, 'vault miss unexpected', miss);
  await missed.page.close();

  const done = freshState();
  done.vaultMode = 'exhausted';
  const second = await newPage(browser, done);
  await openAndSubmit(second.page, CODE);
  await second.page.waitForFunction(() => document.getElementById('toast').textContent.includes('此验证码已用完'));
  const usedQuiz = await second.page.$eval('#quiz', (el) => el.classList.contains('active'));
  assert(!usedQuiz && done.vaultPosts === 1 && done.mantleGets === 0 && done.mantleDecr === 0, 'exhausted vault fell through', done);
  await second.page.close();

  const down = freshState();
  down.vaultMode = 'down';
  const offline = await newPage(browser, down);
  await openAndSubmit(offline.page, CODE);
  await offline.page.waitForFunction(() => document.getElementById('toast').textContent.includes('网络异常'));
  const downQuiz = await offline.page.$eval('#quiz', (el) => el.classList.contains('active'));
  assert(!downQuiz && down.vaultPosts === 1 && down.mantleDecr === 0, 'vault outage unlocked', down);
  await offline.page.close();
});

test('layout at 320 and 390', async (browser) => {
  for (const width of [320, 390]) {
    const state = freshState();
    const { page, errors } = await newPage(browser, state, { viewport: { width, height: 780, isMobile: true, hasTouch: true } });
    let box = await overflow(page);
    assert(!box.overflow, width + ' start overflow ' + JSON.stringify(box));
    await shot(page, `jiahao-${width}-start.png`);
    await page.click('#btnStart');
    await page.waitForSelector('#codeMask.show');
    await page.$eval('#codeInput', (el, v) => { el.value = v; }, ORDER);
    const panel = await page.$eval('.code-panel', (el) => el.innerText);
    assert(panel.includes('输入订单号') && panel.includes('我的订单') && panel.includes('3 次'), panel);
    assert(!panel.includes('验证码') && !panel.includes('付款'), panel);
    box = await overflow(page);
    assert(!box.overflow, width + ' modal overflow ' + JSON.stringify(box));
    assert(box.inputFit === true, width + ' order id clipped ' + JSON.stringify(box));
    await shot(page, `jiahao-${width}-order.png`);
    await page.click('#btnCodeOk');
    await waitQuiz(page);
    box = await overflow(page);
    assert(!box.overflow, width + ' quiz overflow ' + JSON.stringify(box));
    assert(await shownUses(page) === 1, 'layout start count');
    assertNoOrderNet(state, 'layout start must not call the network');
    await page.evaluate(() => {
      ans = Array(QS.length).fill(3);
      qi = QS.length - 1;
      finish();
    });
    await waitResult(page);
    box = await overflow(page);
    assert(!box.overflow, width + ' result overflow ' + JSON.stringify(box));
    const retry = await page.$eval('#btnRetry', (el) => el.textContent);
    assert(retry === '重新测试', retry);
    await shot(page, `jiahao-${width}-result.png`);
    assert(errors.length === 0, errors.join('\n'));
    await page.close();
  }
});

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 400));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--host-resolver-rules=MAP ${VERCEL_HOST} 127.0.0.1, MAP ${VAULT_HOST} 127.0.0.1, MAP mantledb.sh 127.0.0.1`,
  ],
});

let failed = 0;
try {
  for (const c of cases) {
    try {
      await c.fn(browser);
      console.log('ok  ' + c.name);
    } catch (e) {
      failed++;
      console.error('FAIL ' + c.name);
      console.error(e && e.stack || e);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log(cases.length + ' passed');
