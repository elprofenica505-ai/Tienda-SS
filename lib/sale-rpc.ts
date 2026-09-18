import { getSupabaseServer } from '@/lib/supabase/server';

type SaleItem = { productId: string; quantity: number; unitPrice?: number };

type CatalogProduct = { id: string; price: number | string | null; tax_rate: number | string | null; active: boolean };

export function supabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || '');
  return String(error || '');
}

export function isMissingServerPricedRpc(error: unknown) {
  const message = supabaseErrorMessage(error);
  return /function .*create_sale(_with_payments)?_server_priced.*does not exist|Could not find the function .*create_sale(_with_payments)?_server_priced|schema cache/i.test(message);
}

export async function priceSaleItemsFromCatalog(tenantId: string, items: SaleItem[]) {
  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const result = await getSupabaseServer()
    .from('products')
    .select('id,price,tax_rate,active')
    .eq('tenant_id', tenantId)
    .in('id', productIds);
  if (result.error) throw new Error(result.error.message);

  const products = new Map<string, CatalogProduct>((result.data || []).map((product: CatalogProduct) => [String(product.id), product]));
  if (products.size !== productIds.length || productIds.some((id) => !products.get(id)?.active)) throw new Error('PRODUCT_NOT_FOUND');

  let taxAmount = 0;
  const pricedItems = items.map((item) => {
    const product = products.get(item.productId)!;
    const unitPrice = Math.max(0, Number(product.price || 0));
    taxAmount += unitPrice * item.quantity * Math.max(0, Number(product.tax_rate || 0)) / 100;
    return { productId: item.productId, quantity: item.quantity, unitPrice };
  });
  return { items: pricedItems, taxAmount: Math.round(taxAmount * 100) / 100 };
}
