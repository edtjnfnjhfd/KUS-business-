import { test } from 'node:test';
import assert from 'node:assert/strict';
import { produce } from 'immer';
import { explode, consumptionFor, computeStock, bakePlan, accountBalances, customerStats, abc, shiftCash, payroll, periodRange, buildReport, labelComposition } from '../src/calc.js';
import { emptyState, demoState, stamp, mergeStates, normalize } from '../src/store.js';

function base() {
  const s = emptyState();
  s.ingredients = [
    { id: 'flour', name: 'Борошно', category: 'Основа', baseUnit: 'g', packQty: 1000, packPrice: 40 },
    { id: 'egg', name: 'Яйця', category: 'Основа', baseUnit: 'pcs', packQty: 10, packPrice: 60 },
    { id: 'bag', name: 'Пакет', category: 'Пакування', baseUnit: 'pcs', packQty: 100, packPrice: 300 },
    { id: 'box', name: 'Коробка', category: 'Пакування', baseUnit: 'pcs', packQty: 10, packPrice: 100 },
  ];
  s.recipes = [
    { id: 'c', name: 'Cookie', yieldQty: 10, wastePct: 10, salePrice: 50, items: [
      { id: 'i1', type: 'ing', refId: 'flour', qty: 500 },
      { id: 'i2', type: 'ing', refId: 'egg', qty: 2 },
      { id: 'i3', type: 'ing', refId: 'bag', qty: 1, perPiece: true },
    ], extras: [] },
    { id: 'set', name: 'Box 4', yieldQty: 1, salePrice: 200, items: [
      { id: 'b1', type: 'rec', refId: 'c', qty: 4 },
      { id: 'b2', type: 'ing', refId: 'box', qty: 1 },
    ], extras: [] },
  ];
  return s;
}

test('explode: техкарта і набір → інгредієнти з втратами', () => {
  const s = base();
  const m = explode(s, 'c', 10);
  assert.equal(Math.round(m.get('flour')), 550); // 500 × 1.1
  assert.equal(m.get('bag'), 10);
  const box = explode(s, 'set', 1);
  assert.equal(Math.round(box.get('flour')), 220); // 4 печива × 50 г × 1.1
  assert.equal(box.get('bag'), 4);
  assert.equal(box.get('box'), 1);
});

test('склад: постачання − продажі + коригування', () => {
  const s = base();
  s.supplies = [{ id: 'sp', date: '2026-01-01T10:00:00Z', items: [{ ingredientId: 'flour', qty: 2000, total: 80 }] }];
  s.sales = [{ id: 's1', date: '2026-01-02T10:00:00Z', items: [{ recipeId: 'c', qty: 10, price: 50, cost: 5 }], consumption: consumptionFor(s, [{ recipeId: 'c', qty: 10 }]) }];
  s.adjustments = [{ id: 'a', date: '2026-01-03T10:00:00Z', type: 'writeoff', items: [{ ingredientId: 'flour', qty: -100 }] }];
  const st = computeStock(s);
  assert.equal(Math.round(st.get('flour')), 2000 - 550 - 100);
});

test('план випічки: цілі заміси і нестача', () => {
  const s = base();
  s.supplies = [{ id: 'sp', date: '2026-01-01', items: [{ ingredientId: 'flour', qty: 600 }, { ingredientId: 'bag', qty: 100 }, { ingredientId: 'egg', qty: 30 }, { ingredientId: 'box', qty: 10 }] }];
  const plan = bakePlan(s, new Map([['c', 5], ['set', 2]])); // 5 + 8 = 13 печива → 2 заміси
  const row = plan.rows.find((r) => r.recipe.id === 'c');
  assert.equal(row.pieces, 13);
  assert.equal(row.batches, 2);
  assert.equal(row.spare, 7);
  const flour = plan.ingredients.find((x) => x.ing.id === 'flour');
  assert.equal(Math.round(flour.qty), 1100);
  assert.equal(Math.round(flour.short), 500);
  assert.equal(flour.packs, 1);
  const box = plan.ingredients.find((x) => x.ing.id === 'box');
  assert.equal(box.qty, 2);
});

