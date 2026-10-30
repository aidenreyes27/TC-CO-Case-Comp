-- Ripeline: monthly leaderboards, friend households, alert settings
-- Run after 0003_meals_points.sql.

-- A separate code for adding friend households, so sharing it never lets
-- anyone join your pantry.
alter table public.households add column friend_code text not null unique
  default encode(gen_random_bytes(4), 'hex');

-- Each person's alert settings live on their membership row.
alter table public.members
  add column alert_time        time    not null default '17:00',
  add column timezone          text    not null default 'America/Los_Angeles',
  add column email_alerts      boolean not null default true,
  add column push_subscription jsonb,
  add column last_alert_on     date;

create or replace function public.set_alert_prefs(
  p_time time, p_timezone text, p_email boolean,
  p_push jsonb default null, p_clear_push boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone';
  end if;
  update members set
    alert_time = p_time,
    timezone = p_timezone,
    email_alerts = p_email,
    push_subscription = case when p_clear_push then null else coalesce(p_push, push_subscription) end
  where user_id = auth.uid();
end $$;
grant execute on function public.set_alert_prefs(time, text, boolean, jsonb, boolean) to authenticated;

create or replace function public.my_alert_prefs()
returns table (alert_time time, timezone text, email_alerts boolean, has_push boolean)
language sql stable security definer set search_path = public as $$
  select alert_time, timezone, email_alerts, push_subscription is not null
  from members where user_id = auth.uid()
$$;
grant execute on function public.my_alert_prefs() to authenticated;

-- ---------- Leaderboards (reset each calendar month) ----------

-- Roommates ranked by points this month.
create or replace function public.leaderboard_house(p_timezone text default 'America/Los_Angeles')
returns table (user_id uuid, display_name text, avatar_url text, points numeric)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.display_name, m.avatar_url, coalesce(sum(p.points), 0)
  from members m
  left join point_logs p on p.user_id = m.user_id and p.household_id = m.household_id
    and p.created_at >= (date_trunc('month', now() at time zone p_timezone) at time zone p_timezone)
  where m.household_id = public.my_household_id()
  group by m.user_id, m.display_name, m.avatar_url
  order by 4 desc, m.display_name
$$;
grant execute on function public.leaderboard_house(text) to authenticated;

-- Your household and accepted friend households, ranked by points per person,
-- so a big house doesn't win by size. Streak = full weeks since anything was tossed.
create or replace function public.leaderboard_friends(p_timezone text default 'America/Los_Angeles')
returns table (household_id uuid, name text, level text, people integer,
               points numeric, points_per_person numeric, streak_weeks integer, is_mine boolean)
language sql stable security definer set search_path = public as $$
  with mine as (select public.my_household_id() as id),
  board as (
    select id from mine
    union
    select case when f.household_a = mine.id then f.household_b else f.household_a end
    from friendships f, mine
    where f.status = 'accepted' and mine.id in (f.household_a, f.household_b)
  )
  select h.id, h.name, h.level,
         (select count(*) from members m where m.household_id = h.id)::int,
         coalesce(pts.total, 0),
         round(coalesce(pts.total, 0) / greatest(1, (select count(*) from members m where m.household_id = h.id)), 1),
         floor(extract(epoch from now() - coalesce(
           (select max(i.updated_at) from items i where i.household_id = h.id and i.status = 'tossed'),
           h.created_at)) / 604800)::int,
         h.id = (select id from mine)
  from households h
  join board b on b.id = h.id
  left join lateral (
    select sum(p.points) as total from point_logs p
    where p.household_id = h.id
      and p.created_at >= (date_trunc('month', now() at time zone p_timezone) at time zone p_timezone)
  ) pts on true
  order by 6 desc, h.name
$$;
grant execute on function public.leaderboard_friends(text) to authenticated;

-- ---------- Friend households ----------

create or replace function public.add_friend(p_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.my_household_id();
  them public.households;
begin
  if me is null then raise exception 'Join a household first'; end if;
  select * into them from households where friend_code = lower(trim(p_code));
  if them.id is null then raise exception 'That friend code does not match a household'; end if;
  if them.id = me then raise exception 'That is your own household'; end if;

  -- They already asked us: accept.
  if exists (select 1 from friendships where household_a = them.id and household_b = me) then
    update friendships set status = 'accepted' where household_a = them.id and household_b = me;
    return 'accepted';
  end if;
  insert into friendships (household_a, household_b) values (me, them.id)
  on conflict do nothing;
  return 'requested';
end $$;

create or replace function public.friend_requests()
returns table (household_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select h.id, h.name from friendships f join households h on h.id = f.household_a
  where f.household_b = public.my_household_id() and f.status = 'pending'
$$;

create or replace function public.answer_friend(p_household uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update friendships set status = 'accepted'
    where household_a = p_household and household_b = public.my_household_id();
  else
    delete from friendships
    where public.my_household_id() in (household_a, household_b)
      and p_household in (household_a, household_b);
  end if;
end $$;

grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.friend_requests() to authenticated;
grant execute on function public.answer_friend(uuid, boolean) to authenticated;
