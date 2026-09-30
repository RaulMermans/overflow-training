-- Exercise library audit helpers (read-only).

-- 1) Counts by category + tracking_mode for system exercises.
select
  category,
  tracking_mode,
  count(*) as total
from exercise_definitions
where scope = 'system'
group by category, tracking_mode
order by category, tracking_mode;

-- 2) Categories with zero system exercises.
with expected(category) as (
  values
    ('strength'),
    ('warmup'),
    ('stretch'),
    ('cardio'),
    ('mobility'),
    ('yoga'),
    ('pilates'),
    ('other')
)
select
  expected.category
from expected
left join exercise_definitions ed
  on ed.category = expected.category
 and ed.scope = 'system'
group by expected.category
having count(ed.id) = 0
order by expected.category;

-- 3) Primary targets that are not lowercase.
select
  ed.slug,
  ed.name,
  target as primary_target
from exercise_definitions ed
cross join unnest(coalesce(ed.primary_targets, '{}'::text[])) as target
where target <> lower(target)
order by ed.slug, target;

-- 4) Conservative cleanup candidates (preview only, no deletes).
select
  id,
  slug,
  name,
  category,
  scope
from exercise_definitions
where scope = 'system'
  and owner_user_id is null
  and (
    slug ~ '^(test|sample|todo|tmp|asdf|qwerty)(-|$)'
    or lower(trim(name)) in (
      'test exercise',
      'sample exercise',
      'todo exercise',
      'placeholder exercise'
    )
  )
order by slug;
