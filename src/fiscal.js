// Фіскалізація через ПРРО Checkbox (checkbox.ua).
// Потрібні: ключ ліцензії каси (X-License-Key) і PIN-код касира з кабінету Checkbox.
import { Checkbox, orderReceipt, kop, nextTime } from '@tolokacode/checkbox';
import { saleTotals } from './calc.js';

// Тестова каса створюється в кабінеті Checkbox і працює через той самий API — чеки з неї не йдуть у ДПС.
const API = 'https://api.checkbox.in.ua';

let cached = null;
const TOKEN_KEY = 'kus-checkbox-token';

export function checkboxClient(cfg, fetchImpl) {
  if (!cfg?.licenseKey || !cfg?.pinCode) throw new Error('Вкажіть ключ ліцензії каси і PIN касира Checkbox у Налаштуваннях');
  const sig = `${cfg.licenseKey}|${cfg.pinCode}`;
  if (cached?.sig === sig && !fetchImpl) return cached.client;
  let token;
  try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); if (t?.sig === sig) token = t.token; } catch { /* ignore */ }
  const client = new Checkbox({
    licenseKey: cfg.licenseKey.trim(),
    pinCode: String(cfg.pinCode).trim(),
    baseUrl: API,
    clientName: 'KUS cookie manager',
    clientVersion: '2.0',
    token,
    onToken: (t) => { try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ sig, token: t })); } catch { /* ignore */ } },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  if (!fetchImpl) cached = { sig, client };
  return client;
}

const paymentType = (accountId, accounts) => {
  const a = accounts.find((x) => x.id === accountId);
  return a?.type === 'cash' || accountId === 'cash' ? 'CASH' : 'CASHLESS';
};

/** Будує тіло фіскального чеку з нашого продажу. */
export function receiptPayload(state, sale) {
  const t = saleTotals(sale);
  const order = orderReceipt({
    lines: sale.items.map((i) => ({ code: (i.recipeId || i.name).slice(0, 32), name: i.name, quantity: Math.abs(Number(i.qty)), total: kop(Math.abs(Number(i.qty) * Number(i.price))) })),
    discount: kop(Math.abs(t.discount)),
    shipping: kop(t.delivery || 0),
    shippingName: 'Доставка',
    discountName: sale.bonusUsed ? 'Знижка / бонуси' : 'Знижка',
  });
  return {
    id: sale.fiscal?.id || sale.id,
    goods: sale.type === 'return' ? order.goods.map((g) => ({ ...g, is_return: true })) : order.goods,
    discounts: order.discounts,
    payments: [{ type: paymentType(sale.payment, state.accounts), value: order.sum, label: paymentType(sale.payment, state.accounts) === 'CASH' ? 'Готівка' : 'Картка' }],
    header: state.settings.brandName || undefined,
  };
}

/** Фіскалізує продаж: відкриває зміну, якщо треба, створює чек і чекає фіскальний номер. */
export async function fiscalize(state, sale, fetchImpl) {
  const cfg = state.settings.checkbox;
  const cb = checkboxClient(cfg, fetchImpl);
  await cb.ensureShift({ autoCloseAt: nextTime('23:50') });
  const payload = receiptPayload(state, sale);
  const r = await cb.sell(payload);
  const done = await cb.waitForReceipt(r.id, 20000);
  return {
    id: r.id,
    status: done.status,
    fiscalCode: done.fiscal_code || '',
    url: `https://check.checkbox.ua/${r.id}`,
    test: !!cfg.test,
    at: new Date().toISOString(),
  };
}

export async function checkboxStatus(cfg, fetchImpl) {
  const cb = checkboxClient(cfg, fetchImpl);
  const me = await cb.me();
  const shift = await cb.currentShift();
  return { cashier: me?.full_name || me?.nin || 'касир', shift: shift?.status || 'CLOSED' };
}

export async function checkboxOpenShift(cfg) {
  return checkboxClient(cfg).ensureShift({ autoCloseAt: nextTime('23:50') });
}

export async function checkboxCloseShift(cfg) {
  const cb = checkboxClient(cfg);
  const shift = await cb.currentShift();
  if (!shift || shift.status !== 'OPENED') return null;
  return cb.closeShift();
}

export function explainFiscalError(e) {
  const m = e?.message || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Немає зв’язку з Checkbox (інтернет або браузер блокує запит).';
  return m.replace(/^Checkbox:\s*/, '');
}
