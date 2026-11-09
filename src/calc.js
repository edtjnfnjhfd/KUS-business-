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

export function saleTotals(sale) {
  const gross = (sale.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
  const cost = (sale.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
  const qty = (sale.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const discount = Math.min(Number(sale.discount) || 0, gross);
  const revenue = gross - discount;
  return { gross, discount, revenue, cost, profit: revenue - cost, qty };
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

  const t = { revenue: 0, cost: 0, profit: 0, qty: 0, discount: 0, checks: sales.length };
  const byProduct = new Map();
  const byPayment = new Map();
  for (const s of sales) {
    const st = saleTotals(s);
    t.revenue += st.revenue; t.cost += st.cost; t.profit += st.profit; t.qty += st.qty; t.discount += st.discount;
    byPayment.set(s.payment || 'cash', (byPayment.get(s.payment || 'cash') || 0) + st.revenue);
    // знижку чеку розподіляємо пропорційно між позиціями
    const k = st.gross > 0 ? st.revenue / st.gross : 0;
    for (const i of s.items || []) {
      const key = i.recipeId || i.name;
      const p = byProduct.get(key) || { name: i.name, qty: 0, revenue: 0, cost: 0 };
      p.qty += Number(i.qty) || 0;
      p.revenue += (Number(i.qty) || 0) * (Number(i.price) || 0) * k;
      p.cost += (Number(i.qty) || 0) * (Number(i.cost) || 0);
      byProduct.set(key, p);
    }
  }
  const expTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byExpCat = new Map();
  for (const e of expenses) byExpCat.set(e.category || 'Інше', (byExpCat.get(e.category || 'Інше') || 0) + (Number(e.amount) || 0));

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
    net: t.profit - expTotal,
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
