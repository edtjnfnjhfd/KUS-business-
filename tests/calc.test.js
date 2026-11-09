import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCosts, marginInfo, priceForMargin, buildReport, periodRange, saleTotals, toBase } from '../src/calc.js';
import { setIngredientPrice } from '../src/store.js';

function base() {
  const ingredients = [
    { id: 'flour', name: 'Борошно', baseUnit: 'g', packQty: 1000, packPrice: 40, history: [] },
    { id: 'egg', name: 'Яйця', baseUnit: 'pcs', packQty: 10, packPrice: 60, history: [] },
    { id: 'bag', name: 'Пакет', baseUnit: 'pcs', packQty: 100, packPrice: 300, history: [] },
  ];
  const recipes = [
    { id: 'c', name: 'Cookie', yieldQty: 10, wastePct: 10, salePrice: 50, items: [
      { id: 'i1', type: 'ing', refId: 'flour', qty: 500 }, // 20
      { id: 'i2', type: 'ing', refId: 'egg', qty: 2 }, // 12
      { id: 'i3', type: 'ing', refId: 'bag', qty: 1, perPiece: true }, // 3*10 = 30
    ], extras: [{ id: 'e', name: 'Газ', amount: 8 }] },
    { id: 'box', name: 'Box', yieldQty: 1, salePrice: 200, items: [{ id: 'b1', type: 'rec', refId: 'c', qty: 4 }], extras: [] },
  ];
  return { ingredients, recipes, sales: [], expenses: [], settings: {} };
}

test('собівартість: втрати, штучне пакування, дод. витрати', () => {
  const c = computeCosts(base()).get('c');
  // (20+12)*1.1 + 30 + 8 = 73.2
  assert.equal(Math.round(c.batch * 100) / 100, 73.2);
  assert.equal(Math.round(c.perPiece * 1000) / 1000, 7.32);
  assert.equal(c.doughG, 500);
});

test('набір з інших техкарт', () => {
  const c = computeCosts(base()).get('box');
  assert.equal(Math.round(c.perPiece * 100) / 100, 29.28);
});

test('зміна ціни інгредієнта перераховує собівартість і пише історію', () => {
  const s = base();
  setIngredientPrice(s, 'flour', { packPrice: 80 });
  const c = computeCosts(s).get('c');
  // (40+12)*1.1+30+8 = 95.2
  assert.equal(Math.round(c.batch * 100) / 100, 95.2);
  assert.equal(s.ingredients[0].history.length, 1);
  assert.equal(s.ingredients[0].history[0].packPrice, 40);
  setIngredientPrice(s, 'flour', { packPrice: 80 }); // без змін — без запису
  assert.equal(s.ingredients[0].history.length, 1);
});

test('цикл не зависає', () => {
  const s = base();
  s.recipes[0].items.push({ id: 'x', type: 'rec', refId: 'box', qty: 1 });
  const costs = computeCosts(s);
  assert.ok(costs.get('c').error === 'cycle' || costs.get('box').error === 'cycle');
});

test('маржа і рекомендована ціна', () => {
  const m = marginInfo(30, 100);
  assert.equal(m.marginPct, 70);
  assert.equal(Math.round(m.markupPct), 233);
  assert.equal(Math.round(priceForMargin(30, 70)), 100);
});

test('одиниці', () => {
  assert.deepEqual(toBase(2, 'kg'), { qty: 2000, base: 'g' });
  assert.deepEqual(toBase(0.5, 'l'), { qty: 500, base: 'ml' });
});

test('звіт: періоди, знижки, витрати', () => {
  const s = base();
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  s.sales = [
    { id: '1', date: now.toISOString(), items: [{ recipeId: 'c', name: 'Cookie', qty: 3, price: 50, cost: 7 }], discount: 10, payment: 'cash' },
    { id: '2', date: yesterday.toISOString(), items: [{ recipeId: 'c', name: 'Cookie', qty: 1, price: 50, cost: 7 }], discount: 0, payment: 'card' },
  ];
  s.expenses = [{ id: 'e', date: now.toISOString(), category: 'Реклама', amount: 20 }];
  const today = buildReport(s, periodRange('today', now));
  assert.equal(today.revenue, 140);
  assert.equal(today.cost, 21);
  assert.equal(today.profit, 119);
  assert.equal(today.net, 99);
  const all = buildReport(s, periodRange('all', now));
  assert.equal(all.revenue, 190);
  assert.equal(all.qty, 4);
  assert.equal(saleTotals(s.sales[0]).discount, 10);
});
