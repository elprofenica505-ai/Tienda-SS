begin;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- An existing bucket may have intentional privacy settings; do not change them here.
-- Public URL rendering requires an explicitly public bucket, so surface a clear error otherwise.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'product-images' and public = true) then
    raise exception 'product-images bucket already exists but is not public; review its access policy before enabling product photos';
  end if;
end;
$$;

commit;
