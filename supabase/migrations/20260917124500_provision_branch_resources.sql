-- Every active branch must have at least one active warehouse and cash register.
insert into public.warehouses (tenant_id, branch_id, code, name, active)
select b.tenant_id,
       b.id,
       left('BR-' || coalesce(nullif(b.code, ''), substr(replace(b.id::text, '-', ''), 1, 8)) || '-ALM', 80),
       'Almacén ' || b.name,
       true
from public.branches b
where b.active
  and not exists (select 1 from public.warehouses w where w.branch_id = b.id and w.active);

insert into public.cash_registers (tenant_id, branch_id, code, name, active)
select b.tenant_id,
       b.id,
       left('BR-' || coalesce(nullif(b.code, ''), substr(replace(b.id::text, '-', ''), 1, 8)) || '-CAJA', 80),
       'Caja ' || b.name,
       true
from public.branches b
where b.active
  and not exists (select 1 from public.cash_registers r where r.branch_id = b.id and r.active);
