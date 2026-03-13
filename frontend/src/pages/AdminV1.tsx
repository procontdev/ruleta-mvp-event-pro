import { useEffect, useState } from 'react';
import { adminApi, type AdminEvent, type AdminPrize } from '../lib/api';

type Styles = { [k: string]: React.CSSProperties };

export default function Admin() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [prizes, setPrizes] = useState<AdminPrize[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [newEventName, setNewEventName] = useState('');
  const [prizeForm, setPrizeForm] = useState({ nombre: '', peso: 1, stock: 0, esPerdedor: false, activo: true });

  const loadEvents = async () => {
    setError('');
    try {
      setLoading(true);
      const list = await adminApi.listEvents();
      setEvents(list);
      if (list.length && selected == null) setSelected(list[0].id);
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
  useEffect(() => { if (selected != null) loadPrizes(selected); }, [selected]);

  const createEvent = async () => {
    if (!newEventName.trim()) return;
    await adminApi.createEvent(newEventName.trim());
    setNewEventName('');
    await loadEvents();
  };

  const updateEvent = async (id: number, nombre: string) => {
    const nuevo = prompt('Nuevo nombre:', nombre);
    if (nuevo && nuevo.trim()) {
      await adminApi.updateEvent(id, nuevo.trim());
      await loadEvents();
    }
  };

  const deleteEvent = async (id: number) => {
    if (!confirm('¿Borrar evento?')) return;
    await adminApi.deleteEvent(id);
    if (selected === id) setSelected(null);
    await loadEvents();
  };

  const createPrize = async () => {
    if (selected == null) return;
    const payload = { ...prizeForm, peso: Number(prizeForm.peso), stock: Number(prizeForm.stock) };
    await adminApi.createPrize(selected, payload);
    setPrizeForm({ nombre: '', peso: 1, stock: 0, esPerdedor: false, activo: true });
    await loadPrizes(selected);
  };

  const updatePrize = async (p: AdminPrize) => {
    const nombre = prompt('Nombre', p.nombre) ?? p.nombre;
    const peso = Number(prompt('Peso', String(p.peso)) ?? p.peso);
    const stock = Number(prompt('Stock', String(p.stock)) ?? p.stock);
    const esPerdedor = confirm('¿Marcar como segmento perdedor? Aceptar=Sí / Cancelar=No');
    const activo = confirm('¿Activo? Aceptar=Sí / Cancelar=No');
    await adminApi.updatePrize(p.id, { nombre, peso, stock, esPerdedor, activo });
    if (selected != null) await loadPrizes(selected);
  };

  const deletePrize = async (p: AdminPrize) => {
    if (!confirm('¿Borrar premio?')) return;
    await adminApi.deletePrize(p.id);
    if (selected != null) await loadPrizes(selected);
  };

  return (
    <div style={s.container}>
      <h1 style={s.h1}>Administrador</h1>
      {error && <div style={s.error}>{error}</div>}

      <div style={s.grid}>
        {/* Eventos */}
        <div style={s.card}>
          <h2 style={s.h2}>Eventos</h2>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={s.input} placeholder="Nombre del evento"
              value={newEventName} onChange={(e) => setNewEventName(e.target.value)} />
            <button style={s.button} onClick={createEvent} disabled={!newEventName.trim()}>Crear</button>
          </div>

          <div>
            {events.map(e => (
              <div key={e.id} style={{
                ...s.row, ...(selected === e.id ? s.rowActive : {})
              }}>
                <div onClick={() => setSelected(e.id)} style={{ cursor: 'pointer' }}>
                  <b>#{e.id}</b> — {e.nombre}
                  <div style={{ fontSize: 12, opacity: .8 }}>
                    Premios: {e.premios} · Stock total: {e.stockTotal}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={s.small} onClick={() => updateEvent(e.id, e.nombre)}>Renombrar</button>
                  <button style={s.smallDanger} onClick={() => deleteEvent(e.id)}>Borrar</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Premios */}
        <div style={s.card}>
          <h2 style={s.h2}>Premios {selected != null && <>· Evento #{selected}</>}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .6fr .6fr .6fr .6fr auto', gap: 8, alignItems: 'center' }}>
            <input style={s.input} placeholder="Nombre"
              value={prizeForm.nombre} onChange={(e) => setPrizeForm({ ...prizeForm, nombre: e.target.value })} />
            <input style={s.input} type="number" placeholder="Peso" min={1}
              value={prizeForm.peso} onChange={(e) => setPrizeForm({ ...prizeForm, peso: Number(e.target.value) })} />
            <input style={s.input} type="number" placeholder="Stock" min={0} disabled={prizeForm.esPerdedor}
              value={prizeForm.stock} onChange={(e) => setPrizeForm({ ...prizeForm, stock: Number(e.target.value) })} />
            <label style={s.chk}><input type="checkbox" checked={prizeForm.esPerdedor}
              onChange={(e) => setPrizeForm({ ...prizeForm, esPerdedor: e.target.checked })} /> Perdedor</label>
            <label style={s.chk}><input type="checkbox" checked={prizeForm.activo}
              onChange={(e) => setPrizeForm({ ...prizeForm, activo: e.target.checked })} /> Activo</label>
            <button style={s.button} onClick={createPrize} disabled={selected == null || !prizeForm.nombre.trim()}>Agregar</button>
          </div>

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
                  <button style={s.small} onClick={() => updatePrize(p)}>Editar</button>
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
