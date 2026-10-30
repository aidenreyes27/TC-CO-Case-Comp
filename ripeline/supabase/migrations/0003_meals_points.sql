-- Ripeline: cooking, meal photos and points
-- Run after 0002_pantry.sql.
--
-- Points per item = 1 x type x urgency x units used x source
--   type:    produce, dairy, bread x2; other x1
--   urgency: 0-1 days left x3; 2-3 days left x2; otherwise x1
--   units:   how much was used (0.25 of one item, or 2 of 6), so points are proportional
--   source:  added by hand x0.5 (restocking is meant to be by receipt)
-- Plus 2 points to each roommate tagged as cooking together, and 2 to the cook.
-- Then the household level bonus: Grove +5%, Forest +10%.
-- Levels: Sprout 0, Sapling 250, Grove 1,000, Forest 3,000 lifetime points.

-- Points can be fractional now that use is proportional.
alter table public.point_logs  alter column points type numeric(8,1);
alter table public.households  alter column lifetime_points type numeric(10,1);

-- How much of each item a meal used, in the item's own units.
alter table public.meal_items drop constraint if exists meal_items_amount_check;
alter table public.meal_items alter column amount type numeric using (case amount when 'all' then 1 else 0.5 end);
alter table public.meal_items add constraint meal_items_amount_positive check (amount > 0);
-- Whose item it was at the time, so owners can be told when a roommate used it.
alter table public.meal_items add column owner_id uuid references auth.users(id) on delete set null;

create or replace function public.level_for(p_points numeric)
returns text language sql immutable as $$
  select case when p_points >= 3000 then 'Forest'
              when p_points >= 1000 then 'Grove'
              when p_points >= 250  then 'Sapling'
              else 'Sprout' end
$$;

-- Log a meal and award points, all in one transaction.
-- p_items: [{"item_id": "...", "units": 0.5}, ...]
create or replace function public.log_meal(p_photo text, p_items jsonb, p_cooks uuid[] default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  h       public.households;
  meal_id uuid;
  rec     record;
  it      public.items;
  units   numeric;
  left_d  integer;
  pts     numeric;
  total   numeric := 0;
  bonus   numeric;
  cook    uuid;
  tagged  integer := 0;
  breakdown jsonb := '[]'::jsonb;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into h from households where id = public.my_household_id();
  if h.id is null then raise exception 'Join a household first'; end if;

  if (select count(*) from meals where cooked_by = me and created_at >= date_trunc('day', now())) >= 3 then
    raise exception 'You''ve scored 3 meals today. Log more tomorrow.';
  end if;
  if p_photo is null or split_part(p_photo, '/', 1) <> h.id::text then
    raise exception 'Add a photo of your meal to claim points';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then
    raise exception 'Pick at least one item you cooked with';
  end if;

  insert into meals (household_id, cooked_by, photo_path) values (h.id, me, p_photo)
  returning id into meal_id;

  for rec in select * from jsonb_to_recordset(p_items) as x(item_id uuid, units numeric) loop
    select * into it from items where id = rec.item_id and household_id = h.id and status = 'in' for update;
    if it.id is null then raise exception 'One of those items is no longer in the pantry'; end if;
    units := least(coalesce(rec.units, 0), it.count);
    if units <= 0 then raise exception 'Say how much of % you used', it.name; end if;

    left_d := coalesce(it.use_by - current_date, 99);
    pts := 1
         * (case when it.category in ('produce', 'dairy', 'bread') then 2 else 1 end)
         * (case when left_d <= 1 then 3 when left_d <= 3 then 2 else 1 end)
         * units
         * (case when it.source = 'manual' then 0.5 else 1 end);
    total := total + pts;
    breakdown := breakdown || jsonb_build_object('name', it.name, 'points', round(pts, 1));

    insert into meal_items (meal_id, item_id, amount, owner_id) values (meal_id, it.id, units, it.owner_id);
    update items set count = count - units,
                     status = case when count - units <= 0 then 'used' else status end
     where id = it.id;
  end loop;

  bonus := case h.level when 'Forest' then 1.10 when 'Grove' then 1.05 else 1 end;
  total := round(total * bonus, 1);
  insert into point_logs (household_id, user_id, meal_id, points, reason)
  values (h.id, me, meal_id, total, 'meal');

  -- Cooking together: +2 to each tagged roommate, and +2 (once) to the cook.
  tagged := 0;
  for cook in select distinct c from unnest(coalesce(p_cooks, '{}')) c
              where c <> me and exists (select 1 from members where household_id = h.id and user_id = c) loop
    insert into point_logs (household_id, user_id, meal_id, points, reason) values (h.id, cook, meal_id, 2, 'cooked together');
    tagged := tagged + 1;
  end loop;
  if tagged > 0 then
    insert into point_logs (household_id, user_id, meal_id, points, reason) values (h.id, me, meal_id, 2, 'cooked together');
    total := total + 2;
  end if;

  update households set lifetime_points = lifetime_points + total + 2 * tagged,
                        level = public.level_for(lifetime_points + total + 2 * tagged)
   where id = h.id
  returning * into h;

  return jsonb_build_object('meal_id', meal_id, 'points', total, 'items', breakdown,
                            'level', h.level, 'lifetime_points', h.lifetime_points);
end $$;
grant execute on function public.log_meal(text, jsonb, uuid[]) to authenticated;

-- Your items a roommate used in the last 7 days (for the "used your item" notice).
create or replace function public.my_items_used_by_others()
returns table (meal_id uuid, item_name text, used_by_name text, amount numeric, used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, i.name, coalesce(mem.display_name, 'A roommate'), mi.amount, m.created_at
  from meal_items mi
  join meals m on m.id = mi.meal_id
  join items i on i.id = mi.item_id
  left join members mem on mem.user_id = m.cooked_by and mem.household_id = m.household_id
  where mi.owner_id = auth.uid() and m.cooked_by <> auth.uid()
    and m.created_at > now() - interval '7 days'
  order by m.created_at desc
$$;
grant execute on function public.my_items_used_by_others() to authenticated;

-- Meal photos: private bucket, one folder per household.
insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy "household uploads meal photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
create policy "household views meal photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = public.my_household_id()::text);
