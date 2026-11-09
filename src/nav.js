import POS from './pages/POS.jsx';
import Orders from './pages/Orders.jsx';
import Sales from './pages/Sales.jsx';
import Shifts from './pages/Shifts.jsx';
import Plan from './pages/Plan.jsx';
import Recipes from './pages/Recipes.jsx';
import Labels from './pages/Labels.jsx';
import Stock from './pages/Stock.jsx';
import Supplies from './pages/Supplies.jsx';
import Inventory from './pages/Inventory.jsx';
import Ingredients from './pages/Ingredients.jsx';
import Customers from './pages/Customers.jsx';
import Reports from './pages/Reports.jsx';
import Analytics from './pages/Analytics.jsx';
import Money from './pages/Money.jsx';
import Expenses from './pages/Expenses.jsx';
import Staff from './pages/Staff.jsx';
import Assistant from './pages/Assistant.jsx';
import Settings from './pages/Settings.jsx';

export const NAV = [
  { group: 'Продажі', items: [
    { id: 'pos', icon: '🧾', label: 'Каса', perm: 'pos', C: POS },
    { id: 'orders', icon: '📦', label: 'Замовлення', short: 'Замовл.', perm: 'orders', C: Orders },
    { id: 'sales', icon: '🧮', label: 'Чеки', perm: 'sales', C: Sales },
    { id: 'shifts', icon: '🕐', label: 'Касові зміни', perm: 'shifts', C: Shifts },
  ] },
  { group: 'Виробництво', items: [
    { id: 'plan', icon: '🥣', label: 'План випічки', short: 'План', perm: 'plan', C: Plan },
    { id: 'recipes', icon: '📋', label: 'Техкарти', perm: 'recipes', C: Recipes },
    { id: 'labels', icon: '🏷️', label: 'Етикетки', perm: 'labels', C: Labels },
  ] },
  { group: 'Склад', items: [
    { id: 'stock', icon: '🏬', label: 'Залишки', perm: 'stock', C: Stock },
    { id: 'supplies', icon: '🚚', label: 'Постачання', perm: 'stock', C: Supplies },
    { id: 'inventory', icon: '⚖️', label: 'Інвентаризація', perm: 'stock', C: Inventory },
    { id: 'ingredients', icon: '🧈', label: 'Інгредієнти', perm: 'recipes', C: Ingredients },
  ] },
  { group: 'Клієнти', items: [
    { id: 'customers', icon: '👥', label: 'Клієнти та опт', perm: 'customers', C: Customers },
  ] },
  { group: 'Фінанси', items: [
    { id: 'reports', icon: '📊', label: 'Звіти', perm: 'finance', C: Reports },
    { id: 'analytics', icon: '📈', label: 'Аналітика', perm: 'finance', C: Analytics },
    { id: 'money', icon: '💳', label: 'Гроші й рахунки', perm: 'finance', C: Money },
    { id: 'expenses', icon: '💸', label: 'Витрати', perm: 'finance', C: Expenses },
    { id: 'staff', icon: '💼', label: 'Персонал і зарплата', perm: 'staff', C: Staff },
  ] },
  { group: 'Інше', items: [
    { id: 'ai', icon: '✨', label: 'AI-помічник', perm: 'ai', C: Assistant },
    { id: 'settings', icon: '⚙️', label: 'Налаштування', perm: 'settings', C: Settings },
  ] },
];

export const ALL_PAGES = NAV.flatMap((g) => g.items);

/** Права за роллю. costs — бачити собівартість і прибуток. */
const ROLE_PERMS = {
  owner: '*',
  manager: ['pos', 'orders', 'sales', 'shifts', 'plan', 'recipes', 'labels', 'stock', 'customers', 'finance', 'ai', 'costs', 'editSales'],
  cashier: ['pos', 'orders', 'sales', 'shifts', 'plan', 'labels', 'customers'],
  baker: ['plan', 'recipes', 'labels', 'stock'],
};

export function permsFor(role) {
  const p = ROLE_PERMS[role] || ROLE_PERMS.cashier;
  return (perm) => p === '*' || p.includes(perm);
}
