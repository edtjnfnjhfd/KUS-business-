import { useCallback, useEffect, useRef, useState } from 'react';
import { produce } from 'immer';
import { uid } from './calc.js';

const KEY = 'kus-cookie-manager-v1';
const LOCAL_KEY = 'kus-local-v1';
export const SCHEMA_VERSION = 2;

/** Колекції записів (кожен запис має id і _u — час останньої зміни). */
export const COLLECTIONS = [
  'ingredients', 'recipes', 'sales', 'expenses', 'supplies', 'adjustments', 'orders',
  'customers', 'accounts', 'moneyMoves', 'shifts', 'employees',
];

export const EXPENSE_CATEGORIES = ['Оренда', 'Реклама', 'Обладнання', 'Доставка', 'Комунальні', 'Зарплата', 'Податки', 'Банк / еквайринг', 'Інше'];
export const INGREDIENT_CATEGORIES = ['Основа', 'Начинка', 'Декор', 'Пакування', 'Інше'];
export const ROLES = {
  owner: 'Власник',
  manager: 'Менеджер',
  cashier: 'Касир',
  baker: 'Пекар',
};
export const ORDER_STATUSES = {
  new: { label: 'Нове', tone: 'blue' },
  confirmed: { label: 'Підтверджене', tone: 'blue' },
  baking: { label: 'Готується', tone: 'amber' },
  ready: { label: 'Готове', tone: 'green' },
  done: { label: 'Видане', tone: 'grey' },
  cancelled: { label: 'Скасоване', tone: 'red' },
};
export const DEFAULT_ACCOUNTS = [
  { id: 'cash', name: 'Каса (готівка)', type: 'cash' },
  { id: 'card', name: 'Термінал / картка', type: 'card' },
  { id: 'transfer', name: 'Рахунок ФОП', type: 'bank' },
];
export const DEBT = 'debt';

export function paymentLabel(state, id) {
  if (id === DEBT) return 'В борг';
  if (id === 'other') return 'Інше';
  return state.accounts.find((a) => a.id === id)?.name || id;
}

export function emptySettings() {
  return {
    brandName: 'KUS',
    tagline: 'cookies',
    accent: '#c8743a',
    logo: '',
    currency: '₴',
    city: 'Київ',
    targetMargin: 65,
    bonusPct: 0,
    channels: ['Точка', 'Instagram', 'Telegram', 'Маркет', 'Доставка', 'Опт'],
    defaultChannel: 'Точка',
    requirePin: false,
    producer: '',
    telegram: { token: '', chatId: '', onShiftClose: true, daily: false, lastDaily: '' },
    checkbox: { enabled: false, licenseKey: '', pinCode: '', test: true, mode: 'ask' },
  };
}

export function emptyState() {
  const s = { version: SCHEMA_VERSION, settings: emptySettings(), deleted: {} };
  for (const c of COLLECTIONS) s[c] = [];
  s.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  return s;
}

function ing(name, category, baseUnit, packQty, packPrice, minStock = 0) {
  return { id: uid(), name, category, baseUnit, packQty, packPrice, minStock, note: '', updatedAt: new Date().toISOString(), history: [] };
}

