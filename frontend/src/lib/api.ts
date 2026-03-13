export type PrizePublic = { id: number; nombre: string; peso: number; esPerdedor: boolean };

export type RegisterRequest = {
  eventId: number;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  aceptoTerminos: boolean;
};

export type RegisterResponse = { usuarioId: number; yaRegistrado: boolean };

export type SpinRequest = { eventId: number; usuarioId: number };
export type SpinResponse =
  | { resultado: 'WIN'; premio: string; premioId: number; jugadaId: number }
  | { resultado: 'LOSE' };

// --- Admin (solo DEV) ---
export type AdminVerifyResponse = {
  id: number;
  eventoId: number;
  usuarioId: number;
  resultado: string;
  premio?: string | null;
  entregado: boolean;
  entregadoEn?: string | null;
  creadoEn: string;
};

// ===== Admin: eventos y premios =====
export type AdminEvent = { id: number; nombre: string; premios: number; stockTotal: number };
export type AdminPrize = {
  id: number; eventoId: number; nombre: string; peso: number; stock: number; esPerdedor: boolean; activo: boolean;
};
// ===== Admin extra: usuarios y dashboard =====
export type AdminUsersPage = {
  total: number; page: number; pageSize: number;
  items: { id: number; eventoId: number; nombre: string; email?: string; telefono?: string; aceptoTerminos: boolean; jugo: boolean }[];
};
export type AdminDashboard = {
  totalUsuarios: number; jugadasTotales: number; ganadores: number; perdedores: number; stockRestante: number;
  premios: { premioId: number; nombre: string; esPerdedor: boolean; peso: number; stockActual: number; entregados: number }[];
};
const ADMIN_KEY = (import.meta.env.VITE_ADMIN_KEY as string | undefined) || '';


const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:5001';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof body === 'string' ? body : (body as any)?.error || 'Request error';
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export const api = {
  ping: () => req<{ pong: boolean; at: string }>('/api/ping'),
  register: (payload: RegisterRequest) =>
    req<RegisterResponse>('/api/register', { method: 'POST', body: JSON.stringify(payload) }),
  spin: (payload: SpinRequest) =>
    req<SpinResponse>('/api/spin', { method: 'POST', body: JSON.stringify(payload) }),
  prizes: (eventId: number) =>
    req<PrizePublic[]>(`/api/prizes?eventId=${eventId}`),
};

export const adminApi = {
	verify: (jugadaId: number) =>
    req<AdminVerifyResponse>(`/api/admin/debug/verify?jugadaId=${jugadaId}`, {
      headers: { 'x-admin-key': ADMIN_KEY }
    }),
  fulfill: (jugadaId: number, entregado: boolean) =>
    req<{ id: number; entregado: boolean; entregadoEn?: string }>(
      `/api/admin/debug/fulfill?jugadaId=${jugadaId}&entregado=${entregado}`,
      { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } }
    ),
  // eventos
  listEvents: () => req<AdminEvent[]>('/api/admin/events', { headers: { 'x-admin-key': ADMIN_KEY } }),
  createEvent: (nombre: string) =>
    req<{ id: number; nombre: string }>('/api/admin/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify({ nombre }),
    }),
  updateEvent: (id: number, nombre: string) =>
    req<{ id: number; nombre: string }>(`/api/admin/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify({ nombre }),
    }),
  deleteEvent: (id: number) =>
    req<{ ok: boolean }>(`/api/admin/events/${id}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } }),

  // premios
  listPrizes: (eventId: number) =>
    req<AdminPrize[]>(`/api/admin/events/${eventId}/prizes`, { headers: { 'x-admin-key': ADMIN_KEY } }),
  createPrize: (eventId: number, payload: { nombre: string; peso: number; stock: number; esPerdedor: boolean; activo: boolean; }) =>
    req<{ id: number }>(`/api/admin/events/${eventId}/prizes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(payload),
    }),
  updatePrize: (id: number, payload: { nombre: string; peso: number; stock: number; esPerdedor: boolean; activo: boolean; }) =>
    req<{ id: number }>(`/api/admin/prizes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify(payload),
    }),
  deletePrize: (id: number) =>
    req<{ ok: boolean }>(`/api/admin/prizes/${id}`, { method: 'DELETE', headers: { 'x-admin-key': ADMIN_KEY } }),
	
	  listUsers: (params: { eventId?: number; page?: number; pageSize?: number; q?: string }) => {
    const qs = new URLSearchParams();
    if (params.eventId != null) qs.set('eventId', String(params.eventId));
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.q) qs.set('q', params.q);
    return req<AdminUsersPage>(`/api/admin/users?${qs.toString()}`, { headers: { 'x-admin-key': ADMIN_KEY } });
  },
  dashboard: (eventId: number) =>
    req<AdminDashboard>(`/api/admin/dashboard?eventId=${eventId}`, { headers: { 'x-admin-key': ADMIN_KEY } }),
};
export const API_BASE = BASE;
