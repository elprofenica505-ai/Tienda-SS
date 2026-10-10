import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Servidor local que imita lo mínimo de Supabase (Auth + PostgREST + RPC) para probar las rutas
 * reales de la API con el cliente real `@supabase/supabase-js`, sin tocar ninguna base de datos.
 *
 * Soporta los filtros que usa la aplicación en estas rutas: eq, neq, is, in, gt/gte/lt/lte, or=(…),
 * order, limit/offset, y respuestas de objeto único (`.single()` / `.maybeSingle()`).
 */

export type FakeRow = Record<string, unknown>;
type RpcResult = { status?: number; body?: unknown };

export type FakeSupabase = {
  url: string;
  tables: Record<string, FakeRow[]>;
  /** token de acceso → usuario autenticado */
  users: Record<string, { id: string; email: string }>;
  rpc: Record<string, (body: unknown) => RpcResult>;
  rpcCalls: Array<{ name: string; body: unknown }>;
  requests: Array<{ method: string; table: string; search: string }>;
  /** tablas que responden con error 500 para simular una falla de la base de datos */
  failTables: Set<string>;
  /** respuesta de error literal por tabla (p. ej. PGRST205 cuando una tabla aún no está migrada) */
  tableErrors: Record<string, { status: number; body: unknown }>;
  /** límite de filas por respuesta (como el "Max rows" de la API de Supabase); sin valor = sin límite */
  maxRows?: number;
  close: () => Promise<void>;
};

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict', 'columns']);

function compareValues(left: unknown, right: unknown): number {
  const l = left === null || left === undefined ? '' : left;
  const r = right === null || right === undefined ? '' : right;
  if (typeof l === 'number' || typeof r === 'number') return Number(l) - Number(r);
  return String(l).localeCompare(String(r));
}

function matches(row: FakeRow, column: string, expression: string): boolean {
  const dot = expression.indexOf('.');
  const operator = expression.slice(0, dot);
  const value = expression.slice(dot + 1);
  const actual = column.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as FakeRow)[part] : undefined, row);
  const isNull = actual === null || actual === undefined;
  switch (operator) {
    case 'eq': return !isNull && String(actual) === value;
    case 'neq': return !isNull && String(actual) !== value;
    case 'is': return value === 'null' ? isNull : !isNull && String(actual) === value;
    case 'in': return !isNull && value.replace(/^\(|\)$/g, '').split(',').map((item) => item.replace(/^"|"$/g, '')).includes(String(actual));
    case 'gt': return !isNull && compareValues(actual, value) > 0;
    case 'gte': return !isNull && compareValues(actual, value) >= 0;
    case 'lt': return !isNull && compareValues(actual, value) < 0;
    case 'lte': return !isNull && compareValues(actual, value) <= 0;
    default: throw new Error(`Operador no soportado por el servidor simulado: ${operator}`);
  }
}

