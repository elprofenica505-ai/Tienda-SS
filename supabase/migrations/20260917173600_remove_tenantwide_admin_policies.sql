begin;
do $$ declare t text; p text; begin foreach t in array array['cash_sessions','cash_movements','inventory_stocks','inventory_movements'] loop foreach p in array array[t || '_insert_admin', t || '_update_admin'] loop execute format('drop policy if exists %I on public.%I', p, t); end loop; end loop; end $$;
revoke insert, update, delete on public.inventory_stocks, public.inventory_movements from authenticated;
commit;
