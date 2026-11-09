import { test } from 'node:test';
import assert from 'node:assert/strict';
import { produce } from 'immer';
import { emptyState, demoState, stamp, mergeStates } from '../src/store.js';
import { pendingRows, rowsToState, markSynced } from '../src/sync.js';
import { receiptPayload, fiscalize } from '../src/fiscal.js';
import { sendTelegram, reportText } from '../src/telegram.js';
import { buildSale } from '../src/checkout.js';
import { computeCosts } from '../src/calc.js';

test('sync: рядки для відправки, приймання і повторна відправка лише змін', () => {
  const a = stamp(emptyState(), demoState(), 1000);
  const meta = { synced: {} };
  const rows = pendingRows(a, meta.synced, 'u1');
  assert.ok(rows.length > 20);
  assert.ok(rows.every((r) => r.owner === 'u1' && r.updated_at));
  markSynced(meta, rows);
  assert.equal(pendingRows(a, meta.synced, 'u1').length, 0);
  // зміна однієї ціни → один рядок
  const a2 = stamp(a, produce(a, (d) => { d.ingredients[0].packPrice = 99; }), 2000);
  const r2 = pendingRows(a2, meta.synced, 'u1');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].coll, 'ingredients');
  // інший пристрій отримує рядки і зливає
  const fresh = emptyState();
  const merged = mergeStates(fresh, rowsToState([...rows, ...r2].map((r) => ({ ...r, server_ts: 'x' }))));
  assert.equal(merged.ingredients.length, a.ingredients.length);
  assert.equal(merged.ingredients.find((i) => i.id === a.ingredients[0].id).packPrice, 99);
  assert.equal(merged.settings.brandName, 'KUS');
  // видалення доходить
  const a3 = stamp(a2, produce(a2, (d) => { d.customers.splice(0, 1); }), 3000);
  const r3 = pendingRows(a3, { ...meta.synced, ...Object.fromEntries(r2.map((r) => [`${r.coll}:${r.id}`, r.updated_at])) }, 'u1');
  assert.equal(r3.length, 1);
  assert.equal(r3[0].deleted, true);
  const m3 = mergeStates(merged, rowsToState(r3));
  assert.equal(m3.customers.length, a.customers.length - 1);
});

function fakeFetch(handler, log) {
  return async (url, init = {}) => {
    log.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, body } = handler(String(url), init);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}

test('Checkbox: тіло чеку і повний цикл фіскалізації', async () => {
  const s = demoState();
  s.settings.checkbox = { enabled: true, licenseKey: 'LIC', pinCode: '1234', test: true, mode: 'always' };
  const costs = computeCosts(s);
  const r = s.recipes[0];
  const sale = buildSale(s, costs, { items: [{ recipeId: r.id, name: r.name, qty: 3, price: 95 }], discount: 15, payment: 'card' });
  const p = receiptPayload(s, sale);
  assert.equal(p.goods[0].good.price, 9500);
  assert.equal(p.goods[0].quantity, 3000);
  assert.equal(p.discounts[0].value, 1500);
  assert.equal(p.payments[0].type, 'CASHLESS');
  assert.equal(p.payments[0].value, 27000);

  const log = [];
  let shiftCalls = 0;
  const f = fakeFetch((url) => {
    if (url.endsWith('/cashier/signinPinCode')) return { body: { access_token: 'TOK' } };
    if (url.endsWith('/cashier/shift')) return { body: shiftCalls++ === 0 ? null : { status: 'OPENED' } };
    if (url.endsWith('/shifts')) return { body: { id: 'sh1', status: 'CREATED' } };
    if (url.endsWith('/receipts/sell')) return { body: { id: sale.id, status: 'CREATED' } };
    if (url.includes('/receipts/')) return { body: { id: sale.id, status: 'DONE', fiscal_code: 'FC-1' } };
    return { status: 404, body: { message: 'nope' } };
  }, log);
  const res = await fiscalize(s, sale, f);
  assert.equal(res.fiscalCode, 'FC-1');
  assert.equal(res.status, 'DONE');
  const sell = log.find((x) => x.url.endsWith('/receipts/sell'));
  assert.equal(sell.headers['X-License-Key'], 'LIC');
  assert.equal(sell.headers.Authorization, 'Bearer TOK');
  assert.ok(log[0].url.startsWith('https://api.checkbox.in.ua/api/v1/'));
});

test('Telegram: відправка звіту', async () => {
  const s = demoState();
  const log = [];
  await sendTelegram({ token: 'T:1', chatId: '42' }, reportText(s, 'today', 'сьогодні'), fakeFetch(() => ({ body: { ok: true } }), log));
  assert.equal(log[0].url, 'https://api.telegram.org/botT:1/sendMessage');
  assert.equal(log[0].body.chat_id, '42');
  assert.match(log[0].body.text, /Виручка/);
  await assert.rejects(sendTelegram({ token: 'T', chatId: '1' }, 'x', fakeFetch(() => ({ status: 401, body: { ok: false, description: 'Unauthorized' } }), [])), /Unauthorized/);
});
