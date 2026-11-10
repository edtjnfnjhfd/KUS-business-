// Чиста бізнес-логіка: одиниці, собівартість, періоди, звіти.
// Нічого не знає про React — тому легко тестується (див. tests/).

export const UNITS = {
  g: { label: 'г', big: 'кг', factor: 1000 },
  ml: { label: 'мл', big: 'л', factor: 1000 },
  pcs: { label: 'шт', big: 'шт', factor: 1 },
};

// Одиниці, в яких людина вводить розмір упаковки / кількість.
export const INPUT_UNITS = {
  g: { base: 'g', f: 1, label: 'г' },
  kg: { base: 'g', f: 1000, label: 'кг' },
  ml: { base: 'ml', f: 1, label: 'мл' },
  l: { base: 'ml', f: 1000, label: 'л' },
  pcs: { base: 'pcs', f: 1, label: 'шт' },
};

export function toBase(qty, unit) {
  const u = INPUT_UNITS[unit] || INPUT_UNITS.pcs;
  return { qty: (Number(qty) || 0) * u.f, base: u.base };
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Ціна за 1 базову одиницю (1 г / 1 мл / 1 шт). */
export function unitPrice(ing) {
  if (!ing) return 0;
  const q = Number(ing.packQty) || 0;
  return q > 0 ? (Number(ing.packPrice) || 0) / q : 0;
}

/** Ціна за «велику» одиницю: за кг / л / шт — для зручного показу. */
export function bigUnitPrice(ing) {
  const u = UNITS[ing?.baseUnit] || UNITS.pcs;
  return unitPrice(ing) * u.factor;
}

/**
 * Рахує собівартість усіх техкарт. Техкарта може містити інгредієнти
 * та інші техкарти (наприклад «Набір 4 шт» складається з печива + коробки).
 * Повертає Map<recipeId, { batch, perPiece, lines, error }>.
 */
export function computeCosts(state) {
  const ingById = new Map(state.ingredients.map((i) => [i.id, i]));
  const recById = new Map(state.recipes.map((r) => [r.id, r]));
  const memo = new Map();

  function calc(id, stack) {
    if (memo.has(id)) return memo.get(id);
    const r = recById.get(id);
    if (!r) return { batch: 0, perPiece: 0, lines: [], error: 'not-found' };
    if (stack.has(id)) return { batch: 0, perPiece: 0, lines: [], error: 'cycle' };
    stack.add(id);

    const yieldQty = Math.max(Number(r.yieldQty) || 0, 0);
    const lines = [];
    let ingSum = 0; // інгредієнти «на заміс» (до них застосовуються втрати)
    let perPieceSum = 0; // штучні позиції (пакування) — на 1 шт × вихід
    let error = null;

    for (const it of r.items || []) {
      let unitCost = 0;
      let name = '—';
      let missing = false;
      let unitLabel = 'шт';
      if (it.type === 'rec') {
        const sub = calc(it.refId, stack);
        const subR = recById.get(it.refId);
        if (!subR) missing = true;
        if (sub.error === 'cycle') error = 'cycle';
        unitCost = sub.perPiece;
        name = subR ? subR.name : '(видалена техкарта)';
      } else {
        const ing = ingById.get(it.refId);
        if (!ing) missing = true;
        unitCost = unitPrice(ing);
        name = ing ? ing.name : '(видалений інгредієнт)';
        unitLabel = (UNITS[ing?.baseUnit] || UNITS.pcs).label;
      }
      const qty = Number(it.qty) || 0;
      const mult = it.perPiece ? yieldQty : 1;
      const cost = unitCost * qty * mult;
      if (it.perPiece) perPieceSum += cost;
      else ingSum += cost;
      lines.push({ id: it.id, name, unitCost, qty, cost, missing, unitLabel, perPiece: !!it.perPiece, type: it.type });
    }

    const waste = Math.max(Number(r.wastePct) || 0, 0) / 100;
    const extras = (r.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const batch = ingSum * (1 + waste) + perPieceSum + extras;
    const perPiece = yieldQty > 0 ? batch / yieldQty : 0;

    // Вага тіста (лише г-інгредієнти «на заміс»)
    let doughG = 0;
    for (const it of r.items || []) {
      if (it.type === 'ing' && !it.perPiece) {
        const ing = ingById.get(it.refId);
        if (ing?.baseUnit === 'g') doughG += Number(it.qty) || 0;
      }
    }

    for (const l of lines) l.share = batch > 0 ? l.cost / batch : 0;
    const res = { batch, perPiece, lines, error, extras, wasteCost: ingSum * waste, doughG, pieceWeight: yieldQty > 0 ? doughG / yieldQty : 0 };
    stack.delete(id);
    memo.set(id, res);
    return res;
  }

  for (const r of state.recipes) calc(r.id, new Set());
  return memo;
}

export function marginInfo(cost, price) {
  const p = Number(price) || 0;
  const profit = p - cost;
  return {
    profit,
    marginPct: p > 0 ? (profit / p) * 100 : 0, // частка прибутку в ціні
    markupPct: cost > 0 ? (profit / cost) * 100 : 0, // націнка на собівартість
    foodCostPct: p > 0 ? (cost / p) * 100 : 0,
  };
}

/** Ціна, за якої маржа складе targetMarginPct. */
export function priceForMargin(cost, targetMarginPct) {
  const m = Math.min(Math.max(Number(targetMarginPct) || 0, 0), 95) / 100;
  return cost / (1 - m);
}

/** Чи використовується інгредієнт / техкарта в інших техкартах. */
export function usedIn(state, type, refId) {
  return state.recipes.filter((r) => (r.items || []).some((it) => it.type === type && it.refId === refId));
}

// ───────────────────────── Продажі та періоди ─────────────────────────

/** Категорії витрат, які показуються в розділі «Транспорт» («Доставка» — стара назва). */
export const TRANSPORT_CATEGORIES = ['Транспорт', 'Доставка'];
export const TRANSPORT_KINDS = ['Таксі', 'Водій / кур’єр', 'Пальне', 'Нова пошта / пошта', 'Інше'];

export function saleTotals(sale) {
  const gross = (sale.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const cost = (sale.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
  const qty = (sale.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const discount = Math.min(Number(sale.discount) || 0, gross);
  // Доставка — окремий рядок чеку: клієнт платить, але це не виручка від печива
  const delivery = Number(sale.deliveryFee) || 0;
  const revenue = gross - discount + delivery;
  return { gross, discount, delivery, goods: gross - discount, revenue, cost, profit: revenue - cost, qty };
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const PERIODS = [
  { id: 'today', label: 'Сьогодні' },
  { id: 'yesterday', label: 'Вчора' },
  { id: 'week', label: 'Цей тиждень' },
  { id: '7d', label: '7 днів' },
  { id: 'month', label: 'Цей місяць' },
  { id: 'prevMonth', label: 'Мин. місяць' },
  { id: '30d', label: '30 днів' },
  { id: 'year', label: 'Цей рік' },
  { id: 'all', label: 'Весь час' },
  { id: 'custom', label: 'Свій період' },
];

/** Повертає [from, to) як Date або null для «весь час». */
export function periodRange(id, now = new Date(), custom = {}) {
  const today = startOfDay(now);
  switch (id) {
    case 'today': return [today, addDays(today, 1)];
    case 'yesterday': return [addDays(today, -1), today];
    case 'week': {
      const dow = (today.getDay() + 6) % 7; // понеділок = 0
      return [addDays(today, -dow), addDays(today, 7 - dow)];
    }
    case '7d': return [addDays(today, -6), addDays(today, 1)];
    case '30d': return [addDays(today, -29), addDays(today, 1)];
    case 'month': return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)];
    case 'prevMonth': return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1)];
    case 'year': return [new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear() + 1, 0, 1)];
    case 'custom': {
      const f = custom.from ? startOfDay(new Date(custom.from + 'T00:00')) : null;
      const t = custom.to ? addDays(startOfDay(new Date(custom.to + 'T00:00')), 1) : null;
      return [f, t];
    }
    default: return [null, null];
  }
}

export function inRange(dateStr, [from, to]) {
  const d = new Date(dateStr);
  if (from && d < from) return false;
  if (to && d >= to) return false;
  return true;
}

export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const monthKey = (d) => dayKey(d).slice(0, 7);

/** Повний звіт за період. */
export function buildReport(state, range) {
  const sales = state.sales.filter((s) => inRange(s.date, range));
  const expenses = state.expenses.filter((e) => inRange(e.date, range));

  const t = { revenue: 0, cost: 0, profit: 0, qty: 0, discount: 0, delivery: 0, deliveries: 0, checks: sales.filter((x) => x.type !== 'return').length };
  const byProduct = new Map();
  const byPayment = new Map();
  for (const s of sales) {
    const st = saleTotals(s);
    t.revenue += st.revenue; t.cost += st.cost; t.profit += st.profit; t.qty += st.qty; t.discount += st.discount;
    if (st.delivery) { t.delivery += st.delivery; t.deliveries += 1; }
    byPayment.set(s.payment || 'cash', (byPayment.get(s.payment || 'cash') || 0) + st.revenue);
    // знижку чеку розподіляємо пропорційно між позиціями
    const k = st.gross > 0 ? st.goods / st.gross : 0;
    for (const i of s.items || []) {
      const key = i.recipeId || i.name;
      const p = byProduct.get(key) || { name: i.name, qty: 0, revenue: 0, cost: 0 };
      p.qty += Number(i.qty) || 0;
      p.revenue += (Number(i.qty) || 0) * (Number(i.price) || 0) * k;
      p.cost += (Number(i.qty) || 0) * (Number(i.cost) || 0);
      byProduct.set(key, p);
    }
  }
  const byExpCat = new Map();
  const addCat = (k, v) => byExpCat.set(k, (byExpCat.get(k) || 0) + v);
  for (const e of expenses) addCat(e.category || 'Інше', Number(e.amount) || 0);
  // Виплати зарплати теж витрати
  for (const m of state.moneyMoves || []) if (m.type === 'salary' && inRange(m.date, range)) addCat('Зарплата', Math.abs(Number(m.amount) || 0));
  const expTotal = [...byExpCat.values()].reduce((a, b) => a + b, 0);
  const transport = expenses.filter((e) => TRANSPORT_CATEGORIES.includes(e.category)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  // Списання і нестачі за інвентаризацією — втрати
  let losses = 0;
  for (const a of state.adjustments || []) if (inRange(a.date, range)) { const v = adjustmentValue(state, a); if (v < 0) losses -= v; }

  // Динаміка: по днях, або по місяцях якщо період довгий
  let from = range[0];
  let to = range[1];
  const allDates = [...sales.map((s) => new Date(s.date)), ...expenses.map((e) => new Date(e.date))];
  if (!from && allDates.length) from = startOfDay(new Date(Math.min(...allDates)));
  if (!to) to = addDays(startOfDay(new Date()), 1);
  if (allDates.length) {
    const maxD = addDays(startOfDay(new Date(Math.max(...allDates))), 1);
    if (!range[1] && maxD > to) to = maxD;
  }
  const series = [];
  if (from && to) {
    const days = Math.round((to - from) / 86400000);
    const byMonth = days > 62;
    const map = new Map();
    if (byMonth) {
      for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        map.set(monthKey(d), { key: monthKey(d), date: new Date(d), revenue: 0, profit: 0, qty: 0 });
      }
    } else {
      for (let d = new Date(from); d < to; d = addDays(d, 1)) map.set(dayKey(d), { key: dayKey(d), date: new Date(d), revenue: 0, profit: 0, qty: 0 });
    }
    for (const s of sales) {
      const k = byMonth ? monthKey(s.date) : dayKey(s.date);
      const b = map.get(k);
      if (!b) continue;
      const st = saleTotals(s);
      b.revenue += st.revenue; b.profit += st.profit; b.qty += st.qty;
    }
    series.push(...map.values());
    series.byMonth = byMonth;
  }

  return {
    ...t,
    expenses: expTotal,
    transport,
    deliveryResult: t.delivery - transport,
    losses,
    net: t.profit - expTotal - losses,
    avgCheck: t.checks ? t.revenue / t.checks : 0,
    marginPct: t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0,
    products: [...byProduct.values()].map((p) => ({ ...p, profit: p.revenue - p.cost })).sort((a, b) => b.revenue - a.revenue),
    payments: [...byPayment.entries()].map(([k, v]) => ({ key: k, amount: v })),
    expCats: [...byExpCat.entries()].map(([k, v]) => ({ name: k, amount: v })).sort((a, b) => b.amount - a.amount),
    series,
    salesList: sales,
    expensesList: expenses,
  };
}

// ───────────────────────── Форматування ─────────────────────────

const moneyFmt = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
export const money = (n, cur = '₴') => `${moneyFmt.format(Number(n) || 0)} ${cur}`;
export const num = (n) => numFmt.format(Number(n) || 0);
export const pct = (n) => `${numFmt.format(Math.round((Number(n) || 0) * 10) / 10)}%`;

/** Українські відмінки: plural(2, ['поїздка','поїздки','поїздок']) → «2 поїздки» */
export function plural(n, [one, few, many]) {
  const a = Math.abs(n) % 100; const b = a % 10;
  const w = a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  return `${n} ${w}`;
}

export function fmtQty(qty, baseUnit) {
  const u = UNITS[baseUnit] || UNITS.pcs;
  const q = Number(qty) || 0;
  if (u.factor > 1 && q >= u.factor) return `${num(q / u.factor)} ${u.big}`;
  return `${num(q)} ${u.label}`;
}

export const fmtDateTime = (d) => new Date(d).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d) => new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Значення для <input type="datetime-local"> у місцевому часі. */
export function toLocalInput(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

// ───────────────────────── Склад ─────────────────────────

/**
 * Розкладає N штук техкарти на інгредієнти (з урахуванням втрат і вкладених техкарт).
 * Повертає Map<ingredientId, кількість у базових одиницях>.
 */
export function explode(state, recipeId, pieces, out = new Map(), stack = new Set()) {
  const r = state.recipes.find((x) => x.id === recipeId);
  if (!r || stack.has(recipeId) || !pieces) return out;
  stack.add(recipeId);
  const y = Math.max(Number(r.yieldQty) || 0, 0) || 1;
  const waste = 1 + Math.max(Number(r.wastePct) || 0, 0) / 100;
  for (const it of r.items || []) {
    const perPieceQty = (Number(it.qty) || 0) * (it.perPiece ? 1 : 1 / y);
    if (it.type === 'rec') explode(state, it.refId, pieces * perPieceQty, out, stack);
    else if (it.refId) out.set(it.refId, (out.get(it.refId) || 0) + pieces * perPieceQty * (it.perPiece ? 1 : waste));
  }
  stack.delete(recipeId);
  return out;
}

/** Що списати зі складу за позиції чеку: [{ingredientId, qty}] */
export function consumptionFor(state, items) {
  const m = new Map();
  for (const l of items) if (l.recipeId && Number(l.qty) > 0) explode(state, l.recipeId, Number(l.qty), m);
  return [...m.entries()].map(([ingredientId, qty]) => ({ ingredientId, qty: Math.round(qty * 100) / 100 }));
}

/** Залишки на складі: Map<ingredientId, qty>. До дати `until` (не включно), якщо задано. */
export function computeStock(state, until = null) {
  const st = new Map(state.ingredients.map((i) => [i.id, 0]));
  const ok = (d) => !until || new Date(d) < until;
  const add = (id, q) => st.set(id, (st.get(id) || 0) + (Number(q) || 0));
  for (const s of state.supplies) if (ok(s.date)) for (const it of s.items || []) add(it.ingredientId, it.qty);
  for (const a of state.adjustments) if (ok(a.date)) for (const it of a.items || []) add(it.ingredientId, it.qty);
  for (const s of state.sales) if (ok(s.date)) for (const c of s.consumption || []) add(c.ingredientId, -c.qty);
  return st;
}

export function supplyTotal(s) {
  return (s.items || []).reduce((t, i) => t + (Number(i.total) || 0), 0);
}

/** Вартість коригування (від'ємна = втрата). */
export function adjustmentValue(state, a) {
  const byId = new Map(state.ingredients.map((i) => [i.id, i]));
  if (a.value != null) return a.value;
  return (a.items || []).reduce((t, it) => t + (Number(it.qty) || 0) * unitPrice(byId.get(it.ingredientId)), 0);
}

// ───────────────────────── Гроші ─────────────────────────

/** Скільки грошей реально надійшло за чек (без передоплати, яка надійшла раніше). */
export function saleCashIn(sale) {
  return saleTotals(sale).revenue - (Number(sale.prepaid) || 0);
}

/** Усі рухи грошей як плаский список: [{date, accountId, amount, kind, label, ref}] */
export function moneyFlow(state) {
  const f = [];
  for (const s of state.sales) {
    if (!s.payment || s.payment === 'debt') continue;
    f.push({ date: s.date, accountId: s.payment, amount: saleCashIn(s), kind: s.type === 'return' ? 'return' : 'sale', label: s.type === 'return' ? 'Повернення' : 'Продаж', ref: s.id });
  }
  for (const o of state.orders) {
    if ((Number(o.prepaid) || 0) > 0 && o.prepaidAccount && !(o.status === 'cancelled' && o.prepaidRefunded)) {
      f.push({ date: o.prepaidAt || o.createdAt, accountId: o.prepaidAccount, amount: Number(o.prepaid), kind: 'prepayment', label: `Передоплата №${o.number}`, ref: o.id });
    }
  }
  for (const e of state.expenses) if (e.accountId) f.push({ date: e.date, accountId: e.accountId, amount: -(Number(e.amount) || 0), kind: 'expense', label: e.category + (e.note ? ': ' + e.note : ''), ref: e.id });
  for (const s of state.supplies) if (s.accountId) f.push({ date: s.date, accountId: s.accountId, amount: -supplyTotal(s), kind: 'supply', label: 'Постачання' + (s.supplier ? ': ' + s.supplier : ''), ref: s.id });
  for (const m of state.moneyMoves) {
    const a = Number(m.amount) || 0;
    if (m.type === 'transfer') {
      f.push({ date: m.date, accountId: m.accountId, amount: -Math.abs(a), kind: 'transfer', label: 'Переказ' + (m.note ? ': ' + m.note : ''), ref: m.id });
      f.push({ date: m.date, accountId: m.toAccountId, amount: Math.abs(a), kind: 'transfer', label: 'Переказ' + (m.note ? ': ' + m.note : ''), ref: m.id });
    } else {
      f.push({ date: m.date, accountId: m.accountId, amount: a, kind: m.type, label: MONEY_TYPES[m.type]?.label + (m.note ? ': ' + m.note : ''), ref: m.id });
    }
  }
  return f;
}

export const MONEY_TYPES = {
  deposit: { label: 'Внесення', sign: 1 },
  withdraw: { label: 'Вилучення / інкасація', sign: -1 },
  transfer: { label: 'Переказ між рахунками', sign: -1 },
  debtPayment: { label: 'Погашення боргу', sign: 1 },
  salary: { label: 'Виплата зарплати', sign: -1 },
  opening: { label: 'Початковий залишок', sign: 1 },
};

export function accountBalances(state, until = null) {
  const b = new Map(state.accounts.map((a) => [a.id, 0]));
  for (const m of moneyFlow(state)) {
    if (until && new Date(m.date) >= until) continue;
    b.set(m.accountId, (b.get(m.accountId) || 0) + m.amount);
  }
  return b;
}

// ───────────────────────── Клієнти ─────────────────────────

export function customerStats(state, customerId) {
  const sales = state.sales.filter((s) => s.customerId === customerId);
  let spent = 0; let profit = 0; let bonus = 0; let debt = 0; let last = null;
  for (const s of sales) {
    const t = saleTotals(s);
    spent += t.revenue; profit += t.profit;
    bonus += (Number(s.bonusEarned) || 0) - (Number(s.bonusUsed) || 0);
    if (s.payment === 'debt') debt += saleCashIn(s);
    if (!last || new Date(s.date) > new Date(last)) last = s.date;
  }
  for (const m of state.moneyMoves) if (m.type === 'debtPayment' && m.customerId === customerId) debt -= Number(m.amount) || 0;
  const checks = sales.filter((s) => s.type !== 'return').length;
  return { spent, profit, bonus: Math.max(0, round2(bonus)), debt: round2(debt), last, checks, avg: checks ? spent / checks : 0, sales };
}

/** Найближчі дні народження за `days` днів. */
export function upcomingBirthdays(customers, days = 14, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const res = [];
  for (const c of customers) {
    if (!c.birthday) continue;
    const [, m, d] = c.birthday.split('-').map(Number);
    if (!m || !d) continue;
    let next = new Date(today.getFullYear(), m - 1, d);
    if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
    const diff = Math.round((next - today) / 86400000);
    if (diff <= days) res.push({ customer: c, date: next, inDays: diff });
  }
  return res.sort((a, b) => a.inDays - b.inDays);
}

// ───────────────────────── Зміни ─────────────────────────

export function shiftCash(state, shift, cashAccount = 'cash') {
  const from = new Date(shift.openedAt);
  const to = shift.closedAt ? new Date(shift.closedAt) : new Date(8.64e15);
  let income = 0; let out = 0; let sales = 0; let checks = 0; let cardSales = 0;
  for (const m of moneyFlow(state)) {
    const d = new Date(m.date);
    if (m.accountId !== cashAccount || d < from || d >= to) continue;
    if (m.amount >= 0) income += m.amount; else out += m.amount;
  }
  for (const s of state.sales) {
    const d = new Date(s.date);
    if (d < from || d >= to) continue;
    const t = saleTotals(s);
    sales += t.revenue; checks += s.type === 'return' ? 0 : 1;
    if (s.payment !== cashAccount) cardSales += t.revenue;
  }
  const expected = (Number(shift.openingCash) || 0) + income + out;
  return { income, out, expected, sales, checks, cardSales };
}

// ───────────────────────── Аналітика ─────────────────────────

/** ABC-аналіз: A — перші 80% показника, B — до 95%, C — решта. */
export function abc(products, key = 'revenue') {
  const sorted = [...products].sort((a, b) => b[key] - a[key]);
  const total = sorted.reduce((s, p) => s + Math.max(0, p[key]), 0);
  let acc = 0;
  return sorted.map((p) => {
    const share = total > 0 ? Math.max(0, p[key]) / total : 0;
    const before = acc;
    acc += share;
    const cls = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
    return { ...p, share, cum: acc, cls };
  });
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export function breakdowns(state, sales) {
  const byWeekday = WEEKDAYS.map((label) => ({ key: label, label, revenue: 0, profit: 0, qty: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${h}:00`, revenue: 0, profit: 0, qty: 0 }));
  const byChannel = new Map();
  const byCategory = new Map();
  const byEmployee = new Map();
  const recCat = new Map(state.recipes.map((r) => [r.id, r.category || 'Інше']));
  const emp = new Map(state.employees.map((e) => [e.id, e.name]));
  const add = (map, key, t) => {
    const x = map.get(key) || { key, label: key, revenue: 0, profit: 0, qty: 0, checks: 0 };
    x.revenue += t.revenue; x.profit += t.profit; x.qty += t.qty; x.checks += 1;
    map.set(key, x);
  };
  for (const s of sales) {
    const t = saleTotals(s);
    const d = new Date(s.date);
    for (const b of [byWeekday[(d.getDay() + 6) % 7], byHour[d.getHours()]]) { b.revenue += t.revenue; b.profit += t.profit; b.qty += t.qty; }
    add(byChannel, s.channel || 'Без каналу', t);
    add(byEmployee, emp.get(s.employeeId) || 'Без входу за PIN', t);
    const k = t.gross > 0 ? t.goods / t.gross : 0;
    for (const i of s.items || []) {
      const cat = recCat.get(i.recipeId) || 'Інше';
      const rev = (Number(i.qty) || 0) * (Number(i.price) || 0) * k;
      const cost = (Number(i.qty) || 0) * (Number(i.cost) || 0);
      const x = byCategory.get(cat) || { key: cat, label: cat, revenue: 0, profit: 0, qty: 0 };
      x.revenue += rev; x.profit += rev - cost; x.qty += Number(i.qty) || 0;
      byCategory.set(cat, x);
    }
  }
  const sort = (m) => [...m.values()].sort((a, b) => b.revenue - a.revenue);
  return { byWeekday, byHour, byChannel: sort(byChannel), byCategory: sort(byCategory), byEmployee: sort(byEmployee) };
}

/** Попередній період такої ж довжини. */
export function previousRange([from, to]) {
  if (!from || !to) return null;
  const len = to - from;
  return [new Date(from.getTime() - len), new Date(from)];
}

export function delta(cur, prev) {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// ───────────────────────── План випічки ─────────────────────────

/**
 * Скільки замісів якої техкарти треба і чого не вистачає.
 * need: Map<recipeId, штук> (з замовлень + вручну)
 */
export function bakePlan(state, need, stock = computeStock(state)) {
  // Розкладаємо набори на печиво: «виробляємо» лише техкарти з інгредієнтами
  const pieces = new Map();
  const walk = (rid, n, stack = new Set()) => {
    const r = state.recipes.find((x) => x.id === rid);
    if (!r || stack.has(rid) || n <= 0) return;
    stack.add(rid);
    const y = Math.max(Number(r.yieldQty) || 0, 0) || 1;
    const hasIng = (r.items || []).some((i) => i.type === 'ing' && !i.perPiece);
    if (hasIng || !(r.items || []).some((i) => i.type === 'rec')) pieces.set(rid, (pieces.get(rid) || 0) + n);
    for (const it of r.items || []) if (it.type === 'rec') walk(it.refId, n * (Number(it.qty) || 0) * (it.perPiece ? 1 : 1 / y), stack);
    stack.delete(rid);
  };
  for (const [rid, n] of need) walk(rid, n);

  const rows = [];
  const ingNeed = new Map();
  for (const [rid, n] of pieces) {
    const r = state.recipes.find((x) => x.id === rid);
    const y = Math.max(Number(r.yieldQty) || 0, 0) || 1;
    const hasDough = (r.items || []).some((i) => i.type === 'ing' && !i.perPiece);
    const batches = hasDough ? Math.ceil(n / y - 1e-9) : 0;
    const make = hasDough ? batches * y : n;
    rows.push({ recipe: r, pieces: n, batches, make, spare: make - n });
    // інгредієнти: заміс — на цілі заміси, пакування — на фактичні штуки
    const waste = 1 + Math.max(Number(r.wastePct) || 0, 0) / 100;
    for (const it of r.items || []) {
      if (it.type !== 'ing' || !it.refId) continue;
      const q = it.perPiece ? (Number(it.qty) || 0) * n : (Number(it.qty) || 0) * batches * waste;
      ingNeed.set(it.refId, (ingNeed.get(it.refId) || 0) + q);
    }
  }
  // Пакування наборів (штучні позиції наборів)
  for (const [rid, n] of need) {
    const r = state.recipes.find((x) => x.id === rid);
    if (!r || pieces.has(rid)) continue;
    const y = Math.max(Number(r.yieldQty) || 0, 0) || 1;
    for (const it of r.items || []) {
      if (it.type !== 'ing' || !it.refId) continue;
      ingNeed.set(it.refId, (ingNeed.get(it.refId) || 0) + (Number(it.qty) || 0) * (it.perPiece ? n : n / y));
    }
  }
  const ingredients = [...ingNeed.entries()].map(([id, qty]) => {
    const ing = state.ingredients.find((i) => i.id === id);
    const have = stock.get(id) || 0;
    const short = Math.max(0, qty - have);
    const packs = ing && ing.packQty > 0 ? Math.ceil(short / ing.packQty - 1e-9) : 0;
    return { ing, qty, have, short, packs, cost: packs * (ing?.packPrice || 0) };
  }).filter((x) => x.ing).sort((a, b) => b.short - a.short || a.ing.name.localeCompare(b.ing.name));
  return { rows: rows.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name)), ingredients };
}

// ───────────────────────── Зарплата ─────────────────────────

export function payroll(state, range) {
  return state.employees.map((e) => {
    const shifts = state.shifts.filter((s) => s.employeeId === e.id && s.closedAt && inRange(s.openedAt, range));
    const sales = state.sales.filter((s) => s.employeeId === e.id && inRange(s.date, range));
    const revenue = sales.reduce((t, s) => t + saleTotals(s).revenue, 0);
    const accrued = shifts.length * (Number(e.ratePerShift) || 0) + revenue * (Number(e.salesPct) || 0) / 100;
    const paid = state.moneyMoves.filter((m) => m.type === 'salary' && m.employeeId === e.id && inRange(m.date, range)).reduce((t, m) => t + Math.abs(Number(m.amount) || 0), 0);
    return { employee: e, shifts: shifts.length, revenue, accrued, paid, due: accrued - paid };
  });
}

// ───────────────────────── Етикетки ─────────────────────────

/** Склад для етикетки: інгредієнти за спаданням маси (без пакування). */
export function labelComposition(state, recipeId) {
  const m = explode(state, recipeId, 1);
  const byId = new Map(state.ingredients.map((i) => [i.id, i]));
  return [...m.entries()]
    .map(([id, q]) => ({ ing: byId.get(id), q }))
    .filter((x) => x.ing && x.ing.category !== 'Пакування')
    .sort((a, b) => (b.ing.baseUnit === 'pcs' ? b.q * 50 : b.q) - (a.ing.baseUnit === 'pcs' ? a.q * 50 : a.q))
    .map((x) => x.ing.labelName || x.ing.name.replace(/\s*\(.*?\)\s*/g, ' ').trim())
    .join(', ');
}
