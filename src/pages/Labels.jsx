import { useEffect, useMemo, useRef, useState } from 'react';
import { dayKey, labelComposition } from '../calc.js';
import { Field, Num, PageHead, Seg, Toast, useToast } from '../components/ui.jsx';
import { LabelSheet } from '../components/Docs.jsx';
import { printDoc } from '../components/Print.jsx';
import { DPIS, LABEL_SIZES, VARIANTS, defaultVariant, labelFileName, renderLabel } from '../labelImage.js';

const SIZES = [
  { id: '40x20', label: '40×20 мм' },
  { id: '40x30', label: '40×30 мм' },
  { id: '58x40', label: '58×40 мм' },
  { id: 'a4', label: 'А4 (24 шт, 70×37)' },
];
const PREF_KEY = 'kus-label-prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } };

export default function Labels({ state, update, costs }) {
  const recipes = state.recipes;
  const prefs = loadPrefs();
  const [rid, setRid] = useState(recipes[0]?.id || '');
  const [count, setCount] = useState(12);
  const [date, setDate] = useState(dayKey(new Date()));
  const [size, setSize] = useState(prefs.size || '40x20');
  const [variantRaw, setVariant] = useState(prefs.variant || defaultVariant(prefs.size || '40x20'));
  // на 40×20 «усе на одній» нечитабельне — показуємо лицьову
  const variant = size === '40x20' && variantRaw === 'full' ? 'front' : variantRaw;
  const [dpi, setDpi] = useState(prefs.dpi || 203);
  const [preview, setPreview] = useState({ url: '', fits: true });
  const [toast, showToast] = useToast();
  const canvasRef = useRef(null);
  const r = recipes.find((x) => x.id === rid);
  const c = costs.get(rid);
  const autoWeight = c ? Math.round(c.pieceWeight || 0) : 0;
  const [weight, setWeight] = useState(null);
  const w = weight ?? r?.netWeight ?? autoWeight;
  const set = (patch) => update((d) => { Object.assign(d.recipes.find((x) => x.id === rid), patch); });
  const thermal = size !== 'a4';

  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ size, variant, dpi })); } catch { /* ignore */ } }, [size, variant, dpi]);

  // Готова картинка етикетки — і для перегляду, і для завантаження, і для друку
  const opts = useMemo(() => ({ size, dpi, date, weight: w, variant }), [size, dpi, date, w, variant]);
  useEffect(() => {
    if (!r || !thermal) return;
    const cv = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    const res = renderLabel(cv, state, r, opts);
    setPreview({ url: cv.toDataURL('image/png'), fits: res.fits, w: res.width, h: res.height });
  }, [r, state, opts, thermal]);

  const changeSize = (s) => { setSize(s); if (s !== 'a4') setVariant(defaultVariant(s)); };

  const download = async () => {
    const cv = document.createElement('canvas');
    renderLabel(cv, state, r, opts);
    const name = labelFileName(r, size, date, variant);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) { showToast('Не вдалося створити файл'); return; }
    const file = new File([blob], name, { type: 'image/png' });
    // На телефоні — меню «Поділитися» (можна одразу «Зберегти зображення»), на ПК — звичайне завантаження
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('Етикетку завантажено ✓');
  };

  const print = () => {
    if (!thermal) {
      printDoc(<LabelSheet state={state} recipe={r} count={count} date={date} size="a4" weight={w} />, { page: 'A4', margin: '0' });
      return;
    }
    const S = LABEL_SIZES[size];
    printDoc(
      <div>{Array.from({ length: count }, (_, k) => <img key={k} src={preview.url} alt="" style={{ width: `${S.w}mm`, height: `${S.h}mm`, display: 'block', pageBreakAfter: 'always' }} />)}</div>,
      { page: `${S.w}mm ${S.h}mm`, margin: '0' },
    );
  };

  if (!r) return <section><PageHead title="Етикетки" /><p className="muted">Спершу створіть техкарту.</p></section>;
  const S = LABEL_SIZES[size];

  return (
    <section>
      <PageHead title="Етикетки" sub="Маркування продукції: склад, алергени, маса, дата виготовлення і термін придатності.">
        {thermal && <button className="btn primary" onClick={download}>⬇ Завантажити для Niimbot</button>}
        <button className={'btn ' + (thermal ? 'ghost' : 'primary')} onClick={print}>🖨 Друкувати {count} шт</button>
      </PageHead>
      <div className="grid2 top">
        <div className="card pad">
          <div className="form-grid">
            <Field label="Продукт">
              <select value={rid} onChange={(e) => { setRid(e.target.value); setWeight(null); }}>
                {recipes.map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>)}
              </select>
            </Field>
            <Field label="Дата виготовлення"><input type="date" value={date} onChange={(e) => setDate(e.target.value || dayKey(new Date()))} /></Field>
            <Field label="Маса нетто 1 шт, г" hint={autoWeight ? `з техкарти ≈ ${autoWeight} г` : ''}><Num value={w} onChange={(v) => { setWeight(v); set({ netWeight: v }); }} /></Field>
            <Field label="Кількість (для друку з ПК)"><Num value={count} onChange={(v) => setCount(Math.max(1, Math.min(500, Math.round(v))))} /></Field>
          </div>
          <Field label="Розмір етикетки"><Seg value={size} onChange={changeSize} options={SIZES} /></Field>
          {thermal && <Field label="Що на етикетці" hint={size === '40x20' ? 'На 40×20 усе разом не вміщується читабельно — друкуйте дві етикетки: лицьову (на кришку) і зворотну (знизу або збоку)' : ''}><Seg value={variant} onChange={setVariant} options={size === '40x20' ? VARIANTS.filter((v) => v.id !== 'full') : VARIANTS} /></Field>}
          {thermal && (
            <Field label="Роздільність принтера" hint="Дивіться в характеристиках принтера. Якщо не знаєте — 203 dpi">
              <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                {DPIS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </Field>
          )}

          <h4>Дані для маркування (зберігаються в техкарті)</h4>
          <Field label="Склад" hint="Порожньо — береться з техкарти автоматично, за спаданням маси">
            <textarea rows={3} value={r.composition || ''} placeholder={labelComposition(state, r.id)} onChange={(e) => set({ composition: e.target.value })} />
          </Field>
          <Field label="Алергени"><input value={r.allergens || ''} onChange={(e) => set({ allergens: e.target.value })} placeholder="Глютен, яйця, молоко, горіхи…" /></Field>
          <div className="form-grid">
            <Field label="Термін придатності, днів"><Num value={r.shelfLifeDays || 0} onChange={(v) => set({ shelfLifeDays: Math.max(0, Math.round(v)) })} /></Field>
            <Field label="Умови зберігання"><input value={r.storage || ''} onChange={(e) => set({ storage: e.target.value })} placeholder="Зберігати в холодильнику" /></Field>
          </div>
          <Field label="Виробник (для всіх етикеток)" hint="ФОП, адреса, телефон"><input value={state.settings.producer || ''} onChange={(e) => update((d) => { d.settings.producer = e.target.value; })} /></Field>
        </div>

        <div className="card pad label-preview-card">
          <h3>Попередній перегляд</h3>
          {thermal ? (
            <>
              <div className="label-img-wrap">
                {preview.url && <img className="label-img" src={preview.url} alt="Етикетка" style={{ aspectRatio: `${S.w} / ${S.h}` }} />}
              </div>
              <p className="muted small">{S.label} · {preview.w}×{preview.h} px · {dpi} dpi. Саме так етикетка виглядатиме після друку (чорно-біла).</p>
              {!preview.fits && <div className="alert warn">Текст не вміщується повністю. Скоротіть склад у полі «Склад» або друкуйте дві етикетки: «Лицьова» і «Зворотна».</div>}

              <details className="niimbot-help" open>
                <summary>Як надрукувати на Niimbot</summary>
                <ol className="steps">
                  <li>Натисніть <b>«⬇ Завантажити для Niimbot»</b>. На телефоні оберіть <b>«Зберегти зображення»</b>, щоб картинка потрапила в галерею.</li>
                  <li>У додатку Niimbot створіть нову етикетку і вкажіть розмір <b>{S.w}×{S.h} мм</b>, як у рулоні.</li>
                  <li>Додайте елемент <b>«Зображення»</b> і виберіть збережену картинку.</li>
                  <li>Розтягніть картинку на всю етикетку (від краю до краю), щоб розмір збігся 1:1.</li>
                  <li>Вкажіть кількість копій і друкуйте. Шаблон можна зберегти в Niimbot. Коли зміниться дата, просто завантажте нову картинку.</li>
                </ol>
                <p className="muted small">Назви кнопок у додатку Niimbot можуть трохи відрізнятися залежно від версії.</p>
              </details>
            </>
          ) : (
            <>
              <div className="label-preview">
                <LabelSheet state={state} recipe={r} count={1} date={date} size="58x40" weight={w} />
              </div>
              <p className="muted small">А4: 24 етикетки на аркуші (70×37 мм) для звичайного принтера.</p>
            </>
          )}
        </div>
      </div>
      <Toast text={toast} />
    </section>
  );
}
