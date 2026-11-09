import { useCallback, useEffect, useState } from 'react';
import { uid } from './calc.js';

const KEY = 'kus-cookie-manager-v1';
export const SCHEMA_VERSION = 1;

export const EXPENSE_CATEGORIES = ['Оренда', 'Реклама', 'Обладнання', 'Доставка', 'Комунальні', 'Зарплата', 'Податки', 'Пакування (оптом)', 'Інше'];
export const INGREDIENT_CATEGORIES = ['Основа', 'Начинка', 'Декор', 'Пакування', 'Інше'];
export const PAYMENTS = { cash: 'Готівка', card: 'Картка', transfer: 'Переказ', other: 'Інше' };

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      brandName: 'KUS',
      tagline: 'cookies',
      accent: '#c8743a',
      logo: '',
      currency: '₴',
      city: 'Київ',
      targetMargin: 65,
      apiKey: '',
      model: 'claude-opus-5-5',
    },
    ingredients: [],
    recipes: [],
    sales: [],
    expenses: [],
  };
}

function ing(name, category, baseUnit, packQty, packPrice) {
  return { id: uid(), name, category, baseUnit, packQty, packPrice, note: '', updatedAt: new Date().toISOString(), history: [] };
}

/** Демо-дані, щоб одразу було видно, як усе працює. Можна видалити в Налаштуваннях. */
export function demoState() {
  const s = emptyState();
  const flour = ing('Борошно пшеничне в/г', 'Основа', 'g', 1000, 32);
  const butter = ing('Масло вершкове 82%', 'Основа', 'g', 200, 98);
  const brown = ing('Цукор коричневий', 'Основа', 'g', 1000, 120);
  const sugar = ing('Цукор білий', 'Основа', 'g', 1000, 38);
  const eggs = ing('Яйця С1', 'Основа', 'pcs', 10, 62);
  const soda = ing('Сода харчова', 'Основа', 'g', 500, 30);
  const salt = ing('Сіль', 'Основа', 'g', 1000, 18);
  const vanilla = ing('Ванільний екстракт', 'Основа', 'ml', 50, 185);
  const choc = ing('Шоколад чорний 54% (каллети)', 'Начинка', 'g', 1000, 520);
  const milkChoc = ing('Шоколад молочний (каллети)', 'Начинка', 'g', 1000, 560);
  const nuts = ing('Горіх пекан', 'Начинка', 'g', 500, 450);
  const cocoa = ing('Какао-порошок алкалізований', 'Основа', 'g', 250, 140);
  const box1 = ing('Пакет крафт з вікном', 'Пакування', 'pcs', 100, 350);
  const box4 = ing('Коробка на 4 печива', 'Пакування', 'pcs', 50, 900);
  const sticker = ing('Наліпка з логотипом', 'Пакування', 'pcs', 500, 600);
  s.ingredients = [flour, butter, brown, sugar, eggs, soda, salt, vanilla, choc, milkChoc, nuts, cocoa, box1, box4, sticker];

  const line = (i, qty, perPiece = false) => ({ id: uid(), type: 'ing', refId: i.id, qty, perPiece });

  const classic = {
    id: uid(), name: 'Classic Chocolate Chip', category: 'Печиво', emoji: '🍪', yieldQty: 12, salePrice: 95, wastePct: 3, active: true, note: 'Тісто відпочиває в холодильнику 24 год. Вага кульки ~110 г.',
    items: [line(flour, 380), line(butter, 230), line(brown, 220), line(sugar, 80), line(eggs, 2), line(soda, 5), line(salt, 4), line(vanilla, 8), line(choc, 300), line(box1, 1, true), line(sticker, 1, true)],
    extras: [{ id: uid(), name: 'Електроенергія (піч)', amount: 25 }],
  };
  const double = {
    id: uid(), name: 'Double Chocolate', category: 'Печиво', emoji: '🍫', yieldQty: 12, salePrice: 105, wastePct: 3, active: true, note: '',
    items: [line(flour, 320), line(cocoa, 60), line(butter, 230), line(brown, 220), line(sugar, 70), line(eggs, 2), line(soda, 5), line(salt, 4), line(choc, 200), line(milkChoc, 150), line(box1, 1, true), line(sticker, 1, true)],
    extras: [{ id: uid(), name: 'Електроенергія (піч)', amount: 25 }],
  };
  const pecan = {
    id: uid(), name: 'Pecan Caramel', category: 'Печиво', emoji: '🥜', yieldQty: 12, salePrice: 115, wastePct: 3, active: true, note: '',
    items: [line(flour, 380), line(butter, 230), line(brown, 250), line(sugar, 50), line(eggs, 2), line(soda, 5), line(salt, 5), line(vanilla, 8), line(nuts, 200), line(milkChoc, 150), line(box1, 1, true), line(sticker, 1, true)],
    extras: [{ id: uid(), name: 'Електроенергія (піч)', amount: 25 }],
  };
  const box = {
    id: uid(), name: 'Набір «Mix 4»', category: 'Набори', emoji: '🎁', yieldQty: 1, salePrice: 380, wastePct: 0, active: true, note: '2 Classic + 1 Double + 1 Pecan',
    items: [
      { id: uid(), type: 'rec', refId: classic.id, qty: 2, perPiece: false },
      { id: uid(), type: 'rec', refId: double.id, qty: 1, perPiece: false },
      { id: uid(), type: 'rec', refId: pecan.id, qty: 1, perPiece: false },
      line(box4, 1), line(sticker, 1),
    ],
    extras: [],
  };
  s.recipes = [classic, double, pecan, box];
  return s;
}

/** Мінімальна перевірка/доповнення структури (на випадок імпорту старих файлів). */
export function normalize(raw) {
  const base = emptyState();
  const s = { ...base, ...(raw || {}) };
  s.settings = { ...base.settings, ...(raw?.settings || {}) };
  for (const k of ['ingredients', 'recipes', 'sales', 'expenses']) if (!Array.isArray(s[k])) s[k] = [];
  s.ingredients = s.ingredients.map((i) => ({ history: [], category: 'Інше', baseUnit: 'g', packQty: 1000, packPrice: 0, ...i, id: i.id || uid() }));
  s.recipes = s.recipes.map((r) => ({ items: [], extras: [], yieldQty: 1, salePrice: 0, wastePct: 0, active: true, emoji: '🍪', category: 'Печиво', ...r, id: r.id || uid() }));
  s.version = SCHEMA_VERSION;
  return s;
}

function load() {
  try {
    const txt = localStorage.getItem(KEY);
    if (txt) return normalize(JSON.parse(txt));
  } catch (e) {
    console.warn('Не вдалося прочитати збережені дані', e);
  }
  return null;
}

/**
 * Глобальний стан додатку з автозбереженням у localStorage.
 * update(draft => { ...мутуємо копію... })
 */
export function useStore() {
  const [state, setState] = useState(() => load() || demoState());
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setSaveError('');
    } catch (e) {
      setSaveError('Не вдалося зберегти дані в браузері (можливо, переповнене сховище). Зробіть експорт резервної копії.');
    }
  }, [state]);

  const update = useCallback((fn) => {
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const replace = useCallback((s) => setState(normalize(s)), []);

  return { state, update, replace, saveError };
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
