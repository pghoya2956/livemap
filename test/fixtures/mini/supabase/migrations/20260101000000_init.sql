create table app.resorts (id uuid primary key);
alter table app.resorts enable row level security;
create or replace function app.list_resorts() returns setof app.resorts language sql as $$
  select * from app.resorts
$$;
grant execute on function app.list_resorts to authenticated;
