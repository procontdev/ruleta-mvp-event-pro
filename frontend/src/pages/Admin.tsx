import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminEvent, type AdminPrize } from '../lib/api';

type Styles = { [k: string]: React.CSSProperties };

export default function Admin() {
  // --------- state: eventos ----------
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  // formulario de evento (crea/edita inline)
  const [eventName, setEventName] = useState('');
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  // --------- state: premios ----------
  const emptyPrize = { nombre: '', peso: 1, stock: 0, esPerdedor: false, activo: true };
  const [prizes, setPrizes] = useState<AdminPrize[]>([]);
  const [prizeForm, setPrizeForm] = useState({ ...emptyPrize });
  const [editingPrizeId, setEditingPrizeId] = useState<number | null>(null);

  // --------- misc ----------
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  // =================== data loading ===================
  const loadEvents = async () => {
    setError('');
    try {
      setLoading(true);
      const list = await adminApi.listEvents();
      setEvents(list);
      if (list.length && selectedEventId == null) {
        setSelectedEventId(list[0].id);
        setEventName('');
        setEditingEventId(null);
      }
    } catch (e: any) {
      setError(e?.body?.error || e?.message || 'Error cargando eventos');
    } finally {
      setLoading(false);
    }
  };

  const loadPrizes = async (eventId: number) => {
    setError('');
    try {
      setLoading(true);
      const list = await adminApi.listPrizes(eventId);
      setPrizes(list);
    } catch (e: any) {
      setError(e?.body?.error || e?.message || 'Error cargando premios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { if (selectedEventId != null) { loadPrizes(selectedEventId); resetPrizeForm(); } }, [selectedEventId]);

  // =================== helpers: sumas y validaciones básicas ===================
  const weightSumActive = useMemo(
    () => prizes.filter(p => p.activo).reduce((acc, p) => acc + p.peso, 0),
    [prizes]
  );

  const prospectiveSumOnCreate = useMemo(() => {
    return (prizeForm.activo ? prizeForm.peso : 0) + weightSumActive;
  }, [prizeForm, weightSumActive]);

  const prospectiveSumOnEdit = useMemo(() => {
    if (editingPrizeId == null) return weightSumActive;
    const current = prizes.find(p => p.id === editingPrizeId);
    const base = current && current.activo ? weightSumActive - current.peso : weightSumActive;
    return base + (prizeForm.activo ? prizeForm.peso : 0);
  }, [editingPrizeId, prizeForm, weightSumActive, prizes]);

  // ⚠️ Solo alertamos por suma ≠ 100. NO bloqueamos guardar.
  const currentSum = editingPrizeId ? prospectiveSumOnEdit : prospectiveSumOnCreate;
  const sumIs100 = currentSum === 100;

  // Errores SOLO de campos (no de suma)
  const prizeFormErrors = useMemo(() => {
    const errs: string[] = [];
    if (!prizeForm.nombre.trim()) errs.push('Nombre requerido');
    if (!(prizeForm.peso >= 1 && prizeForm.peso <= 100)) errs.push('Peso entre 1 y 100');
    if (!prizeForm.esPerdedor && prizeForm.stock < 0) errs.push('Stock ≥ 0');
    return errs;
  }, [prizeForm]);

  const canSubmitPrize =
    prizeForm.nombre.trim().length > 0 &&
    prizeForm.peso >= 1 &&
    prizeForm.peso <= 100 &&
    (prizeForm.esPerdedor ? true : prizeForm.stock >= 0);

  function resetPrizeForm() {
    setPrizeForm({ ...emptyPrize });
    setEditingPrizeId(null);
  }

  // Ajustar perdedor al restante (si existe)
  function adjustLoserToRemainder() {
    if (selectedEventId == null) return;
    const activosNoPerd = prizes.filter(p => p.activo && !p.esPerdedor);
    const perd = prizes.find(p => p.esPerdedor);
    if (!perd) { alert('No hay segmento perdedor para ajustar.'); return; }

    const sumNoPerd = activosNoPerd.reduce((a, p) => a + p.peso, 0);
    const rest = 100 - sumNoPerd;

    if (editingPrizeId === perd.id) {
      setPrizeForm(prev => ({ ...prev, peso: Math.max(0, rest), activo: true, esPerdedor: true }));
    } else {
      setEditingPrizeId(perd.id);
      setPrizeForm({ nombre: perd.nombre, peso: Math.max(0, rest), stock: 0, esPerdedor: true, activo: true });
    }
  }

  // Normalizar: reescala TODOS los activos para que sumen 100 (proporcional + redondeo “mayores residuos”)
  async function normalizeWeights() {
    if (selectedEventId == null) return;
    const actives = prizes.filter(p => p.activo);
    const sum = actives.reduce((a, p) => a + p.peso, 0);
    if (sum <= 0) return;

    // proporción
    const scaled = actives.map(p => {
      const exact = (p.peso * 100) / sum;
      return { p, exact, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });

    // asigna floors
    let total = scaled.reduce((a, s) => a + s.floor, 0);
    let remain = 100 - total;

    // ordena por mayor fracción y distribuye el restante
    scaled.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < scaled.length && remain > 0; i++) {
      scaled[i].floor += 1;
      remain -= 1;
    }

    // aplica a TODOS los premios (activos: nuevo peso; inactivos: igual)
    setNormalizing(true);
    try {
      for (const s of scaled) {
        await adminApi.updatePrize(s.p.id, {
          nombre: s.p.nombre,
          peso: s.floor,
          stock: s.p.esPerdedor ? 0 : s.p.stock,
          esPerdedor: s.p.esPerdedor,
          activo: true
        });
      }
      // no activos quedan igual
      for (const p of prizes.filter(p => !p.activo)) {
        await adminApi.updatePrize(p.id, {
          nombre: p.nombre,
          peso: p.peso,
          stock: p.esPerdedor ? 0 : p.stock,
          esPerdedor: p.esPerdedor,
          activo: false
        });
      }
      await loadPrizes(selectedEventId);
      resetPrizeForm();
    } finally {
      setNormalizing(false);
    }
  }

  // =================== eventos: acciones ===================
  const createEvent = async () => {
    if (!eventName.trim()) return;
    await adminApi.createEvent(eventName.trim());
    setEventName('');
    await loadEvents();
  };

  const startEditEvent = (id: number, nombre: string) => {
    setEditingEventId(id);
    setEventName(nombre);
    setSelectedEventId(id);
  };

  const updateEvent = async () => {
    if (editingEventId == null || !eventName.trim()) return;
    await adminApi.updateEvent(editingEventId, eventName.trim());
    setEditingEventId(null);
    setEventName('');
    await loadEvents();
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEventName('');
  };

  const deleteEvent = async (id: number) => {
    if (!confirm('¿Borrar evento?')) return;
    await adminApi.deleteEvent(id);
    if (selectedEventId === id) setSelectedEventId(null);
    if (editingEventId === id) cancelEditEvent();
    await loadEvents();
  };

  // =================== premios: acciones ===================
  const onPrizeChange = (field: keyof typeof prizeForm, value: any) => {
    setPrizeForm(prev => ({ ...prev, [field]: value }));
  };

  const createPrize = async () => {
    if (selectedEventId == null || !canSubmitPrize) return;
    await adminApi.createPrize(selectedEventId, {
      nombre: prizeForm.nombre.trim(),
      peso: Number(prizeForm.peso),
      stock: Number(prizeForm.esPerdedor ? 0 : prizeForm.stock),
      esPerdedor: prizeForm.esPerdedor,
      activo: prizeForm.activo
    });
    resetPrizeForm();
    await loadPrizes(selectedEventId);
  };

  const startEditPrize = (p: AdminPrize) => {
    setEditingPrizeId(p.id);
    setPrizeForm({
      nombre: p.nombre, peso: p.peso, stock: p.stock,
      esPerdedor: p.esPerdedor, activo: p.activo
    });
  };

  const updatePrize = async () => {
    if (editingPrizeId == null || !canSubmitPrize) return;
    await adminApi.updatePrize(editingPrizeId, {
      nombre: prizeForm.nombre.trim(),
      peso: Number(prizeForm.peso),
      stock: Number(prizeForm.esPerdedor ? 0 : prizeForm.stock),
      esPerdedor: prizeForm.esPerdedor,
      activo: prizeForm.activo
    });
    if (selectedEventId != null) {
      resetPrizeForm();
      await loadPrizes(selectedEventId);
    }
  };

  const cancelEditPrize = () => { resetPrizeForm(); };

  const deletePrize = async (p: AdminPrize) => {
    if (!confirm('¿Borrar premio?')) return;
    await adminApi.deletePrize(p.id);
    if (selectedEventId != null) await loadPrizes(selectedEventId);
    if (editingPrizeId === p.id) resetPrizeForm();
  };

  // =================== render ===================
  return (
    <div style={s.container}>
      <h1 style={s.h1}>Administrador</h1>
      {error && <div style={s.error}>{error}</div>}

      <div style={s.grid}>
        {/* --------- Eventos --------- */}
        <div style={s.card}>
          <h2 style={s.h2}>Eventos</h2>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={s.input}
              placeholder={editingEventId ? `Renombrar evento #${editingEventId}` : 'Nombre del evento'}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />

            {editingEventId ? (
              <>
                <button style={s.button} onClick={updateEvent} disabled={!eventName.trim()}>
                  Actualizar
                </button>
                <button style={s.small} onClick={cancelEditEvent}>Cancelar</button>
              </>
            ) : (
              <button style={s.button} onClick={createEvent} disabled={!eventName.trim()}>
                Crear
              </button>
            )}
          </div>

          <div>
            {events.map(e => (
              <div key={e.id} style={{
                ...s.row, ...(selectedEventId === e.id ? s.rowActive : {})
              }}>
                <div onClick={() => setSelectedEventId(e.id)} style={{ cursor: 'pointer' }}>
                  <b>#{e.id}</b> — {e.nombre}
                  <div style={{ fontSize: 12, opacity: .8 }}>
                    Premios: {e.premios} · Stock total: {e.stockTotal}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={s.small} onClick={() => startEditEvent(e.id, e.nombre)}>Editar</button>
                  <button style={s.smallDanger} onClick={() => deleteEvent(e.id)}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --------- Premios --------- */}
        <div style={s.card}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
            <h2 style={s.h2}>Premios {selectedEventId != null && <>· Evento #{selectedEventId}</>}</h2>
            <div style={{ fontSize: 14, opacity: .95, display:'flex', alignItems:'center', gap:8 }}>
              Peso total activo: <b style={{ color: sumIs100 ? '#22c55e' : '#fbbf24' }}>{currentSum}/100</b>
              <button style={s.small} onClick={adjustLoserToRemainder} title="Ajusta el perdedor al resto">Ajustar perdedor</button>
              <button style={{...s.small, opacity: normalizing? .6: 1}} disabled={normalizing} onClick={normalizeWeights} title="Reescalar proporcionalmente a 100">
                {normalizing ? 'Normalizando…' : 'Normalizar pesos'}
              </button>
            </div>
          </div>

          {/* Barra visual de suma */}
          <div style={{ background:'#1f2937', borderRadius:8, overflow:'hidden', height:10, margin:'6px 0 12px' }}>
            <div style={{ width:`${Math.min(100,Math.max(0,currentSum))}%`, height:'100%', background: sumIs100 ? '#22c55e' : '#fbbf24' }} />
          </div>

          {/* Form inline crear/editar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .6fr .7fr .6fr auto auto', gap: 8, alignItems: 'center' }}>
            <input style={s.input} placeholder="Nombre"
              value={prizeForm.nombre} onChange={(e) => onPrizeChange('nombre', e.target.value)} />
            <input style={s.input} type="number" placeholder="Peso" min={1} max={100}
              value={prizeForm.peso} onChange={(e) => onPrizeChange('peso', Number(e.target.value))} />
            <input style={{ ...s.input, opacity: prizeForm.esPerdedor ? 0.6 : 1 }} type="number" placeholder="Stock" min={0}
              disabled={prizeForm.esPerdedor} value={prizeForm.esPerdedor ? 0 : prizeForm.stock}
              onChange={(e) => onPrizeChange('stock', Number(e.target.value))} />
            <label style={s.chk}><input type="checkbox" checked={prizeForm.esPerdedor}
              onChange={(e) => onPrizeChange('esPerdedor', e.target.checked)} /> Perdedor</label>
            <label style={s.chk}><input type="checkbox" checked={prizeForm.activo}
              onChange={(e) => onPrizeChange('activo', e.target.checked)} /> Activo</label>

            {editingPrizeId ? (
              <>
                <button style={{...s.button, opacity: canSubmitPrize? 1:.6}} onClick={updatePrize} disabled={!canSubmitPrize}>
                  Actualizar
                </button>
                <button style={s.small} onClick={cancelEditPrize}>Cancelar</button>
              </>
            ) : (
              <button style={{...s.button, opacity: canSubmitPrize? 1:.6}} onClick={createPrize} disabled={selectedEventId == null || !canSubmitPrize}>
                Agregar
              </button>
            )}
          </div>

          {/* Mensajes de validación (solo campos) */}
          {prizeFormErrors.length > 0 && (
            <ul style={{ marginTop: 8, color: '#fecaca' }}>
              {prizeFormErrors.map((m, i) => <li key={i}>• {m}</li>)}
            </ul>
          )}

          {/* Lista premios */}
          <div style={{ marginTop: 10 }}>
            {prizes.map(p => (
              <div key={p.id} style={s.row}>
                <div>
                  <b>#{p.id}</b> — {p.nombre}
                  <div style={{ fontSize: 12, opacity: .8 }}>
                    Peso: {p.peso} · Stock: {p.esPerdedor ? '—' : p.stock} · {p.esPerdedor ? 'Perdedor' : 'Premio'} · {p.activo ? 'Activo' : 'Inactivo'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={s.small} onClick={() => startEditPrize(p)}>Editar</button>
                  <button style={s.smallDanger} onClick={() => deletePrize(p)}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && <div style={{ marginTop: 8, opacity: .8 }}>Cargando…</div>}
    </div>
  );
}

const s: Styles = {
  container: { minHeight: '100svh', background: '#0f172a', color: '#e2e8f0', padding: 16, fontFamily: 'Inter, system-ui, Arial' },
  h1: { margin: '0 0 12px 0' },
  h2: { margin: '0 0 8px 0' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' },
  card: { background: '#111827', padding: 16, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.25)' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px', borderBottom: '1px solid #1f2937' },
  rowActive: { background: '#0b1220', borderRadius: 8 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#0b1220', color: '#e2e8f0' },
  button: { padding: '10px 14px', borderRadius: 8, border: 'none', background: '#06b6d4', color: '#0b1220', fontWeight: 700, cursor: 'pointer' },
  small: { padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer' },
  smallDanger: { padding: '6px 10px', borderRadius: 8, border: '1px solid #7f1d1d', background: 'transparent', color: '#fecaca', cursor: 'pointer' },
  error: { marginTop: 10, color: '#fecaca', background: '#7f1d1d', padding: 8, borderRadius: 8 },
  chk: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }
};
