import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireTenantPermission, tenantErrorResponse } from '@/lib/tenant';
import { writeImmutableAudit } from '@/lib/audit';
export const runtime = 'nodejs';
function text(v: unknown, max=2000) { return typeof v === 'string' ? v.trim().slice(0,max) : ''; }
function fail(e: unknown) { const r=tenantErrorResponse(e); return NextResponse.json(r.body,{status:r.status}); }

export async function GET(request: NextRequest,{params}:{params:Promise<{id:string}>}) {
 try { const context=await requireTenantPermission(request,'crm','view'); const {id}=await params; const db=getSupabaseServer();
  const [customer,sales,quotes,receivables,notes]=await Promise.all([
   db.from('customers').select('id,name,email,phone,document_id,origin_channel,origin_branch_id,metadata,credit_limit,credit_status,created_at').eq('tenant_id',context.tenantId).eq('id',id).maybeSingle(),
   db.from('sales').select('id,total,status,created_at,branch_id').eq('tenant_id',context.tenantId).eq('customer_id',id).order('created_at',{ascending:false}).limit(20),
   db.from('quotes').select('id,quote_number,status,total,currency,valid_until,created_at,branch_id').eq('tenant_id',context.tenantId).eq('customer_id',id).order('created_at',{ascending:false}).limit(20),
   db.from('receivables').select('id,original_amount,outstanding_amount,status,due_date,created_at').eq('tenant_id',context.tenantId).eq('customer_id',id).order('created_at',{ascending:false}).limit(20),
   db.from('crm_customer_notes').select('id,note,author_uid,created_at').eq('tenant_id',context.tenantId).eq('customer_id',id).order('created_at',{ascending:false}).limit(50),
  ]); const err=customer.error||sales.error||quotes.error||receivables.error||notes.error; if(err) throw new Error(err.message); if(!customer.data) return NextResponse.json({error:'El cliente no existe.'},{status:404});
  return NextResponse.json({ok:true,customer:customer.data,sales:sales.data||[],quotes:quotes.data||[],receivables:receivables.data||[],notes:notes.data||[]},{headers:{'Cache-Control':'no-store'}});
 } catch(e){return fail(e)}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try { const context=await requireTenantPermission(request,'crm','create'); const {id}=await params; const body=await request.json(); const note=text(body.note); if(!note) return NextResponse.json({error:'Escribe una nota.'},{status:400}); const db=getSupabaseServer(); const customer=await db.from('customers').select('id').eq('tenant_id',context.tenantId).eq('id',id).maybeSingle(); if(customer.error) throw new Error(customer.error.message); if(!customer.data)return NextResponse.json({error:'El cliente no existe.'},{status:404}); const saved=await db.from('crm_customer_notes').insert({tenant_id:context.tenantId,customer_id:id,author_uid:context.uid,note}).select('*').single(); if(saved.error)throw new Error(saved.error.message); await writeImmutableAudit({tenantId:context.tenantId,actor:context,action:'crm.note_created',entity:'customer',entityId:id,after:saved.data,result:'success'}); return NextResponse.json({ok:true,note:saved.data},{status:201}); } catch(e){return fail(e)}
}
