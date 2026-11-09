import { useEffect, useState } from 'react';

let setJob = null;

/** Друкує React-вміст: printDoc(<Receipt …/>, { page: '58mm auto' }) */
export function printDoc(node, { page = 'A4', margin = '8mm' } = {}) {
  if (setJob) setJob({ node, page, margin, key: Date.now() });
}

export function PrintHost() {
  const [job, setJ] = useState(null);
  useEffect(() => { setJob = setJ; return () => { setJob = null; }; }, []);
  useEffect(() => {
    if (!job) return undefined;
    const done = () => setJ(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 80);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [job]);
  if (!job) return null;
  return (
    <div className="print-root" key={job.key}>
      <style>{`@page { size: ${job.page}; margin: ${job.margin}; }`}</style>
      {job.node}
    </div>
  );
}
