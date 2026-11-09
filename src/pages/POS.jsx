import { useEffect, useMemo, useRef, useState } from 'react';
import { DEBT, nextOrderNumber } from '../store.js';
import { buildReport, money, num, periodRange, saleTotals, toLocalInput, uid } from '../calc.js';
import { buildSale, maxBonus, priceFor } from '../checkout.js';
import { fiscalize, explainFiscalError } from '../fiscal.js';
import { CustomerPicker, Empty, Num, PageHead, Stat, Toast, useToast } from '../components/ui.jsx';
import { printDoc } from '../components/Print.jsx';
import { ReceiptDoc } from '../components/Docs.jsx';

export default function POS({ state, update, costs, go, can, user }) {
  const cur = state.settings.currency;
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [discMode, setDiscMode] = useState('sum'); // sum | pct
  const [useBonus, setUseBonus] = useState(false);
  const [payment, setPayment] = useState('cash');
  const [customerId, setCustomerId] = useState('');
  const [channel, setChannel] = useState(state.settings.defaultChannel || '');
  const [note, setNote] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [toast, showToast] = useToast();
  const [lastSale, setLastSale] = useState(null);
  const cb = state.settings.checkbox;
  const [fiscalOn, setFiscalOn] = useState(cb.enabled && cb.mode === 'always');
  const cartRef = useRef(null);
  const searchRef = useRef(null);

  const customer = state.customers.find((c) => c.id === customerId);
  const products = state.recipes.filter((r) => r.active);
  const cats = [...new Set(products.map((r) => r.category || 'Інше'))];
  const shown = products.filter((r) => (!cat || (r.category || 'Інше') === cat) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const today = useMemo(() => buildReport(state, periodRange('today')), [state]);
  const openShift = state.shifts.find((s) => !s.closedAt);

  // Переоцінка кошика при зміні клієнта (оптові ціни, персональна знижка)
  useEffect(() => {
    setCart((c) => c.map((l) => { const r = state.recipes.find((x) => x.id === l.recipeId); return r && !l.manualPrice ? { ...l, price: priceFor(r, customer) } : l; }));
    if (customer?.discountPct) { setDiscMode('pct'); setDiscount(Number(customer.discountPct)); }
    if (!customer && payment === DEBT) setPayment('cash');
    if (customer?.type === 'wholesale' && state.settings.channels.includes('Опт')) setChannel('Опт');
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cb.enabled) return;
    const acc = state.accounts.find((a) => a.id === payment);
    if (cb.mode === 'always') setFiscalOn(payment !== DEBT);
    else if (cb.mode === 'card') setFiscalOn(acc && acc.type !== 'cash');
  }, [payment, cb.enabled, cb.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ПК: «/» — пошук, Ctrl+Enter — оплатити
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.getElementById('pos-pay')?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addToCart = (r) => {
    setCart((c) => {
      const ex = c.find((x) => x.recipeId === r.id);
      if (ex) return c.map((x) => (x.recipeId === r.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { recipeId: r.id, name: r.name, emoji: r.emoji, qty: 1, price: priceFor(r, customer) }];
    });
  };
  const setLine = (rid, patch) => setCart((c) => c.map((x) => (x.recipeId === rid ? { ...x, ...patch } : x)).filter((x) => x.qty > 0));

  const gross = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const discAmount = Math.min(gross, discMode === 'pct' ? gross * (Number(discount) || 0) / 100 : Number(discount) || 0);
  const bonusAvail = maxBonus(state, customerId, gross - discAmount);
  const bonusUsed = useBonus ? bonusAvail : 0;
  const draft = { items: cart.map((l) => ({ ...l, cost: costs.get(l.recipeId)?.perPiece || 0 })), discount: discAmount + bonusUsed };
  const t = saleTotals(draft);

  const reset = () => { setCart([]); setDiscount(0); setDiscMode('sum'); setNote(''); setCustomDate(''); setCustomerId(''); setUseBonus(false); setPayment('cash'); setChannel(state.settings.defaultChannel || ''); };

  const checkout = async () => {
    if (!cart.length) return;
    if (payment === DEBT && !customerId) { showToast('Для продажу в борг оберіть клієнта'); return; }
    const sale = buildSale(state, costs, {
      items: cart, discount: discAmount, bonusUsed, payment, customerId, channel, note,
      date: customDate ? new Date(customDate).toISOString() : undefined, employeeId: user?.id,
    });
    const wantFiscal = cb.enabled && fiscalOn && payment !== DEBT;
    if (wantFiscal) sale.fiscal = { status: 'pending' };
    update((d) => { d.sales.push(sale); });
    setLastSale(sale);
    reset();
    showToast(`Продаж на ${money(t.revenue, cur)} збережено ✓`);
    if (wantFiscal) {
      try {
        const f = await fiscalize(state, sale);
        update((d) => { const s = d.sales.find((x) => x.id === sale.id); if (s) s.fiscal = f; });
        showToast(f.status === 'DONE' ? `Фіскальний чек ✓ ${f.fiscalCode}` : `Чек у черзі Checkbox (${f.status})`);
      } catch (e) {
        update((d) => { const s = d.sales.find((x) => x.id === sale.id); if (s) s.fiscal = { status: 'error', error: explainFiscalError(e) }; });
        showToast('⚠️ Фіскальний чек не створено: ' + explainFiscalError(e));
      }
    }
  };

  const toOrder = () => {
    if (!cart.length) return;
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(12, 0, 0, 0);
    const number = nextOrderNumber(state);
    update((d) => {
      d.orders.push({
        id: uid(), number, createdAt: new Date().toISOString(), dueAt: due.toISOString(), status: 'new',
        customerId, channel, delivery: 'pickup', address: '', items: cart.map(({ recipeId, name, qty, price }) => ({ recipeId, name, qty, price })),
        discount: discAmount, prepaid: 0, prepaidAccount: '', note,
      });
    });
    reset();
    showToast(`Замовлення №${number} створено`);
    go('orders');
  };

  const payOptions = [...state.accounts.map((a) => ({ id: a.id, label: a.name })), ...(customerId ? [{ id: DEBT, label: 'В борг' }] : [])];
  const cartQty = cart.reduce((s, l) => s + l.qty, 0);

  return (
    <section>
      <PageHead title="Каса" sub={<>Натисніть на товар, щоб додати в чек. <span className="hide-mobile">На ПК: «/» — пошук, Ctrl+Enter — оплатити.</span></>} />

      {!openShift && can('shifts') && (
        <div className="alert info">Касова зміна не відкрита. <button className="link" onClick={() => go('shifts')}>Відкрити зміну →</button></div>
      )}

      <div className="stats stats-3">
        <Stat label="Виручка сьогодні" value={money(today.revenue, cur)} sub={`${today.checks} чеків`} />
        {can('costs') && <Stat label="Прибуток сьогодні" value={money(today.profit, cur)} sub="виручка − собівартість" />}
        <Stat label="Продано" value={`${num(today.qty)} шт`} sub={`сер. чек ${money(today.avgCheck, cur)}`} />
      </div>

      <div className="pos-layout">
        <div className="pos-products">
          <div className="toolbar">
            <input ref={searchRef} className="search" placeholder="Пошук товару…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {cats.length > 1 && (
            <div className="chips scroll-x">
              <button className={'chip' + (!cat ? ' on' : '')} onClick={() => setCat('')}>Усі</button>
              {cats.map((c) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
            </div>
          )}
          {products.length === 0 ? (
            <Empty icon="📋" title="Немає товарів для продажу">
              Створіть техкарту з ціною і позначкою «Показувати в касі».{' '}
              {can('recipes') && <button className="link" onClick={() => go('recipes')}>До техкарт →</button>}
            </Empty>
          ) : (
            <div className="prod-grid">
              {shown.map((r) => {
                const inCart = cart.find((x) => x.recipeId === r.id);
                return (
                  <button key={r.id} className={'prod' + (inCart ? ' in' : '')} onClick={() => addToCart(r)}>
                    {inCart && <span className="badge">{inCart.qty}</span>}
                    <span className="prod-emoji" aria-hidden>{r.emoji || '🍪'}</span>
                    <span className="prod-name">{r.name}</span>
                    <span className="prod-price">{money(priceFor(r, customer), cur)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pos-cart card pad" ref={cartRef}>
          <div className="row between"><h3>Чек</h3>{cart.length > 0 && <button className="btn ghost small" onClick={reset}>Очистити</button>}</div>
          <CustomerPicker
            customers={state.customers}
            value={customerId}
            onChange={setCustomerId}
            onCreate={(name) => { const id = uid(); const phone = /^[+\d\s()-]{6,}$/.test(name) ? name : ''; update((d) => { d.customers.push({ id, name: phone ? 'Клієнт ' + phone.slice(-4) : name, phone, type: 'retail', discountPct: 0 }); }); return id; }}
          />

          {cart.length === 0 ? <p className="muted cart-empty">Порожньо — оберіть товари</p> : (
            <ul className="cart">
              {cart.map((l) => (
                <li key={l.recipeId}>
                  <div className="cart-name">{l.emoji} {l.name}</div>
                  <div className="cart-ctrl">
                    <div className="stepper">
                      <button className="qty-btn" onClick={() => setLine(l.recipeId, { qty: l.qty - 1 })} aria-label="Менше">−</button>
                      <Num className="qty" value={l.qty} onChange={(v) => setLine(l.recipeId, { qty: Math.max(0, Math.round(v)) })} aria-label="Кількість" />
                      <button className="qty-btn" onClick={() => setLine(l.recipeId, { qty: l.qty + 1 })} aria-label="Більше">+</button>
                    </div>
                    <span className="muted">×</span>
                    <Num className="price-in" value={l.price} onChange={(v) => setLine(l.recipeId, { price: v, manualPrice: true })} aria-label="Ціна" />
                    <b className="cart-sum">{money(l.qty * l.price, cur)}</b>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="cart-opts">
            <div className="form-row">
              <span className="form-label">Знижка</span>
              <div className="input-group">
                <Num value={discount} onChange={setDiscount} aria-label="Знижка" />
                <button className={'ig-btn' + (discMode === 'sum' ? ' on' : '')} onClick={() => setDiscMode('sum')}>{cur}</button>
                <button className={'ig-btn' + (discMode === 'pct' ? ' on' : '')} onClick={() => setDiscMode('pct')}>%</button>
              </div>
            </div>
            {bonusAvail > 0 && (
              <label className="check"><input type="checkbox" checked={useBonus} onChange={(e) => setUseBonus(e.target.checked)} /> Списати бонуси ({money(bonusAvail, cur)})</label>
            )}
            <div className="form-row">
              <span className="form-label">Оплата</span>
              <div className="chips">
                {payOptions.map((p) => <button key={p.id} className={'chip' + (payment === p.id ? ' on' : '')} onClick={() => setPayment(p.id)}>{p.label}</button>)}
              </div>
            </div>
            <div className="form-row">
              <span className="form-label">Канал</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">—</option>
                {state.settings.channels.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <input placeholder="Коментар" value={note} onChange={(e) => setNote(e.target.value)} />
            <details>
              <summary className="muted small">Інша дата продажу</summary>
              <input type="datetime-local" value={customDate || toLocalInput(new Date())} onChange={(e) => setCustomDate(e.target.value)} />
            </details>
            {cb.enabled && (
              <label className="check"><input type="checkbox" checked={fiscalOn} disabled={payment === DEBT} onChange={(e) => setFiscalOn(e.target.checked)} /> Фіскальний чек (Checkbox{cb.test ? ', тест' : ''})</label>
            )}
          </div>

          <dl className="calc">
            {t.discount > 0 && <><dt className="muted">Знижка</dt><dd className="muted">−{money(t.discount, cur)}</dd></>}
            <dt className="total">До сплати</dt><dd className="total">{money(t.revenue, cur)}</dd>
            {can('costs') && <><dt className="muted">Прибуток</dt><dd className={t.profit < 0 ? 'neg' : 'pos'}>{money(t.profit, cur)}</dd></>}
            {customerId && Number(state.settings.bonusPct) > 0 && <><dt className="muted">Буде нараховано бонусів</dt><dd className="muted">{money(t.revenue * state.settings.bonusPct / 100, cur)}</dd></>}
          </dl>
          <button id="pos-pay" className="btn primary block lg" disabled={!cart.length} onClick={checkout}>
            {payment === DEBT ? 'Записати в борг' : 'Оплатити'} {cart.length > 0 && money(t.revenue, cur)}
          </button>
          <button className="btn ghost block" disabled={!cart.length} onClick={toOrder}>📦 Оформити як замовлення</button>
          {lastSale && (
            <div className="last-sale">
              <span className="muted small">Останній чек: {money(saleTotals(lastSale).revenue, cur)}</span>
              <button className="btn small ghost" onClick={() => printDoc(<ReceiptDoc state={state} sale={lastSale} />, { page: '58mm auto', margin: '2mm' })}>🖨 Друк</button>
            </div>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <button className="cart-bar" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <span>🧾 {num(cartQty)} шт</span><b>{money(t.revenue, cur)}</b><span>До чеку ↓</span>
        </button>
      )}
      <Toast text={toast} />
    </section>
  );
}
