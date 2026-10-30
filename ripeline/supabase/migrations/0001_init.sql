-- Ripeline: initial schema
-- Run in the Supabase SQL editor (or `supabase db push`).
-- All 8 tables from the tech stack doc. Row-level security is ON for every table.
-- Writes to households and members go through the functions at the bottom,
-- so the rules (one household per user, owner-only remove) live in the database.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table public.households (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(trim(name)) between 1 and 60),
  invite_code     text not null unique default encode(gen_random_bytes(5), 'hex'),
  level           text not null default 'Sprout'
                  check (level in ('Sprout', 'Sapling', 'Grove', 'Forest')),
  lifetime_points integer not null default 0,
  streak_weeks    integer not null default 0,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  display_name text,
  avatar_url   text,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)                      -- each user belongs to one household
);

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id     uuid references auth.users(id) on delete set null,  -- null = Shared
  name         text not null check (char_length(trim(name)) between 1 and 80),
  category     text not null default 'other'
               check (category in ('produce', 'dairy', 'bread', 'other')),
  count        numeric not null default 1 check (count >= 0),
  use_by       date,
  source       text not null default 'receipt' check (source in ('receipt', 'manual')),
  status       text not null default 'in' check (status in ('in', 'used', 'tossed')),
  added_by     uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index items_household_use_by on public.items (household_id, status, use_by);

create table public.meals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  cooked_by    uuid not null references auth.users(id) on delete cascade,
  photo_path   text,
  flagged      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.meal_items (
  meal_id uuid not null references public.meals(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  amount  text not null check (amount in ('some', 'all')),
  primary key (meal_id, item_id)
);

create table public.point_logs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  meal_id      uuid references public.meals(id) on delete set null,
  points       integer not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);
create index point_logs_household_time on public.point_logs (household_id, created_at);

create table public.friendships (
  household_a uuid not null references public.households(id) on delete cascade,
  household_b uuid not null references public.households(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  primary key (household_a, household_b),
  check (household_a <> household_b)
);

create table public.shelf_life (
  food_name text primary key,
  category  text not null check (category in ('produce', 'dairy', 'bread', 'other')),
  days      integer not null check (days > 0)
);

-- ---------- Helpers ----------

-- The current user's household (null if none). security definer so policies
-- can call it without recursing into members' own policy.
create or replace function public.my_household_id()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid()
$$;

create or replace function public.is_household_owner(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where household_id = h and user_id = auth.uid() and role = 'owner'
  )
$$;

-- ---------- Row-level security ----------

alter table public.households  enable row level security;
alter table public.members     enable row level security;
alter table public.items       enable row level security;
alter table public.meals       enable row level security;
alter table public.meal_items  enable row level security;
alter table public.point_logs  enable row level security;
alter table public.friendships enable row level security;
alter table public.shelf_life  enable row level security;

-- Households: members read their own; only the owner renames.
create policy "read own household" on public.households
  for select to authenticated using (id = public.my_household_id());
create policy "owner updates household" on public.households
  for update to authenticated using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

-- Members: read your housemates. All changes go through functions below.
create policy "read housemates" on public.members
  for select to authenticated using (household_id = public.my_household_id());

-- Items: anyone in the household can read, add, edit and remove.
create policy "read household items" on public.items
  for select to authenticated using (household_id = public.my_household_id());
create policy "add household items" on public.items
  for insert to authenticated with check (household_id = public.my_household_id());
create policy "edit household items" on public.items
  for update to authenticated using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
create policy "remove household items" on public.items
  for delete to authenticated using (household_id = public.my_household_id());

-- Meals, meal items, points: read only from the app. Edge Functions
-- (service role, which bypasses RLS) write them, so points come from the server.
create policy "read household meals" on public.meals
  for select to authenticated using (household_id = public.my_household_id());
create policy "read household meal items" on public.meal_items
  for select to authenticated using (
    exists (select 1 from public.meals m
            where m.id = meal_id and m.household_id = public.my_household_id()));
create policy "read household points" on public.point_logs
  for select to authenticated using (household_id = public.my_household_id());

-- Friendships: see the ones your household is part of.
create policy "read own friendships" on public.friendships
  for select to authenticated using (
    public.my_household_id() in (household_a, household_b));

-- Shelf life: everyone signed in can read the table.
create policy "read shelf life" on public.shelf_life
  for select to authenticated using (true);

-- Keep updated_at fresh on items (for two people editing at once).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------- Household functions ----------

create or replace function public.create_household(p_name text)
returns public.households
language plpgsql security definer set search_path = public as $$
declare
  h public.households;
  meta jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'You are already in a household';
  end if;
  select raw_user_meta_data into meta from auth.users where id = auth.uid();

  insert into households (name, created_by) values (trim(p_name), auth.uid())
  returning * into h;
  insert into members (household_id, user_id, role, display_name, avatar_url)
  values (h.id, auth.uid(), 'owner',
          coalesce(meta->>'full_name', meta->>'name'), meta->>'avatar_url');
  return h;
end $$;

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  h_id uuid;
  meta jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'You are already in a household';
  end if;
  select id into h_id from households where invite_code = lower(trim(p_code));
  if h_id is null then raise exception 'That invite code does not match a household'; end if;
  select raw_user_meta_data into meta from auth.users where id = auth.uid();

  insert into members (household_id, user_id, role, display_name, avatar_url)
  values (h_id, auth.uid(), 'member',
          coalesce(meta->>'full_name', meta->>'name'), meta->>'avatar_url');
  return h_id;
end $$;

create or replace function public.remove_member(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare h_id uuid := public.my_household_id();
begin
  if not public.is_household_owner(h_id) then
    raise exception 'Only the household owner can remove people';
  end if;
  if p_user = auth.uid() then raise exception 'Owners cannot remove themselves'; end if;
  delete from members where household_id = h_id and user_id = p_user;
end $$;

create or replace function public.leave_household()
returns void
language plpgsql security definer set search_path = public as $$
declare
  h_id uuid := public.my_household_id();
  others int;
begin
  if h_id is null then return; end if;
  select count(*) into others from members where household_id = h_id and user_id <> auth.uid();
  if public.is_household_owner(h_id) and others > 0 then
    raise exception 'Remove everyone else before the owner leaves';
  end if;
  delete from members where household_id = h_id and user_id = auth.uid();
  if others = 0 then delete from households where id = h_id; end if;
end $$;

create or replace function public.new_invite_code()
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  h_id uuid := public.my_household_id();
  code text := encode(gen_random_bytes(5), 'hex');
begin
  if not public.is_household_owner(h_id) then
    raise exception 'Only the household owner can change the invite code';
  end if;
  update households set invite_code = code where id = h_id;
  return code;
end $$;

grant execute on function public.create_household(text)  to authenticated;
grant execute on function public.join_household(text)    to authenticated;
grant execute on function public.remove_member(uuid)     to authenticated;
grant execute on function public.leave_household()       to authenticated;
grant execute on function public.new_invite_code()       to authenticated;
