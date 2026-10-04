import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { resolveAuthorizedBranchId } from '@/lib/organization-scope';
import { readSupabaseInBatches } from '@/lib/supabase/read-pages';

export const runtime = 'nodejs';
const PAGE_SIZE = 50;
type Row = Record<string, any>;

function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function relation(value: unknown): Row {
  if (Array.isArray(value)) return (value[0] as Row | undefined) || {};
  return value && typeof value === 'object' ? value as Row : {};
}

function parseCursor(value: unknown): { createdAt: string; id: string } | null {
  try {
    const raw = text(value, 300);
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) return null;
    if (typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function lineProduct(value: unknown): Row {
  return relation(value);
}

function mapItems(rows: Row[]) {
  return rows.map((item) => {
    const product = lineProduct(item.products);
    return {
      productId: String(item.product_id || ''),
      name: String(product.name || 'Producto'),
      sku: String(product.sku || ''),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      total: Number(item.line_total ?? item.amount ?? 0),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantPermission(request, 'finance', 'view');
    const branchId = await resolveAuthorizedBranchId(context, request.headers.get('x-branch-id') || undefined);
    const cursor = parseCursor(request.nextUrl.searchParams.get('cursor'));
    const supabase = getSupabaseServer();

    let query = supabase
      .from('cash_movements')
      .select('id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata,created_at,cash_sessions!inner(branch_id,cash_register_id,status)')
      .eq('tenant_id', context.tenantId)
      .eq('cash_sessions.branch_id', branchId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const fetched = result.data || [];
    const rows = fetched.slice(0, PAGE_SIZE) as unknown as Row[];
    const last = rows.at(-1);
    const nextCursor = fetched.length > PAGE_SIZE && last
      ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url')
      : null;

    const returnIds = Array.from(new Set(rows.filter((row) => row.reference_type === 'sale_return').map((row) => String(row.reference_id || '')).filter(Boolean)));
    const returnRows = await readSupabaseInBatches<Row>(returnIds, (batch) => supabase
      .from('sale_returns')
      .select('id,sale_id,amount,refund_method,reason,created_by,created_at')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const returnById = new Map(returnRows.map((item) => [String(item.id), item]));

    const saleIds = Array.from(new Set([
      ...rows.filter((row) => row.reference_type === 'sale').map((row) => String(row.reference_id || '')),
      ...returnRows.map((item) => String(item.sale_id || '')),
    ].filter(Boolean)));
    const sales = await readSupabaseInBatches<Row>(saleIds, (batch) => supabase
      .from('sales')
      .select('id,branch_id,invoice_number,total,status,customer_id,sold_by,metadata,created_at,sale_items(product_id,quantity,unit_price,line_total,products(name,sku)),sale_payments(payment_method,amount,reference)')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const saleById = new Map(sales.map((sale) => [String(sale.id), sale]));

    const pageReturnIds = returnRows.map((item) => String(item.id));
    const returnItems = await readSupabaseInBatches<Row>(pageReturnIds, (batch) => supabase
      .from('sale_return_items')
      .select('return_id,sale_id,product_id,quantity,unit_price,amount,products(name,sku)')
      .eq('tenant_id', context.tenantId)
      .in('return_id', batch));
    const returnItemsById = new Map<string, Row[]>();
    for (const item of returnItems) {
      const id = String(item.return_id || '');
      returnItemsById.set(id, [...(returnItemsById.get(id) || []), item]);
    }

    const userIds = Array.from(new Set([
      ...rows.map((row) => String(row.performed_by || '')),
      ...sales.map((sale) => String(sale.sold_by || '')),
      ...returnRows.map((item) => String(item.created_by || '')),
    ].filter(Boolean)));
    const profiles = await readSupabaseInBatches<Row>(userIds, (batch) => supabase
      .from('profiles')
      .select('auth_user_id,display_name,email')
      .in('auth_user_id', batch));
    const profileById = new Map(profiles.map((profile) => [String(profile.auth_user_id), profile]));

    const customerIds = Array.from(new Set(sales.map((sale) => String(sale.customer_id || '')).filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
    const customers = await readSupabaseInBatches<Row>(customerIds, (batch) => supabase
      .from('customers')
      .select('id,name,document_id')
      .eq('tenant_id', context.tenantId)
      .in('id', batch));
    const customerById = new Map(customers.map((customer) => [String(customer.id), customer]));

    const sessionRows = rows.map((row) => relation(row.cash_sessions));
    const branchIds = Array.from(new Set(sessionRows.map((session) => String(session.branch_id || '')).filter(Boolean)));
    const registerIds = Array.from(new Set(sessionRows.map((session) => String(session.cash_register_id || '')).filter(Boolean)));
    const [branches, registers] = await Promise.all([
      readSupabaseInBatches<Row>(branchIds, (batch) => supabase.from('branches').select('id,name').eq('tenant_id', context.tenantId).in('id', batch)),
      readSupabaseInBatches<Row>(registerIds, (batch) => supabase.from('cash_registers').select('id,name,code').eq('tenant_id', context.tenantId).in('id', batch)),
    ]);
    const branchById = new Map(branches.map((branch) => [String(branch.id), branch]));
    const registerById = new Map(registers.map((register) => [String(register.id), register]));

    const movements = rows.map((row, index) => {
      const session = sessionRows[index] || {};
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
      const returnRow = row.reference_type === 'sale_return' ? returnById.get(String(row.reference_id || '')) : undefined;
      const saleId = row.reference_type === 'sale' ? String(row.reference_id || '') : String(returnRow?.sale_id || metadata.saleId || '');
      const sale = saleById.get(saleId);
      const saleMetadata = sale?.metadata && typeof sale.metadata === 'object' ? sale.metadata as Row : {};
      const saleItems = sale && Array.isArray(sale.sale_items) ? sale.sale_items as Row[] : [];
      const returned = returnRow ? returnItemsById.get(String(returnRow.id)) || [] : [];
      const items = returnRow ? mapItems(returned) : mapItems(saleItems);
      const payments = sale && Array.isArray(sale.sale_payments)
        ? (sale.sale_payments as Row[]).map((payment) => ({ method: String(payment.payment_method || ''), amount: Number(payment.amount || 0) }))
        : [];
      const actor = profileById.get(String(row.performed_by || ''));
      const customer = customerById.get(String(sale?.customer_id || ''));
      const labels: Record<string, string> = { sale: 'Cobro de venta', refund: 'Devolución', deposit: 'Entrada de caja', withdrawal: 'Retiro de caja', adjustment: 'Ajuste de caja', payment: 'Pago', purchase: 'Compra' };
      const movementType = String(row.movement_type || '');
      return {
        id: String(row.id),
        cashSessionId: String(row.cash_session_id || ''),
        sessionStatus: String(session.status || ''),
        movementType,
        movementLabel: returnRow ? 'Devolución' : (labels[movementType] || movementType),
        amount: Math.abs(Number(row.amount || 0)),
        signedAmount: Number(row.amount || 0),
        direction: Number(row.amount || 0) >= 0 ? 'in' : 'out',
        paymentMethod: String(metadata.paymentMethod || returnRow?.refund_method || saleMetadata.paymentMethod || ''),
        payments,
        description: String(metadata.description || returnRow?.reason || (sale ? 'Venta relacionada' : row.reference_type || movementType)),
        referenceType: String(row.reference_type || ''),
        referenceId: String(row.reference_id || ''),
        createdAt: String(row.created_at || ''),
        userId: String(row.performed_by || ''),
        userName: String(actor?.display_name || actor?.email || row.performed_by || 'Usuario no disponible'),
        userEmail: String(actor?.email || ''),
        branchId: String(session.branch_id || ''),
        branchName: String(branchById.get(String(session.branch_id || ''))?.name || ''),
        registerName: String(registerById.get(String(session.cash_register_id || ''))?.name || ''),
        sale: sale ? {
          id: String(sale.id),
          saleNumber: String(sale.invoice_number || saleMetadata.saleNumber || sale.id),
          status: String(sale.status || ''),
          total: Number(sale.total || 0),
          createdAt: String(sale.created_at || ''),
          customerName: String(customer?.name || customer?.document_id || ''),
          sellerName: String(profileById.get(String(sale.sold_by || ''))?.display_name || profileById.get(String(sale.sold_by || ''))?.email || ''),
          items,
          payments,
        } : null,
        saleId,
        saleNumber: String(sale?.invoice_number || saleMetadata.saleNumber || saleId),
        saleTotal: Number(sale?.total || 0),
        items,
      };
    });

    return NextResponse.json({ ok: true, branchId, movements, nextCursor }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const response = tenantErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
