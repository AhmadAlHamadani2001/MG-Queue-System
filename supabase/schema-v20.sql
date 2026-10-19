-- Ensure realtime is enabled for queue tables (safe to re-run).
do $$
declare t text;
begin
  foreach t in array array['queue_tickets','branch_queue_settings','push_subscriptions'] loop
    if to_regclass('public.'||t) is not null and not exists (
      select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
alter table queue_tickets replica identity full;
