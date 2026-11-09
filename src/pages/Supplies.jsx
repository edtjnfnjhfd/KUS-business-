import { useState } from 'react';
import { setIngredientPrice } from '../store.js';
import { INPUT_UNITS, UNITS, dayKey, fmtDate, fmtQty, money, round2, supplyTotal, uid } from '../calc.js';
import { Empty, Field, Modal, Num, PageHead, PeriodPicker, Toast, confirmDelete, useToast } from '../components/ui.jsx';
import { PERIODS, inRange, periodRange } from '../calc.js';

function unitsFor(base) {
  return Object.entries(INPUT_UNITS).filter(([, u]) => u.base === base);
}

export default function Supplies({ state, update, go }) {
  const cur = state.settings.currency;
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({});
  const [edit, setEdit] = useState(null); // 'new' | id
  const [toast, showToast] = useToast();
  const range = periodRange(period, new Date(), custom);
  const list = state.supplies.filter((s) => inRange(s.date, range)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = list.reduce((s, x) => s + supplyTotal(x), 0);
  const accName = (id) => state.accounts.find((a) => a.id === id)?.name || 'не оплачено з каси';

  return (
    <section>
      <PageHead title="Постачання" sub="Закупівлі інгредієнтів і пакування: додають залишки й оновлюють ціни (а отже — собівартість).">
        <button className="btn ghost" onClick={() => go('ai')}>✨ З чеку через AI</button>
        <button className="btn primary" onClick={() => setEdit('new')}>+ Нове постачання</button>
      </PageHead>
      <PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} periods={PERIODS} />
      <p className="muted">За період: <b>{money(total, cur)}</b> · {list.length} постачань</p>
      {list.length === 0 ? <Empty icon="🚚" title="Постачань за цей період немає" /> : (
        <div className="table-wrap">
          <table className="table stack">
            <thead><tr><th>Дата</th><th>Постачальник</th><th>Позиції</th><th>Оплата</th><th className="r">Сума</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setEdit(s.id)}>
                  <td data-label="Дата" className="nowrap">{fmtDate(s.date)}</td>
                  <td data-label="Постачальник">{s.supplier || <span className="muted">—</span>}{s.note && <div className="muted small">{s.note}</div>}</td>
                  <td data-label="Позиції">{s.items.map((it) => state.ingredients.find((i) => i.id === it.ingredientId)?.name || '?').slice(0, 4).join(', ')}{s.items.length > 4 ? ` +${s.items.length - 4}` : ''}</td>
                  <td data-label="Оплата" className="muted">{accName(s.accountId)}</td>
                  <td data-label="Сума" className="r strong nowrap">{money(supplyTotal(s), cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SupplyEditor id={edit === 'new' ? null : edit} state={state} update={update} onClose={(msg) => { setEdit(null); if (msg) showToast(msg); }} />}
      <Toast text={toast} />
    </section>
  );
}

export function SupplyEditor({ id, state, update, onClose, initial }) {
  const cur = state.settings.currency;
  const existing = id ? state.supplies.find((s) => s.id === id) : null;
  const [d, setD] = useState(() => {
    if (existing) {
      return { ...existing, date: dayKey(existing.date), lines: existing.items.map((it) => { const ing = state.ingredients.find((i) => i.id === it.ingredientId); const big = ing && ing.baseUnit !== 'pcs' && it.qty >= 1000 && it.qty % 1000 === 0; return { key: uid(), ingredientId: it.ingredientId, qty: big ? it.qty / 1000 : it.qty, unit: big ? (ing.baseUnit === 'g' ? 'kg' : 'l') : (ing?.baseUnit || 'g'), total: it.total }; }) };
    }
    return { date: dayKey(new Date()), supplier: '', accountId: 'cash', note: '', lines: initial || [{ key: uid(), ingredientId: '', qty: 1, unit: 'kg', total: 0 }] };
  });
  const [updPrices, setUpdPrices] = useState(!existing);
  const suppliers = [...new Set(state.supplies.map((s) => s.supplier).filter(Boolean))];
  const setLine = (key, patch) => setD((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const total = d.lines.reduce((s, l) => s + (Number(l.total) || 0), 0);

  const save = () => {
    const items = d.lines.filter((l) => l.ingredientId && Number(l.qty) > 0).map((l) => ({ ingredientId: l.ingredientId, qty: (Number(l.qty) || 0) * (INPUT_UNITS[l.unit]?.f || 1), total: round2(l.total) }));
    if (!items.length) { onClose(); return; }
    const rec = { id: existing?.id || uid(), date: new Date(d.date + 'T12:00').toISOString(), supplier: d.supplier, accountId: d.accountId, note: d.note, items };
    update((x) => {
      if (existing) Object.assign(x.supplies.find((s) => s.id === existing.id), rec); else x.supplies.push(rec);
      if (updPrices) for (const it of items) if (it.total > 0) setIngredientPrice(x, it.ingredientId, { packQty: it.qty, packPrice: it.total }, 'постачання' + (d.supplier ? ` (${d.supplier})` : ''));
    });
    onClose(existing ? 'Постачання оновлено' : `Постачання на ${money(total, cur)} збережено, залишки оновлено`);
  };
  const remove = () => {
    if (!confirmDelete('постачання (залишки зменшаться)')) return;
    update((x) => { x.supplies = x.supplies.filter((s) => s.id !== existing.id); });
    onClose('Постачання видалено');
  };

  return (
    <Modal title={existing ? 'Постачання' : 'Нове постачання'} onClose={() => onClose()} wide
      footer={<>{existing && <button className="btn danger ghost" onClick={remove}>Видалити</button>}<span className="grow" /><button className="btn ghost" onClick={() => onClose()}>Скасувати</button><button className="btn primary" onClick={save}>Зберегти</button></>}>
      <div className="grid3">
        <Field label="Дата"><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value || dayKey(new Date()) })} /></Field>
        <Field label="Постачальник">
          <input list="suppliers" value={d.supplier} onChange={(e) => setD({ ...d, supplier: e.target.value })} placeholder="Metro, Сільпо…" />
          <datalist id="suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Оплачено з">
          <select value={d.accountId} onChange={(e) => setD({ ...d, accountId: e.target.value })}>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="">Не з наших рахунків (особисті гроші / вже враховано)</option>
          </select>
        </Field>
      </div>
      <div className="line-list">
        <div className="line-row head hide-mobile"><span className="grow">Інгредієнт</span><span className="w-qty">Кількість</span><span className="w-price">Сума, {cur}</span><span className="w-unit">За кг/л/шт</span><span className="w-x" /></div>
        {d.lines.map((l) => {
          const ing = state.ingredients.find((i) => i.id === l.ingredientId);
          const baseQty = (Number(l.qty) || 0) * (INPUT_UNITS[l.unit]?.f || 1);
          const per = baseQty > 0 ? (Number(l.total) || 0) / baseQty * (UNITS[ing?.baseUnit]?.factor || 1) : 0;
          return (
            <div key={l.key} className="line-row supply-row">
              <select className="grow" value={l.ingredientId} onChange={(e) => { const ni = state.ingredients.find((i) => i.id === e.target.value); setLine(l.key, { ingredientId: e.target.value, unit: ni ? (ni.baseUnit === 'g' ? 'kg' : ni.baseUnit === 'ml' ? 'l' : 'pcs') : l.unit }); }} aria-label="Інгредієнт">
                <option value="">— оберіть —</option>
                {[...state.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <span className="w-qty input-group">
                <Num value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} aria-label="Кількість" />
                <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} aria-label="Одиниця">
                  {unitsFor(ing?.baseUnit || INPUT_UNITS[l.unit]?.base || 'g').map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
                </select>
              </span>
              <span className="w-price"><Num value={l.total} onChange={(v) => setLine(l.key, { total: v })} aria-label="Сума" /></span>
              <span className="w-unit muted small">{ing ? `${money(per, cur)}/${UNITS[ing.baseUnit]?.big}` : ''}</span>
              <button className="icon-btn w-x" onClick={() => setD({ ...d, lines: d.lines.filter((x) => x.key !== l.key) })} aria-label="Прибрати">✕</button>
            </div>
          );
        })}
      </div>
      <button className="btn ghost small" onClick={() => setD({ ...d, lines: [...d.lines, { key: uid(), ingredientId: '', qty: 1, unit: 'kg', total: 0 }] })}>+ Рядок</button>
      <div className="row between wrap gap" style={{ marginTop: 12 }}>
        <label className="check"><input type="checkbox" checked={updPrices} onChange={(e) => setUpdPrices(e.target.checked)} /> Оновити ціни інгредієнтів (і собівартість техкарт)</label>
        <b>Разом: {money(total, cur)}</b>
      </div>
      <Field label="Примітка"><input value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
      {d.lines.some((l) => l.ingredientId) && <p className="muted small">Буде додано на склад: {d.lines.filter((l) => l.ingredientId).map((l) => { const ing = state.ingredients.find((i) => i.id === l.ingredientId); return `${ing?.name} +${fmtQty((Number(l.qty) || 0) * (INPUT_UNITS[l.unit]?.f || 1), ing?.baseUnit)}`; }).join('; ')}</p>}
    </Modal>
  );
}