test('рахунки: продажі, передоплата, борг, витрати, перекази', () => {
  const s = base();
  s.orders = [{ id: 'o', number: 1, status: 'done', prepaid: 100, prepaidAccount: 'card', createdAt: '2026-01-01' }];
  s.sales = [
    { id: 's1', date: '2026-01-02', payment: 'cash', items: [{ qty: 2, price: 50, cost: 5 }], discount: 0 },
    { id: 's2', date: '2026-01-02', payment: 'cash', orderId: 'o', prepaid: 100, items: [{ qty: 1, price: 200, cost: 20 }], discount: 0 },
    { id: 's3', date: '2026-01-02', payment: 'debt', customerId: 'k', items: [{ qty: 4, price: 70, cost: 7 }], discount: 0 },
  ];
  s.expenses = [{ id: 'e', date: '2026-01-02', amount: 30, accountId: 'cash', category: 'Інше' }];
  s.moneyMoves = [
    { id: 'm1', date: '2026-01-03', type: 'transfer', accountId: 'cash', toAccountId: 'transfer', amount: 50 },
    { id: 'm2', date: '2026-01-03', type: 'debtPayment', accountId: 'transfer', customerId: 'k', amount: 80 },
  ];
  const b = accountBalances(s);
  assert.equal(b.get('cash'), 100 + 100 - 30 - 50);
  assert.equal(b.get('card'), 100);
  assert.equal(b.get('transfer'), 130);
  assert.equal(customerStats(s, 'k').debt, 200);
});

test('зміна: очікувана готівка', () => {
  const s = base();
  s.sales = [{ id: 's1', date: '2026-01-02T12:00:00Z', payment: 'cash', items: [{ qty: 2, price: 50, cost: 5 }] }];
  const sh = { openedAt: '2026-01-02T08:00:00Z', closedAt: '2026-01-02T20:00:00Z', openingCash: 500 };
  assert.equal(shiftCash(s, sh).expected, 600);
});

test('ABC', () => {
  const r = abc([{ name: 'a', revenue: 800 }, { name: 'b', revenue: 150 }, { name: 'c', revenue: 50 }]);
  assert.deepEqual(r.map((x) => x.cls), ['A', 'B', 'C']);
});

test('бонуси клієнта', () => {
  const s = base();
  s.sales = [
    { id: '1', date: '2026-01-01', customerId: 'k', payment: 'cash', items: [{ qty: 1, price: 100, cost: 1 }], bonusEarned: 5 },
    { id: '2', date: '2026-01-02', customerId: 'k', payment: 'cash', items: [{ qty: 1, price: 100, cost: 1 }], discount: 3, bonusUsed: 3, bonusEarned: 4.85 },
  ];
  const st = customerStats(s, 'k');
  assert.equal(st.bonus, 6.85);
  assert.equal(st.spent, 197);
});

test('зарплата: ставка + % продажів − виплачене', () => {
  const s = base();
  s.employees = [{ id: 'e', name: 'Іра', ratePerShift: 500, salesPct: 5 }];
  s.shifts = [{ id: 'sh', employeeId: 'e', openedAt: new Date().toISOString(), closedAt: new Date().toISOString() }];
  s.sales = [{ id: '1', date: new Date().toISOString(), employeeId: 'e', items: [{ qty: 10, price: 100, cost: 10 }] }];
  s.moneyMoves = [{ id: 'm', type: 'salary', employeeId: 'e', accountId: 'cash', amount: -200, date: new Date().toISOString() }];
  const [p] = payroll(s, periodRange('month'));
  assert.equal(p.accrued, 550);
  assert.equal(p.due, 350);
  const rep = buildReport(s, periodRange('month'));
  assert.equal(rep.expenses, 200);
});

test('синхронізація: позначки змін, видалення і злиття', () => {
  const a0 = normalize(base());
  const a1 = stamp(a0, produce(a0, (d) => { d.ingredients[0].packPrice = 50; }), 1000);
  assert.equal(a1.ingredients[0]._u, 1000);
  assert.equal(a1.ingredients[1]._u, undefined);
  // інший пристрій: видалив яйця і додав клієнта
  const b1 = stamp(a0, produce(a0, (d) => { d.ingredients.splice(1, 1); d.customers.push({ id: 'k', name: 'Оля' }); }), 2000);
  assert.equal(b1.deleted.egg, 2000);
  const m = mergeStates(a1, b1);
  assert.equal(m.ingredients.find((i) => i.id === 'flour').packPrice, 50);
  assert.ok(!m.ingredients.some((i) => i.id === 'egg'));
  assert.equal(m.customers.length, 1);
  // новіша зміна перемагає
  const a2 = stamp(a1, produce(a1, (d) => { d.ingredients[0].packPrice = 60; }), 3000);
  assert.equal(mergeStates(b1, a2).ingredients.find((i) => i.id === 'flour').packPrice, 60);
});

test('демо-дані валідні, етикетка без пакування', () => {
  const s = demoState();
  const comp = labelComposition(s, s.recipes[0].id);
  assert.match(comp, /^Борошно/);
  assert.ok(!/Пакет|Наліпка/.test(comp));
});
