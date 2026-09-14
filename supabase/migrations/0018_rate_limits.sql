create table if not exists public.rate_limit_buckets (bucket_key text primary key, count integer not null default 0, reset_at bigint not null, updated_at timestamptz not null default now());
create or replace function public.consume_rate_limit_buckets(target_entries jsonb, target_window_ms bigint, target_now_ms bigint default (extract(epoch from clock_timestamp())*1000)::bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; bucket text; scope text; max_count integer; current_count integer; reset_value bigint; blocked_scope text; retry_seconds integer; remaining integer:=2147483647; result jsonb:='{}'::jsonb;
begin
  for item in select value from jsonb_array_elements(target_entries) loop
    bucket:=item->>'key'; scope:=item->>'scope'; max_count:=(item->>'limit')::integer;
    select count,reset_at into current_count,reset_value from public.rate_limit_buckets where bucket_key=bucket for update;
    if reset_value is not null and reset_value > target_now_ms and coalesce(current_count,0) >= max_count then blocked_scope:=scope; retry_seconds:=greatest(1,ceil((reset_value-target_now_ms)/1000.0)); exit; end if;
  end loop;
  if blocked_scope is not null then return jsonb_build_object('allowed',false,'remaining',0,'retryAfterSeconds',retry_seconds,'blockedBy',blocked_scope); end if;
  for item in select value from jsonb_array_elements(target_entries) loop
    bucket:=item->>'key'; scope:=item->>'scope'; max_count:=(item->>'limit')::integer;
    select count,reset_at into current_count,reset_value from public.rate_limit_buckets where bucket_key=bucket for update;
    if reset_value is null or reset_value <= target_now_ms then current_count:=1; reset_value:=target_now_ms+target_window_ms; else current_count:=coalesce(current_count,0)+1; end if;
    insert into public.rate_limit_buckets(bucket_key,count,reset_at,updated_at) values(bucket,current_count,reset_value,now()) on conflict(bucket_key) do update set count=excluded.count,reset_at=excluded.reset_at,updated_at=excluded.updated_at;
    remaining:=least(remaining,greatest(0,max_count-current_count));
  end loop;
  return jsonb_build_object('allowed',true,'remaining',remaining,'retryAfterSeconds',greatest(1,ceil(target_window_ms/1000.0)));
end; $$;
revoke all on function public.consume_rate_limit_buckets(jsonb,bigint,bigint) from public,anon,authenticated;
grant execute on function public.consume_rate_limit_buckets(jsonb,bigint,bigint) to service_role;
