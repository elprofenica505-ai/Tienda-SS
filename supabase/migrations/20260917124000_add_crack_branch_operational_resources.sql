-- Ensure the El crack branch has the operational resources required by POS and cashier.
insert into public.warehouses (tenant_id, branch_id, code, name, active)
select b.tenant_id, b.id, 'CRACK-ALM', 'Almacén El crack', true
from public.branches b
where b.name = 'El crack'
  and not exists (
    select 1 from public.warehouses w
    where w.branch_id = b.id and w.active
  );

insert into public.cash_registers (tenant_id, branch_id, code, name, active)
select b.tenant_id, b.id, 'CRACK-CAJA', 'Caja El crack', true
from public.branches b
where b.name = 'El crack'
  and not exists (
    select 1 from public.cash_registers r
    where r.branch_id = b.id and r.active
  );
