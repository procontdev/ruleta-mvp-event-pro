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

  // =================== helpers: validaciones ===================
  const weightSum = useMemo(() =>
    prizes.filter(p => p.activo).reduce((acc, p) => acc + p.peso, 0), [prizes]);

  const prospectiveSumOnCreate = useMemo(() => {
    return (prizeForm.activo ? prizeForm.peso : 0) + weightSum;
  }, [prizeForm, weightSum]);

  const prospectiveSumOnEdit = useMemo(() => {
    if (editingPrizeId == null) return weightSum;
    const current = prizes.find(p => p.id === editingPrizeId);
    const base = current && current.activo ? weightSum - current.peso : weightSum;
    return base + (prizeForm.activo ? prizeForm.peso : 0);
  }, [editingPrizeId, prizeForm, weightSum, prizes]);

  const prizeFormErrors = useMemo(() => {
    const errs: string[] = [];
    if (!prizeForm.nombre.trim()) errs.push('Nombre requerido');
    if (!(prizeForm.peso >= 1 && prizeForm.peso <= 100)) errs.push('Peso entre 1 y 100');
    if (!prizeForm.esPerdedor && prizeForm.stock < 0) errs.push('Stock ≥ 0');
    const sum = editingPrizeId ? prospectiveSumOnEdit : prospectiveSumOnCreate;
    if (sum !== 100) errs.push(`La suma de pesos activos debe ser 100 (actual: ${sum})`);
    return errs;
  }, [prizeForm, editingPrizeId, prospectiveSumOnCreate, prospectiveSumOnEdit]);

  function resetPrizeForm() {
    setPrizeForm({ ...emptyPrize });
    setEditingPrizeId(null);
  }

  function adjustLoserToRemainder() {
    if (selectedEventId == null) return;
    // busca un perdedor (si hay varios, toma el primero editable)
    const perd = prizes.find(p => p.esPerdedor && p.activo) || prizes.find(p => p.esPerdedor);
    const rest = 100 - prizes.filter(p => p.activo && !p.esPerdedor).reduce((a, p) => a + p.peso, 0);
    if (!perd) { alert('No hay segmento perdedor para ajustar.'); return; }
    if (rest < 0) { alert('Los pesos de premios exceden 100. Reduce alguno.'); return; }
    // si estoy editando justamente el perdedor, ajusta el form; si no, edítalo en la lista
    if (editingPrizeId === perd.id) {
      setPrizeForm(prev => ({ ...prev, peso: rest, activo: true, esPerdedor: true }));
    } else {
      // abre edición rápida del perdedor
      setEditingPrizeId(perd.id);
      setPrizeForm({ nombre: perd.nombre, peso: rest, stock: 0, esPerdedor: true, activo: true });
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
    if (selectedEventId == null || prizeFormErrors.length) return;
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
    if (editingPrizeId == null || prizeFormErrors.length) return;
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
  const currentSum = editingPrizeId ? prospectiveSumOnEdit : prospectiveSumOnCreate;
  const sumOk = currentSum === 100;

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
            <div style={{ fontSize: 14, opacity: .9 }}>
              Peso total activo:&nbsp;
              <b style={{ color: sumOk ? '#22c55e' : '#f87171' }}>{currentSum}/100</b>
            </div>
          </div>

          {/* Barra visual de suma */}
          <div style={{ background:'#1f2937', borderRadius:8, overflow:'hidden', height:10, margin:'6px 0 12px' }}>
            <div style={{ width:`${Math.min(100,currentSum)}%`, height:'100%', background: sumOk ? '#22c55e' : '#f87171' }} />
          </div>

          {/* Form inline crear/editar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .6fr .7fr .6fr auto auto auto', gap: 8, alignItems: 'center' }}>
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
                <button style={{...s.button, opacity: prizeFormErrors.length? .6:1}} onClick={updatePrize} disabled={!!prizeFormErrors.length}>
                  Actualizar
                </button>
                <button style={s.small} onClick={cancelEditPrize}>Cancelar</button>
              </>
            ) : (
              <button style={{...s.button, opacity: prizeFormErrors.length? .6:1}} onClick={createPrize} disabled={selectedEventId == null || !!prizeFormErrors.length}>
                Agregar
              </button>
            )}
            <button style={s.small} onClick={adjustLoserToRemainder} title="Ajusta el peso del perdedor al restante">Ajustar perdedor</button>
          </div>

          {/* Mensajes de validación */}
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