/** Демо-дані, щоб одразу було видно, як усе працює. Можна видалити в Налаштуваннях. */
export function demoState() {
  const s = emptyState();
  const flour = ing('Борошно пшеничне в/г', 'Основа', 'g', 1000, 32, 3000);
  const butter = ing('Масло вершкове 82%', 'Основа', 'g', 200, 98, 1000);
  const brown = ing('Цукор коричневий', 'Основа', 'g', 1000, 120, 1000);
  const sugar = ing('Цукор білий', 'Основа', 'g', 1000, 38, 500);
  const eggs = ing('Яйця С1', 'Основа', 'pcs', 10, 62, 10);
  const soda = ing('Сода харчова', 'Основа', 'g', 500, 30);
  const salt = ing('Сіль', 'Основа', 'g', 1000, 18);
  const vanilla = ing('Ванільний екстракт', 'Основа', 'ml', 50, 185);
  const choc = ing('Шоколад чорний 54% (каллети)', 'Начинка', 'g', 1000, 520, 1000);
  const milkChoc = ing('Шоколад молочний (каллети)', 'Начинка', 'g', 1000, 560, 500);
  const nuts = ing('Горіх пекан', 'Начинка', 'g', 500, 450, 300);
  const cocoa = ing('Какао-порошок алкалізований', 'Основа', 'g', 250, 140);
  const box1 = ing('Пакет крафт з вікном', 'Пакування', 'pcs', 100, 350, 50);
  const box4 = ing('Коробка на 4 печива', 'Пакування', 'pcs', 50, 900, 10);
  const sticker = ing('Наліпка з логотипом', 'Пакування', 'pcs', 500, 600, 50);
  s.ingredients = [flour, butter, brown, sugar, eggs, soda, salt, vanilla, choc, milkChoc, nuts, cocoa, box1, box4, sticker];

  const line = (i, qty, perPiece = false) => ({ id: uid(), type: 'ing', refId: i.id, qty, perPiece });
  const label = { allergens: 'Глютен, яйця, молоко. Може містити сліди горіхів.', shelfLifeDays: 7, storage: 'Зберігати при t° від +5 до +25 °C' };

  const classic = {
    id: uid(), name: 'Classic Chocolate Chip', category: 'Печиво', emoji: '🍪', yieldQty: 12, salePrice: 95, wholesalePrice: 70, wastePct: 3, active: true, note: 'Тісто відпочиває в холодильнику 24 год. Вага кульки ~110 г.', ...label,
    items: [line(flour, 380), line(butter, 230), line(brown, 220), line(sugar, 80), line(eggs, 2), line(soda, 5), line(salt, 4), line(vanilla, 8), line(choc, 300), line(box1, 1, true), line(sticker, 1, true)],
    extras: [{ id: uid(), name: 'Електроенергія (піч)', amount: 25 }],
  };
  const double = {
    id: uid(), name: 'Double Chocolate', category: 'Печиво', emoji: '🍫', yieldQty: 12, salePrice: 105, wholesalePrice: 78, wastePct: 3, active: true, note: '', ...label,
    items: [line(flour, 320), line(cocoa, 60), line(butter, 230), line(brown, 220), line(sugar, 70), line(eggs, 2), line(soda, 5), line(salt, 4), line(choc, 200), line(milkChoc, 150), line(box1, 1, true), line(sticker, 1, true)],
    extras: [{ id: uid(), name: 'Електроенергія (піч)', amount: 25 }],
  };
  const pecan = {
    id: uid(), name: 'Pecan Caramel', category: 'Печиво', emoji: '🥜', yieldQty: 12, salePrice: 115, wholesalePrice: 85, wastePct: 3, active: true, note: '', ...label, allergens: 'Глютен, яйця, молоко, горіхи (пекан).',
    items: [line(flour, 380), line(butter, 230), line(brown, 250), line(sugar, 50), line(eggs, 2), line(soda, 5), line(salt, 5), line(vanilla, 8), line(nuts, 200), line(milkChoc, 150), line(box1, 1, true), line(sticker, 1, true)],
    extras: [{ id: uid(), name: 'Електроенергія (піч)', amount: 25 }],
  };
  const box = {
    id: uid(), name: 'Набір «Mix 4»', category: 'Набори', emoji: '🎁', yieldQty: 1, salePrice: 380, wholesalePrice: 0, wastePct: 0, active: true, note: '2 Classic + 1 Double + 1 Pecan', ...label, allergens: 'Глютен, яйця, молоко, горіхи.',
    items: [
      { id: uid(), type: 'rec', refId: classic.id, qty: 2, perPiece: false },
      { id: uid(), type: 'rec', refId: double.id, qty: 1, perPiece: false },
      { id: uid(), type: 'rec', refId: pecan.id, qty: 1, perPiece: false },
      line(box4, 1), line(sticker, 1),
    ],
    extras: [],
  };
  s.recipes = [classic, double, pecan, box];

  // Стартові залишки, щоб склад не був порожнім
  s.supplies = [{
    id: uid(), date: new Date(Date.now() - 3 * 86400000).toISOString(), supplier: 'Metro', accountId: '', note: 'Стартові залишки (демо)',
    items: s.ingredients.map((i) => ({ ingredientId: i.id, qty: i.packQty * (i.baseUnit === 'pcs' ? 1 : 3), total: i.packPrice * (i.baseUnit === 'pcs' ? 1 : 3) })),
  }];
  s.customers = [
    { id: uid(), name: 'Олена Коваль', phone: '+380671234567', instagram: '@olena.k', birthday: '', type: 'retail', discountPct: 0, note: 'Любить Pecan' },
    { id: uid(), name: 'Кав’ярня «Зерно»', phone: '+380501112233', instagram: '', birthday: '', type: 'wholesale', discountPct: 0, note: 'Опт, щопонеділка 24 шт' },
  ];
  s.employees = [{ id: uid(), name: 'Власник', role: 'owner', pin: '', ratePerShift: 0, salesPct: 0, active: true }];
  return s;
}

