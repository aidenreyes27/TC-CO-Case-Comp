-- Ripeline: pantry rules and the starter shelf-life list
-- Run after 0001_init.sql.

-- New items can't have a use-by date in the past (typo guard).
create or replace function public.check_new_item_date()
returns trigger language plpgsql as $$
begin
  if new.use_by is not null and new.use_by < current_date then
    raise exception 'The use-by date can''t be in the past';
  end if;
  return new;
end $$;
create trigger items_no_past_date before insert on public.items
  for each row execute function public.check_new_item_date();

-- Best guess of days fresh for a food name: the longest list entry found
-- inside the name ("Organic baby spinach" matches "spinach").
create or replace function public.guess_shelf_life(p_name text)
returns table (days integer, category text)
language sql stable set search_path = public as $$
  select s.days, s.category
  from shelf_life s
  where lower(p_name) like '%' || s.food_name || '%'
  order by length(s.food_name) desc
  limit 1
$$;
grant execute on function public.guess_shelf_life(text) to authenticated;

-- Starter list: 50 common items, days fresh in the fridge (or pantry for
-- onions, potatoes, bananas). These are starting estimates.
-- TODO before the pilot: check each row against USDA FoodKeeper.
insert into public.shelf_life (food_name, category, days) values
  -- produce (35)
  ('strawberries', 'produce', 3),  ('raspberries', 'produce', 2),
  ('blueberries', 'produce', 7),   ('grapes', 'produce', 7),
  ('bananas', 'produce', 5),       ('apples', 'produce', 30),
  ('oranges', 'produce', 21),      ('lemons', 'produce', 21),
  ('limes', 'produce', 21),        ('avocado', 'produce', 4),
  ('tomato', 'produce', 5),        ('spinach', 'produce', 5),
  ('lettuce', 'produce', 7),       ('kale', 'produce', 7),
  ('arugula', 'produce', 4),       ('mixed greens', 'produce', 5),
  ('broccoli', 'produce', 5),      ('cauliflower', 'produce', 7),
  ('carrots', 'produce', 21),      ('celery', 'produce', 14),
  ('cucumber', 'produce', 7),      ('bell pepper', 'produce', 7),
  ('zucchini', 'produce', 5),      ('mushrooms', 'produce', 5),
  ('green beans', 'produce', 5),   ('asparagus', 'produce', 4),
  ('onion', 'produce', 30),        ('garlic', 'produce', 60),
  ('potatoes', 'produce', 30),     ('sweet potato', 'produce', 21),
  ('cilantro', 'produce', 7),      ('basil', 'produce', 5),
  ('green onions', 'produce', 7),  ('ginger', 'produce', 21),
  ('herbs', 'produce', 5),
  -- dairy (10)
  ('milk', 'dairy', 7),            ('yogurt', 'dairy', 14),
  ('cheese', 'dairy', 21),         ('shredded cheese', 'dairy', 7),
  ('mozzarella', 'dairy', 7),      ('cream cheese', 'dairy', 14),
  ('butter', 'dairy', 60),         ('sour cream', 'dairy', 14),
  ('heavy cream', 'dairy', 10),    ('cottage cheese', 'dairy', 7),
  -- other (1)
  ('eggs', 'other', 28),
  -- bread (4)
  ('bread', 'bread', 5),           ('sourdough', 'bread', 4),
  ('bagels', 'bread', 5),          ('tortillas', 'bread', 14)
on conflict (food_name) do nothing;

-- Live updates: roommates see pantry changes without refreshing.
alter publication supabase_realtime add table public.items;