function filterRows(rows: FakeRow[], params: URLSearchParams, maxRows?: number): { rows: FakeRow[]; total: number; offset: number } {
  let result = rows.filter((row) => {
    for (const [column, expression] of Array.from(params.entries())) {
      if (RESERVED_PARAMS.has(column)) continue;
      if (!matches(row, column, expression)) return false;
    }
    const orGroup = params.get('or');
    if (orGroup) {
      const conditions = orGroup.replace(/^\(|\)$/g, '').split(',');
      const anyMatch = conditions.some((condition) => {
        const first = condition.indexOf('.');
        return matches(row, condition.slice(0, first), condition.slice(first + 1));
      });
      if (!anyMatch) return false;
    }
    return true;
  });

  const order = params.get('order');
  if (order) {
    const keys = order.split(',').map((item) => {
      const [column, direction] = item.split('.');
      return { column, descending: direction === 'desc' };
    });
    result = [...result].sort((left, right) => {
      for (const key of keys) {
        const difference = compareValues(left[key.column], right[key.column]);
        if (difference !== 0) return key.descending ? -difference : difference;
      }
      return 0;
    });
  }

  const offset = Number(params.get('offset') || 0);
  const requested = params.get('limit') === null ? Number.POSITIVE_INFINITY : Number(params.get('limit'));
  const limit = Math.min(requested, maxRows ?? Number.POSITIVE_INFINITY);
  return { rows: result.slice(offset, Number.isFinite(limit) ? offset + limit : undefined), total: result.length, offset };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

export async function startFakeSupabase(initial: { tables?: Record<string, FakeRow[]>; port?: number } = {}): Promise<FakeSupabase> {
  const state: Omit<FakeSupabase, 'url' | 'close'> = {
    tables: { ...(initial.tables || {}) },
    users: {},
    rpc: {},
    rpcCalls: [],
    requests: [],
    failTables: new Set(),
    tableErrors: {},
  };

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url || '/', 'http://fake-supabase');
    const method = (request.method || 'GET').toUpperCase();
    const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'content-type': 'application/json', ...headers });
      response.end(body === undefined ? '' : JSON.stringify(body));
    };

    if (url.pathname === '/auth/v1/user') {
      const token = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || ''))?.[1] || '';
      const user = state.users[token];
      if (!user) return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      return send(200, {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        email_confirmed_at: '2026-01-01T00:00:00Z',
        last_sign_in_at: new Date().toISOString(),
        created_at: '2026-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
      });
    }

    const rpcMatch = /^\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)$/.exec(url.pathname);
    if (rpcMatch) {
      const body = await readJson(request);
      state.rpcCalls.push({ name: rpcMatch[1], body });
      const handler = state.rpc[rpcMatch[1]];
      if (!handler) return send(404, { code: 'PGRST202', message: `Could not find the function public.${rpcMatch[1]}`, details: null, hint: null });
      const result = handler(body);
      return send(result.status || 200, result.body === undefined ? {} : result.body);
    }

    const tableMatch = /^\/rest\/v1\/([a-zA-Z0-9_]+)$/.exec(url.pathname);
    if (!tableMatch) return send(404, { message: `Ruta no soportada por el servidor simulado: ${url.pathname}` });
    const table = tableMatch[1];
    state.requests.push({ method, table, search: url.search });
    if (state.failTables.has(table)) return send(500, { code: 'XX000', message: `fallo simulado en ${table}`, details: null, hint: null });
    const tableError = state.tableErrors[table];
    if (tableError) return send(tableError.status, tableError.body);

    const rows = state.tables[table] || (state.tables[table] = []);
    const wantsObject = String(request.headers.accept || '').includes('application/vnd.pgrst.object+json');
    const wantsRepresentation = String(request.headers.prefer || '').includes('return=representation');
    const wantsCount = /count=(exact|planned|estimated)/.test(String(request.headers.prefer || ''));
    const reply = (selected: FakeRow[], page?: { total: number; offset: number }) => {
      if (wantsObject) {
        if (selected.length === 1) return send(200, selected[0]);
        return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${selected.length} rows`, hint: null });
      }
      const total = page?.total ?? selected.length;
      const offset = page?.offset ?? 0;
      const range = selected.length === 0 ? '*' : `${offset}-${offset + selected.length - 1}`;
      return send(200, selected, { 'content-range': `${range}/${wantsCount ? total : '*'}` });
    };

    if (method === 'GET') {
      const page = filterRows(rows, url.searchParams, state.maxRows);
      return reply(page.rows, page);
    }
    if (method === 'PATCH') {
      const body = (await readJson(request)) as FakeRow;
      const targets = filterRows(rows, url.searchParams).rows;
      for (const row of targets) Object.assign(row, body);
      return wantsRepresentation ? reply(targets) : send(204);
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const inserted = (Array.isArray(body) ? body : [body]) as FakeRow[];
      rows.push(...inserted);
      return wantsRepresentation ? reply(inserted) : send(201);
    }
    if (method === 'DELETE') {
      const targets = filterRows(rows, url.searchParams).rows;
      for (const row of targets) rows.splice(rows.indexOf(row), 1);
      return wantsRepresentation ? reply(targets) : send(204);
    }
    return send(405, { message: `Método no soportado por el servidor simulado: ${method}` });
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: error instanceof Error ? error.message : 'error del servidor simulado' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(initial.port ?? 0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  // Se devuelve el MISMO objeto de estado que lee el servidor: cambiar datos desde una prueba se refleja siempre.
  return Object.assign(state, {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.();
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  });
}

/** Crea empresa, perfil, membresía y token de acceso para que `requireTenantMember` acepte la solicitud. */
export function seedMember(fake: FakeSupabase, options: { slug: string; tenantUuid: string; role: string; token: string; userId: string; email?: string }) {
  const email = options.email || `${options.userId}@example.test`;
  const table = (name: string) => fake.tables[name] || (fake.tables[name] = []);
  fake.users[options.token] = { id: options.userId, email };
  if (!table('profiles').some((row) => row.auth_user_id === options.userId)) {
    table('profiles').push({ id: `profile-${options.userId}`, legacy_firestore_id: null, auth_user_id: options.userId, email, display_name: email });
  }
  if (!table('tenants').some((row) => row.id === options.tenantUuid)) {
    table('tenants').push({ id: options.tenantUuid, legacy_firestore_id: options.slug, status: 'active', platform_status: 'active', subscription_status: 'active' });
  }
  table('members').push({ id: `member-${options.userId}-${options.tenantUuid}`, tenant_id: options.tenantUuid, profile_id: `profile-${options.userId}`, role: options.role, status: 'active' });
}
