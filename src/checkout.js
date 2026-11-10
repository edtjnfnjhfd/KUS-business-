// Створення продажу: фіксує собівартість і списання складу на момент продажу,
// рахує бонуси, прив'язує до зміни/працівника.
import { consumptionFor, customerStats, round2, saleTotals, uid } from './calc.js';

/** Ціна для клієнта: оптова для оптовиків, якщо задана. */
export function priceFor(recipe, customer) {
  if (customer?.type === 'wholesale' && Number(recipe.wholesalePrice) > 0) return Number(recipe.wholesalePrice);
  return Number(recipe.salePrice) || 0;
}

/**
 * @param {object} p
 *  items: [{recipeId, name, qty, price}], discount, bonusUsed, deliveryFee, payment, customerId, channel, note, date, prepaid, orderId, employeeId, type
 */
export function buildSale(state, costs, p) {
  const shift = state.shifts.find((s) => !s.closedAt);
  const isReturn = p.type === 'return';
  const items = p.items.map((l) => ({
    recipeId: l.recipeId, name: l.name,
    qty: Number(l.qty) || 0, price: Number(l.price) || 0,
    cost: l.cost != null ? Number(l.cost) : round2(costs.get(l.recipeId)?.perPiece || 0),
  }));
  const bonusUsed = Math.max(0, Number(p.bonusUsed) || 0);
  const sale = {
    id: uid(),
    type: isReturn ? 'return' : 'sale',
    date: p.date || new Date().toISOString(),
    items,
    discount: round2((Number(p.discount) || 0) + bonusUsed),
    bonusUsed,
    prepaid: Number(p.prepaid) || 0,
    deliveryFee: isReturn ? 0 : Math.max(0, Number(p.deliveryFee) || 0),
    payment: p.payment || 'cash',
    customerId: p.customerId || '',
    channel: p.channel || state.settings.defaultChannel || '',
    note: p.note || '',
    orderId: p.orderId || '',
    returnOf: p.returnOf || '',
    employeeId: p.employeeId || '',
    shiftId: shift?.id || '',
    consumption: isReturn ? [] : consumptionFor(state, items),
  };
  const pctB = Number(state.settings.bonusPct) || 0;
  sale.bonusEarned = sale.customerId && pctB > 0 && !isReturn ? round2(saleTotals(sale).goods * pctB / 100) : 0;
  if (isReturn && sale.customerId) {
    // повертаємо нараховані за повернений товар бонуси (від'ємне нарахування)
    sale.bonusEarned = pctB > 0 ? round2(saleTotals(sale).revenue * pctB / 100) : 0;
  }
  return sale;
}

/** Скільки бонусів клієнт може використати на цей чек. */
export function maxBonus(state, customerId, gross) {
  if (!customerId) return 0;
  return Math.max(0, Math.min(customerStats(state, customerId).bonus, gross));
}

/** Повернення: копія позицій з від'ємною кількістю. */
export function buildReturn(state, costs, original, lines, payment) {
  return buildSale(state, costs, {
    type: 'return',
    items: lines.map((l) => ({ ...l, qty: -Math.abs(l.qty) })),
    payment: payment || original.payment,
    customerId: original.customerId,
    channel: original.channel,
    returnOf: original.id,
    note: 'Повернення до чеку від ' + new Date(original.date).toLocaleDateString('uk-UA'),
  });
}
