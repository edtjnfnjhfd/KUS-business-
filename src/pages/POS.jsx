import { useMemo, useState } from 'react';
import { PAYMENTS } from '../store.js';
import { buildReport, money, num, periodRange, round2, saleTotals, toLocalInput, uid } from '../calc.js';
import { Empty, Num, Stat } from '../components/ui.jsx';

export default function POS({ state, update, costs, go }) {
  const cur = state.settings.currency;
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState('cash');
  const [note, setNote] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [flash, setFlash] = useState('');

  const products = state.recipes.filter((r) => r.active);
  const today = useMemo(() => buildReport(state, periodRange('today')), [state]);

  const addToCart = (r) => {
    setCart((c) => {
      const ex = c.find((x) => x.recipeId === r.id);
      if (ex) return c.map((x) => (x.recipeId === r.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { recipeId: r.id, name: r.name, emoji: r.emoji, qty: 1, price: Number(r.salePrice) || 0 }];
    });
  };
  const setLine = (rid, patch) => setCart((c) => c.map((x) => (x.recipeId === rid ? { ...x, ...patch } : x)).filter((x) => x.qty > 0));

  const draft = { items: cart.map((l) => ({ ...l, cost: costs.get(l.recipeId)?.perPiece || 0 })), discount };
  const t = saleTotals(draft);

  const checkout = () => {
    if (!cart.length) return;
    const sale = {
      id: uid(),
      date: customDate ? new Date(customDate).toISOString() : new Date().toISOString(),
      // Фіксуємо собівартість на момент продажу — щоб старі звіти не «пливли» при зміні цін
      items: cart.map((l) => ({ recipeId: l.recipeId, name: l.name, qty: l.qty, price: l.price, cost: round2(costs.get(l.recipeId)?.perPiece || 0) })),
      discount: Number(discount) || 0,
      payment,
      note,
    };
    update((d) => { d.sales.push(sale); });
    setCart([]); setDiscount(0); setNote(''); setCustomDate('');
    setFlash(`Продаж на ${money(t.revenue, cur)} збережено ✓`);
    setTimeout(() => setFlash(''), 2500);
  };

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Каса</h1>
          <p className="muted">Натисніть на товар, щоб додати в чек.</p>
        </div>
      </header>

      <div className="stats">
        <Stat label="Виручка сьогодні" value={money(today.revenue, cur)} />
        <Stat label="Прибуток сьогодні" value={money(today.profit, cur)} sub="виручка − собівартість" />
        <Stat label="Продано" value={`${num(today.qty)} шт`} sub={`${today.checks} чеків`} />
      </div>

      <div className="pos-layout">
        <div className="pos-products">
          {products.length === 0 ? (
            <Empty icon="📋" title="Немає товарів для продажу">
              Створіть техкарту з ціною і позначкою «Показувати в касі».{' '}
              <button className="link" onClick={() => go('recipes')}>До техкарт →</button>
            </Empty>
          ) : (
            <div className="prod-grid">
              {products.map((r) => {
                const inCart = cart.find((x) => x.recipeId === r.id);
                return (
                  <button key={r.id} className={'prod' + (inCart ? ' in' : '')} onClick={() => addToCart(r)}>
                    {inCart && <span className="badge">{inCart.qty}</span>}
                    <span className="prod-emoji">{r.emoji || '🍪'}</span>
                    <span className="prod-name">{r.name}</span>
                    <span className="prod-price">{money(r.salePrice, cur)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pos-cart card pad">
          <h3>Чек</h3>
          {cart.length === 0 ? <p className="muted">Порожньо</p> : (
            <ul className="cart">
              {cart.map((l) => (
                <li key={l.recipeId}>
                  <div className="cart-name">{l.emoji} {l.name}</div>
                  <div className="cart-ctrl">
                    <button className="qty-btn" onClick={() => setLine(l.recipeId, { qty: l.qty - 1 })} aria-label="Менше">−</button>
                    <Num className="qty" value={l.qty} onChange={(v) => setLine(l.recipeId, { qty: Math.max(0, Math.round(v)) })} aria-label="Кількість" />
                    <button className="qty-btn" onClick={() => setLine(l.recipeId, { qty: l.qty + 1 })} aria-label="Більше">+</button>
                    <span className="muted">×</span>
                    <Num className="inline" value={l.price} onChange={(v) => setLine(l.recipeId, { price: v })} aria-label="Ціна" />
                    <b className="cart-sum">{money(l.qty * l.price, cur)}</b>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="cart-opts">
            <label className="row gap">Знижка, {cur} <Num className="inline" value={discount} onChange={setDiscount} /></label>
            <div className="chips">
              {Object.entries(PAYMENTS).map(([k, v]) => (
                <button key={k} className={'chip' + (payment === k ? ' on' : '')} onClick={() => setPayment(k)}>{v}</button>
              ))}
            </div>
            <input placeholder="Коментар (клієнт, замовлення…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <details>
              <summary className="muted small">Інша дата продажу</summary>
              <input type="datetime-local" value={customDate || toLocalInput(new Date())} onChange={(e) => setCustomDate(e.target.value)} />
            </details>
          </div>

          <dl className="calc">
            <dt>Разом</dt><dd className="big">{money(t.revenue, cur)}</dd>
            <dt className="muted">Собівартість</dt><dd className="muted">{money(t.cost, cur)}</dd>
            <dt className="muted">Прибуток</dt><dd className={t.profit < 0 ? 'neg' : 'pos'}>{money(t.profit, cur)}</dd>
          </dl>
          <button className="btn primary block lg" disabled={!cart.length} onClick={checkout}>Пробити продаж</button>
          {cart.length > 0 && <button className="btn ghost block" onClick={() => setCart([])}>Очистити</button>}
          {flash && <div className="alert ok">{flash}</div>}
        </div>
      </div>
    </section>
  );
}