/** Доповнює/мігрує структуру (старі файли, імпорт, дані з хмари). */
export function normalize(raw) {
  const base = emptyState();
  const s = { ...base, ...(raw || {}) };
  s.settings = { ...base.settings, ...(raw?.settings || {}) };
  s.settings.telegram = { ...base.settings.telegram, ...(raw?.settings?.telegram || {}) };
  s.settings.checkbox = { ...base.settings.checkbox, ...(raw?.settings?.checkbox || {}) };
  delete s.settings.apiKey; delete s.settings.model;
  for (const k of COLLECTIONS) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.accounts.length) s.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  if (!s.deleted || typeof s.deleted !== 'object') s.deleted = {};
  s.ingredients = s.ingredients.map((i) => ({ history: [], category: 'Інше', baseUnit: 'g', packQty: 1000, packPrice: 0, minStock: 0, ...i, id: i.id || uid() }));
  s.recipes = s.recipes.map((r) => ({ items: [], extras: [], yieldQty: 1, salePrice: 0, wholesalePrice: 0, wastePct: 0, active: true, emoji: '🍪', category: 'Печиво', allergens: '', shelfLifeDays: 0, storage: '', ...r, id: r.id || uid() }));
  s.sales = s.sales.map((x) => ({ type: 'sale', discount: 0, prepaid: 0, bonusUsed: 0, bonusEarned: 0, consumption: [], ...x }));
  s.version = SCHEMA_VERSION;
  return s;
}

// ───────────── Локальні (не синхронізовані) налаштування цього пристрою ─────────────

export function loadLocal() {
  try {
    return { apiKey: '', model: 'claude-opus-5-5', sync: { url: '', key: '' }, employeeId: '', ...JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') };
  } catch {
    return { apiKey: '', model: 'claude-opus-5-5', sync: { url: '', key: '' }, employeeId: '' };
  }
}
export function saveLocal(l) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

function load() {
  try {
    const txt = localStorage.getItem(KEY);
    if (txt) {
      const raw = JSON.parse(txt);
      // міграція: API-ключ раніше лежав у спільних налаштуваннях
      if (raw?.settings?.apiKey) {
        const l = loadLocal();
        saveLocal({ ...l, apiKey: raw.settings.apiKey, model: raw.settings.model || l.model });
      }
      return normalize(raw);
    }
  } catch (e) {
    console.warn('Не вдалося прочитати збережені дані', e);
  }
  return null;
}

/**
 * Позначає змінені записи часом зміни (_u), видалені — у deleted.
 * Завдяки immer незмінені записи зберігають ту саму ідентичність, тож порівняння дешеве.
 */
export function stamp(prev, next, now = Date.now()) {
  if (prev === next) return next;
  return produce(next, (d) => {
    for (const c of COLLECTIONS) {
      if (prev[c] === next[c]) continue;
      const before = new Map((prev[c] || []).map((r) => [r.id, r]));
      d[c].forEach((r, k) => {
        if (before.get(r.id) !== next[c][k]) r._u = now;
        before.delete(r.id);
      });
      for (const id of before.keys()) d.deleted[id] = now;
    }
    if (prev.settings !== next.settings) d.settings._u = now;
  });
}

/** Злиття двох станів: по кожному запису перемагає новіший (_u), видалення — якщо новіше за запис. */
export function mergeStates(a, b) {
  const out = { ...a, deleted: { ...(a.deleted || {}) } };
  for (const [id, t] of Object.entries(b.deleted || {})) out.deleted[id] = Math.max(out.deleted[id] || 0, t);
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const r of [...(a[c] || []), ...(b[c] || [])]) {
      const ex = map.get(r.id);
      if (!ex || (r._u || 0) > (ex._u || 0)) map.set(r.id, r);
    }
    // зберігаємо порядок: спершу як у a, далі нові з b
    const order = [...(a[c] || []).map((r) => r.id), ...(b[c] || []).map((r) => r.id)];
    const seen = new Set();
    out[c] = [];
    for (const id of order) {
      if (seen.has(id)) continue;
      seen.add(id);
      const r = map.get(id);
      if (out.deleted[id] && out.deleted[id] >= (r._u || 0)) continue;
      out[c].push(r);
    }
  }
  out.settings = (b.settings?._u || 0) > (a.settings?._u || 0) ? b.settings : a.settings;
  return normalize(out);
}

