// Перевіряє, що запити до Claude формуються правильно, і що відповіді розбираються.
// Справжній API не викликається — підставляємо fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePurchases, searchPrices } from '../src/ai.js';

function fakeFetch(responses, seen) {
  let k = 0;
  return async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    const body = responses[Math.min(k++, responses.length - 1)];
    if (JSON.parse(init.body).stream) return sse(body);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  };
}
function sse(m) {
  const ev = [];
  const push = (type, data) => ev.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  push('message_start', { message: { ...m, content: [], stop_reason: null } });
  m.content.forEach((b, index) => {
    push('content_block_start', { index, content_block: { type: 'text', text: '' } });
    push('content_block_delta', { index, delta: { type: 'text_delta', text: b.text } });
    push('content_block_stop', { index });
  });
  push('message_delta', { delta: { stop_reason: m.stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } });
  push('message_stop', {});
  return new Response(ev.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const msg = (content, stop_reason = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
const settings = { apiKey: 'sk-ant-test', model: 'claude-opus-5-5' };
const ings = [{ id: 'flour', name: 'Борошно', baseUnit: 'g' }];

test('чек → структуровані позиції', async () => {
  const seen = [];
  const out = { items: [{ name: 'Борошно 1кг', matchedIngredientId: 'flour', qty: 2, unit: 'kg', totalPrice: 64, category: 'Основа' }], comment: '' };
  const res = await parsePurchases(settings, ings, { text: 'борошно 2 кг 64 грн' }, fakeFetch([msg([{ type: 'text', text: JSON.stringify(out) }])], seen));
  assert.equal(res.items[0].qty, 2);
  const b = seen[0].body;
  assert.equal(b.model, 'claude-opus-5-5');
  assert.equal(b.fallbacks, 'default');
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.ok(!('thinking' in b) || b.thinking.type === 'adaptive');
});

test('пошук цін: web search + pause_turn + JSON', async () => {
  const seen = [];
  const json = '```json\n{"items":[{"ingredientId":"flour","packQty":1,"unit":"kg","packPrice":35,"found":true,"source":"Сільпо"}],"comment":"ok"}\n```';
  const res = await searchPrices(settings, ings, 'Київ', fakeFetch([msg([{ type: 'text', text: 'шукаю' }], 'pause_turn'), msg([{ type: 'text', text: 'Ось ціни ' + json }])], seen));
  assert.equal(res.items[0].packPrice, 35);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].body.tools[0].type, 'web_search_20260209');
  assert.equal(seen[1].body.messages.at(-1).role, 'assistant');
});

test('відмова моделі → зрозуміла помилка', async () => {
  const seen = [];
  await assert.rejects(
    parsePurchases(settings, ings, { text: 'x' }, fakeFetch([msg([], 'refusal')], seen)),
    /відмовилася/,
  );
});
