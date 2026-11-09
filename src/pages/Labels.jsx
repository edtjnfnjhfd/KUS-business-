import { useState } from 'react';
import { dayKey, labelComposition } from '../calc.js';
import { Field, Num, PageHead, Seg } from '../components/ui.jsx';
import { LabelSheet } from '../components/Docs.jsx';
import { printDoc } from '../components/Print.jsx';

const SIZES = [
  { id: '58x40', label: 'Термо 58×40 мм', page: '58mm 40mm', margin: '0' },
  { id: '40x30', label: 'Термо 40×30 мм', page: '40mm 30mm', margin: '0' },
  { id: 'a4', label: 'А4 (24 шт, 70×37)', page: 'A4', margin: '0' },
];

export default function Labels({ state, update, costs }) {
  const recipes = state.recipes;
  const [rid, setRid] = useState(recipes[0]?.id || '');
  const [count, setCount] = useState(12);
  const [date, setDate] = useState(dayKey(new Date()));
  const [size, setSize] = useState('58x40');
  const r = recipes.find((x) => x.id === rid);
  const c = costs.get(rid);
  const autoWeight = c ? Math.round(c.pieceWeight || 0) : 0;
  const [weight, setWeight] = useState(null);
  const w = weight ?? r?.netWeight ?? autoWeight;
  const set = (patch) => update((d) => Object.assign(d.recipes.find((x) => x.id === rid), patch));
  const sz = SIZES.find((s) => s.id === size);

  if (!r) return <section><PageHead title="Етикетки" /><p className="muted">Спершу створіть техкарту.</p></section>;

  return (
    <section>
      <PageHead title="Етикетки" sub="Маркування продукції: склад, алергени, маса, дата виготовлення і термін придатності.">
        <button className="btn primary" onClick={() => printDoc(<LabelSheet state={state} recipe={r} count={count} date={date} size={size} weight={w} />, { page: sz.page, margin: sz.margin })}>🖨 Друкувати {count} шт</button>
      </PageHead>
      <div className="grid2 top">
        <div className="card pad">
          <div className="form-grid">
            <Field label="Продукт">
              <select value={rid} onChange={(e) => { setRid(e.target.value); setWeight(null); }}>
                {recipes.map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>)}
              </select>
            </Field>
            <Field label="Кількість етикеток"><Num value={count} onChange={(v) => setCount(Math.max(1, Math.min(500, Math.round(v))))} /></Field>
            <Field label="Дата виготовлення"><input type="date" value={date} onChange={(e) => setDate(e.target.value || dayKey(new Date()))} /></Field>
            <Field label="Маса нетто 1 шт, г" hint={autoWeight ? `з техкарти ≈ ${autoWeight} г` : ''}><Num value={w} onChange={(v) => { setWeight(v); set({ netWeight: v }); }} /></Field>
          </div>
          <Field label="Розмір етикетки"><Seg value={size} onChange={setSize} options={SIZES} /></Field>
          <h4>Дані для маркування (зберігаються в техкарті)</h4>
          <Field label="Склад" hint="Порожньо — береться з техкарти автоматично, за спаданням маси">
            <textarea rows={3} value={r.composition || ''} placeholder={labelComposition(state, r.id)} onChange={(e) => set({ composition: e.target.value })} />
          </Field>
          <Field label="Алергени"><input value={r.allergens || ''} onChange={(e) => set({ allergens: e.target.value })} placeholder="Глютен, яйця, молоко, горіхи…" /></Field>
          <div className="form-grid">
            <Field label="Термін придатності, днів"><Num value={r.shelfLifeDays || 0} onChange={(v) => set({ shelfLifeDays: Math.max(0, Math.round(v)) })} /></Field>
            <Field label="Умови зберігання"><input value={r.storage || ''} onChange={(e) => set({ storage: e.target.value })} /></Field>
          </div>
          <Field label="Виробник (для всіх етикеток)" hint="ФОП, адреса, телефон"><input value={state.settings.producer || ''} onChange={(e) => update((d) => { d.settings.producer = e.target.value; })} /></Field>
        </div>
        <div className="card pad">
          <h3>Попередній перегляд</h3>
          <div className="label-preview">
            <LabelSheet state={state} recipe={r} count={1} date={date} size={size === 'a4' ? '58x40' : size} weight={w} />
          </div>
          <p className="muted small">Для термопринтера етикеток (Xprinter, Godex тощо) у вікні друку оберіть свій принтер і розмір паперу, поля — «Немає».</p>
        </div>
      </div>
    </section>
  );
}