/**
 * Глобальний стан додатку з автозбереженням.
 * update(draft => { ...змінюємо чернетку... })
 */
export function useStore() {
  const [state, setState] = useState(() => load() || stamp(emptyState(), demoState()));
  const [local, setLocalState] = useState(loadLocal);
  const [saveError, setSaveError] = useState('');
  const listeners = useRef(new Set());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setSaveError('');
    } catch {
      setSaveError('Не вдалося зберегти дані в браузері (можливо, переповнене сховище). Зробіть експорт резервної копії.');
    }
    for (const fn of listeners.current) fn(state);
  }, [state]);

  const update = useCallback((fn) => {
    // fn може випадково щось повернути (напр. Object.assign) — ігноруємо, змінюємо лише чернетку
    setState((prev) => stamp(prev, produce(prev, (d) => { fn(d); })));
  }, []);

  /** Повна заміна (імпорт, «чистий аркуш»): усе старе позначається видаленим, щоб це дійшло й до інших пристроїв. */
  const replace = useCallback((s) => {
    setState((prev) => stamp(prev, normalize({ ...s, deleted: { ...(prev.deleted || {}), ...(s.deleted || {}) } })));
  }, []);

  /** Злиття з даними з хмари (без позначення як локальні зміни). */
  const mergeRemote = useCallback((remote) => {
    setState((prev) => mergeStates(prev, remote));
  }, []);

  const setLocal = useCallback((patch) => {
    setLocalState((l) => {
      const n = { ...l, ...(typeof patch === 'function' ? patch(l) : patch) };
      saveLocal(n);
      return n;
    });
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return { state, update, replace, mergeRemote, local, setLocal, saveError, subscribe };
}

/** Змінює ціну інгредієнта і записує попередню в історію. */
export function setIngredientPrice(draft, id, { packPrice, packQty }, source = 'вручну') {
  const i = draft.ingredients.find((x) => x.id === id);
  if (!i) return;
  const newPrice = packPrice ?? i.packPrice;
  const newQty = packQty ?? i.packQty;
  if (Number(newPrice) === Number(i.packPrice) && Number(newQty) === Number(i.packQty)) return;
  i.history = [...(i.history || []), { date: i.updatedAt || new Date().toISOString(), packPrice: i.packPrice, packQty: i.packQty, source: i.lastSource || '' }].slice(-50);
  i.packPrice = Number(newPrice) || 0;
  i.packQty = Number(newQty) || 0;
  i.updatedAt = new Date().toISOString();
  i.lastSource = source;
}

/** Наступний номер замовлення. */
export function nextOrderNumber(state) {
  return state.orders.reduce((m, o) => Math.max(m, Number(o.number) || 0), 0) + 1;
}
