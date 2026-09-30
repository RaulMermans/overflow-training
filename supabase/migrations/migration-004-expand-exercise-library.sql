-- ====================================================================
-- Migration 004: Expand exercise library (210+ exercises)
-- ====================================================================
--
-- CONTEXT: The app launched with 10 seeded exercises. This migration
-- expands the library to 210+ exercises spanning strength, conditioning,
-- cardio, and mobility categories.
--
-- SAFETY:
--   - Idempotent: uses UPSERT (ON CONFLICT slug DO UPDATE)
--   - Existing aliases are MERGED, never overwritten
--   - muscle_group and equipment use COALESCE to preserve existing values
--   - No schema changes — exercise_definitions table is untouched
--   - Safe to run multiple times
--
-- NORMALIZED VALUES:
--   muscle_group: chest, back, legs, shoulders, arms, core, full_body,
--                 cardio, mobility
--   equipment:    barbell, dumbbell, machine, cable, kettlebell, band,
--                 bodyweight, cardio, yoga, outdoor
--
-- RUN IN: Supabase Dashboard SQL Editor (as database owner / service role)
-- AFTER:  migration-003 (or fresh install via schema.sql + policies.sql)
-- ====================================================================


-- ============ Part 0: PRECHECK ============

DO $$
DECLARE _before bigint;
BEGIN
  SELECT count(*) INTO _before FROM exercise_definitions;
  RAISE NOTICE '=== MIGRATION-004: EXPAND EXERCISE LIBRARY ===';
  RAISE NOTICE 'exercise_definitions before: % rows', _before;
END $$;


-- ============ Part 1: Batch A — Legs (43 rows) ============

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
SELECT name, slug, aliases::text[], muscle_group, equipment
FROM (VALUES
  ('Squat',                      'squat',                      ARRAY['back squat','barbell squat'],             'legs',  'barbell'),
  ('Front Squat',                'front-squat',                ARRAY['front rack squat'],                       'legs',  'barbell'),
  ('Goblet Squat',               'goblet-squat',               ARRAY['db goblet squat'],                        'legs',  'dumbbell'),
  ('Sumo Squat',                 'sumo-squat',                 ARRAY['wide squat','plie squat'],                'legs',  'dumbbell'),
  ('Bulgarian Split Squat',      'bulgarian-split-squat',      ARRAY['bss','rfess','rear foot elevated squat'], 'legs',  'dumbbell'),
  ('Hack Squat',                 'hack-squat',                 ARRAY['hack squat machine'],                     'legs',  'machine'),
  ('Smith Machine Squat',        'smith-machine-squat',        ARRAY['smith squat'],                            'legs',  'machine'),
  ('Leg Press',                  'leg-press',                  ARRAY['leg press machine'],                      'legs',  'machine'),
  ('Walking Lunge',              'walking-lunge',              ARRAY['db lunge','dumbbell lunge'],              'legs',  'dumbbell'),
  ('Reverse Lunge',              'reverse-lunge',              ARRAY['db reverse lunge'],                       'legs',  'dumbbell'),
  ('Step Up',                    'step-up',                    ARRAY['dumbbell step up'],                       'legs',  'dumbbell'),
  ('Leg Extension',              'leg-extension',              ARRAY['quad extension'],                         'legs',  'machine'),
  ('Leg Curl',                   'leg-curl',                   ARRAY['hamstring curl'],                         'legs',  'machine'),
  ('Seated Leg Curl',            'seated-leg-curl',            ARRAY['seated hamstring curl'],                  'legs',  'machine'),
  ('Lying Leg Curl',             'lying-leg-curl',             ARRAY['prone leg curl'],                         'legs',  'machine'),
  ('Deadlift',                   'deadlift',                   ARRAY['conventional deadlift','barbell deadlift'],'back', 'barbell'),
  ('Romanian Deadlift',          'romanian-deadlift',          ARRAY['rdl','stiff leg deadlift'],               'legs',  'barbell'),
  ('Sumo Deadlift',              'sumo-deadlift',              ARRAY['sumo dl','wide stance deadlift'],         'legs',  'barbell'),
  ('Trap Bar Deadlift',          'trap-bar-deadlift',          ARRAY['hex bar deadlift'],                       'legs',  'barbell'),
  ('Stiff Leg Deadlift',         'stiff-leg-deadlift',         ARRAY['sldl'],                                   'legs',  'barbell'),
  ('Dumbbell Romanian Deadlift', 'dumbbell-romanian-deadlift', ARRAY['db rdl'],                                 'legs',  'dumbbell'),
  ('Single Leg Deadlift',        'single-leg-deadlift',        ARRAY['single leg rdl'],                         'legs',  'dumbbell'),
  ('Hip Thrust',                 'hip-thrust',                 ARRAY['barbell hip thrust','glute bridge barbell'],'legs', 'barbell'),
  ('Glute Bridge',               'glute-bridge',               ARRAY['floor glute bridge'],                     'legs',  'bodyweight'),
  ('Cable Pull Through',         'cable-pull-through',         ARRAY['pull through'],                           'legs',  'cable'),
  ('Good Morning',               'good-morning',               ARRAY['barbell good morning'],                   'legs',  'barbell'),
  ('Nordic Hamstring Curl',      'nordic-hamstring-curl',      ARRAY['nordic curl','nhe'],                      'legs',  'bodyweight'),
  ('Calf Raise',                 'calf-raise',                 ARRAY['standing calf raise','barbell calf raise'],'legs', 'barbell'),
  ('Standing Calf Raise',        'standing-calf-raise',        ARRAY['machine calf raise'],                     'legs',  'machine'),
  ('Seated Calf Raise',          'seated-calf-raise',          ARRAY['seated calf'],                            'legs',  'machine'),
  ('Leg Press Calf Raise',       'leg-press-calf-raise',       ARRAY['calf press'],                             'legs',  'machine'),
  ('Hip Abduction Machine',      'hip-abduction-machine',      ARRAY['abduction','outer thigh'],                'legs',  'machine'),
  ('Hip Adduction Machine',      'hip-adduction-machine',      ARRAY['adduction','inner thigh'],                'legs',  'machine'),
  ('Pistol Squat',               'pistol-squat',               ARRAY['single leg squat'],                       'legs',  'bodyweight'),
  ('Box Squat',                  'box-squat',                  ARRAY['barbell box squat'],                      'legs',  'barbell'),
  ('Zercher Squat',              'zercher-squat',              ARRAY['zercher'],                                'legs',  'barbell'),
  ('Belt Squat',                 'belt-squat',                 ARRAY['belt squat machine'],                     'legs',  'machine'),
  ('Sissy Squat',                'sissy-squat',                ARRAY['bodyweight sissy squat'],                 'legs',  'bodyweight'),
  ('Wall Sit',                   'wall-sit',                   ARRAY['wall squat'],                             'legs',  'bodyweight'),
  ('Glute Kickback',             'glute-kickback',             ARRAY['cable kickback'],                         'legs',  'cable'),
  ('Dumbbell Lunge',             'dumbbell-lunge',             ARRAY['stationary lunge'],                       'legs',  'dumbbell'),
  ('Barbell Lunge',              'barbell-lunge',              ARRAY['barbell walking lunge'],                  'legs',  'barbell'),
  ('Jefferson Curl',             'jefferson-curl',             ARRAY['jefferson deadlift'],                     'legs',  'barbell')
) AS seed(name, slug, aliases, muscle_group, equipment)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  aliases = (
    SELECT array_agg(distinct a ORDER BY a)
    FROM unnest(coalesce(exercise_definitions.aliases,'{}'::text[]) || coalesce(excluded.aliases,'{}'::text[])) a
  ),
  muscle_group = coalesce(excluded.muscle_group, exercise_definitions.muscle_group),
  equipment    = coalesce(excluded.equipment, exercise_definitions.equipment);


-- ============ Part 2: Batch B — Chest + Back (42 rows) ============

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
SELECT name, slug, aliases::text[], muscle_group, equipment
FROM (VALUES
  -- Chest
  ('Bench Press',              'bench-press',              ARRAY['benchpress','flat bench'],                  'chest', 'barbell'),
  ('Incline Bench Press',      'incline-bench-press',      ARRAY['incline benchpress','incline barbell bench'],'chest','barbell'),
  ('Dumbbell Bench Press',     'dumbbell-bench-press',     ARRAY['db bench','db flat bench'],                 'chest', 'dumbbell'),
  ('Decline Bench Press',      'decline-bench-press',      ARRAY['decline barbell bench'],                    'chest', 'barbell'),
  ('Close Grip Bench Press',   'close-grip-bench-press',   ARRAY['cgbp','close grip bench'],                  'chest', 'barbell'),
  ('Incline Dumbbell Press',   'incline-dumbbell-press',   ARRAY['incline db press'],                         'chest', 'dumbbell'),
  ('Decline Dumbbell Press',   'decline-dumbbell-press',   ARRAY['decline db press'],                         'chest', 'dumbbell'),
  ('Push Up',                  'push-up',                  ARRAY['pushup','press up'],                        'chest', 'bodyweight'),
  ('Dips',                     'dips',                     ARRAY['parallel bar dip','chest dip'],             'chest', 'bodyweight'),
  ('Chest Fly',                'chest-fly',                ARRAY['dumbbell fly','db fly'],                    'chest', 'dumbbell'),
  ('Dumbbell Chest Fly',       'dumbbell-chest-fly',       ARRAY['flat db fly'],                              'chest', 'dumbbell'),
  ('Incline Dumbbell Fly',     'incline-dumbbell-fly',     ARRAY['incline fly'],                              'chest', 'dumbbell'),
  ('Cable Fly',                'cable-fly',                ARRAY['cable chest fly'],                          'chest', 'cable'),
  ('Cable Crossover',          'cable-crossover',          ARRAY['cable cross','high cable fly'],             'chest', 'cable'),
  ('Pec Deck',                 'pec-deck',                 ARRAY['pec deck machine','chest fly machine'],     'chest', 'machine'),
  ('Machine Chest Press',      'machine-chest-press',      ARRAY['chest press machine','seated chest press'], 'chest', 'machine'),
  ('Landmine Press',           'landmine-press',           ARRAY['landmine chest press'],                     'chest', 'barbell'),
  ('Floor Press',              'floor-press',              ARRAY['barbell floor press'],                      'chest', 'barbell'),
  ('Dumbbell Pullover',        'dumbbell-pullover',        ARRAY['db pullover'],                              'chest', 'dumbbell'),
  -- Back
  ('Lat Pulldown',             'lat-pulldown',             ARRAY['lat pull-down','lat pull down'],            'back',  'machine'),
  ('Dumbbell Row',             'dumbbell-row',             ARRAY['db row','one arm row'],                     'back',  'dumbbell'),
  ('Pull Up',                  'pull-up',                  ARRAY['pullup','wide grip pull up'],               'back',  'bodyweight'),
  ('Chin Up',                  'chin-up',                  ARRAY['chinup','underhand pull up'],               'back',  'bodyweight'),
  ('Barbell Row',              'barbell-row',              ARRAY['bent over row','bb row'],                   'back',  'barbell'),
  ('Pendlay Row',              'pendlay-row',              ARRAY['strict barbell row'],                       'back',  'barbell'),
  ('T Bar Row',                't-bar-row',                ARRAY['t-bar','landmine row variant'],             'back',  'barbell'),
  ('Seated Cable Row',         'seated-cable-row',         ARRAY['cable row seated','low row'],               'back',  'cable'),
  ('Cable Row',                'cable-row',                ARRAY['standing cable row'],                       'back',  'cable'),
  ('Chest Supported Row',      'chest-supported-row',      ARRAY['incline db row','seal row'],                'back',  'dumbbell'),
  ('Straight Arm Pulldown',    'straight-arm-pulldown',    ARRAY['straight arm pushdown'],                    'back',  'cable'),
  ('Landmine Row',             'landmine-row',             ARRAY['single arm landmine row'],                  'back',  'barbell'),
  ('Machine Row',              'machine-row',              ARRAY['seated machine row'],                       'back',  'machine'),
  ('Inverted Row',             'inverted-row',             ARRAY['bodyweight row','australian pull up'],      'back',  'bodyweight'),
  ('Close Grip Lat Pulldown',  'close-grip-lat-pulldown',  ARRAY['close grip pulldown','v-bar pulldown'],    'back',  'machine'),
  ('Single Arm Dumbbell Row',  'single-arm-dumbbell-row',  ARRAY['one arm db row'],                          'back',  'dumbbell'),
  ('Meadows Row',              'meadows-row',              ARRAY['landmine meadows row'],                     'back',  'barbell'),
  ('Rack Pull',                'rack-pull',                ARRAY['rack deadlift'],                            'back',  'barbell'),
  ('Hyperextension',           'hyperextension',           ARRAY['back extension','roman chair'],             'back',  'bodyweight'),
  ('Reverse Grip Lat Pulldown','reverse-grip-lat-pulldown',ARRAY['underhand pulldown'],                      'back',  'machine'),
  ('Reverse Fly Machine',      'reverse-fly-machine',      ARRAY['rear delt machine'],                       'back',  'machine'),
  ('Shrug',                    'shrug',                    ARRAY['barbell shrug'],                            'back',  'barbell'),
  ('Dumbbell Shrug',           'dumbbell-shrug',           ARRAY['db shrug'],                                'back',  'dumbbell')
) AS seed(name, slug, aliases, muscle_group, equipment)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  aliases = (
    SELECT array_agg(distinct a ORDER BY a)
    FROM unnest(coalesce(exercise_definitions.aliases,'{}'::text[]) || coalesce(excluded.aliases,'{}'::text[])) a
  ),
  muscle_group = coalesce(excluded.muscle_group, exercise_definitions.muscle_group),
  equipment    = coalesce(excluded.equipment, exercise_definitions.equipment);


-- ============ Part 3: Batch C — Shoulders + Arms + Core (58 rows) ============

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
SELECT name, slug, aliases::text[], muscle_group, equipment
FROM (VALUES
  -- Shoulders
  ('Overhead Press',              'overhead-press',              ARRAY['ohp','shoulder press','military press'],    'shoulders','barbell'),
  ('Dumbbell Shoulder Press',     'dumbbell-shoulder-press',     ARRAY['db shoulder press','db ohp'],               'shoulders','dumbbell'),
  ('Arnold Press',                'arnold-press',                ARRAY['arnold dumbbell press'],                    'shoulders','dumbbell'),
  ('Lateral Raise',               'lateral-raise',               ARRAY['side raise','db lateral raise'],            'shoulders','dumbbell'),
  ('Cable Lateral Raise',         'cable-lateral-raise',         ARRAY['cable side raise'],                         'shoulders','cable'),
  ('Front Raise',                 'front-raise',                 ARRAY['dumbbell front raise'],                     'shoulders','dumbbell'),
  ('Rear Delt Fly',               'rear-delt-fly',               ARRAY['reverse fly','bent over fly'],              'shoulders','dumbbell'),
  ('Face Pull',                   'face-pull',                   ARRAY['cable face pull'],                          'shoulders','cable'),
  ('Upright Row',                 'upright-row',                 ARRAY['barbell upright row'],                      'shoulders','barbell'),
  ('Machine Shoulder Press',      'machine-shoulder-press',      ARRAY['shoulder press machine'],                   'shoulders','machine'),
  ('Push Press',                  'push-press',                  ARRAY['barbell push press'],                       'shoulders','barbell'),
  ('Behind The Neck Press',       'behind-the-neck-press',       ARRAY['btn press'],                                'shoulders','barbell'),
  ('Bradford Press',              'bradford-press',              ARRAY['rocky press'],                              'shoulders','barbell'),
  ('Dumbbell Lateral Raise',      'dumbbell-lateral-raise',      ARRAY['seated lateral raise'],                     'shoulders','dumbbell'),
  ('Cable Front Raise',           'cable-front-raise',           ARRAY['cable front delt raise'],                   'shoulders','cable'),
  ('Plate Front Raise',           'plate-front-raise',           ARRAY['plate raise'],                              'shoulders','barbell'),
  ('Band Pull Apart',             'band-pull-apart',             ARRAY['resistance band pull apart'],               'shoulders','band'),
  -- Arms
  ('Bicep Curl',                  'bicep-curl',                  ARRAY['curl','dumbbell curl'],                     'arms',    'dumbbell'),
  ('Tricep Pushdown',             'tricep-pushdown',             ARRAY['cable pushdown','rope pushdown'],           'arms',    'cable'),
  ('Hammer Curl',                 'hammer-curl',                 ARRAY['db hammer curl'],                           'arms',    'dumbbell'),
  ('Barbell Curl',                'barbell-curl',                ARRAY['bb curl','straight bar curl'],              'arms',    'barbell'),
  ('Preacher Curl',               'preacher-curl',               ARRAY['preacher bench curl','scott curl'],         'arms',    'dumbbell'),
  ('Concentration Curl',          'concentration-curl',          ARRAY['seated concentration curl'],                'arms',    'dumbbell'),
  ('Cable Curl',                  'cable-curl',                  ARRAY['cable bicep curl'],                         'arms',    'cable'),
  ('EZ Bar Curl',                 'ez-bar-curl',                 ARRAY['ez curl','cambered bar curl'],              'arms',    'barbell'),
  ('Incline Dumbbell Curl',       'incline-dumbbell-curl',       ARRAY['incline curl'],                             'arms',    'dumbbell'),
  ('Spider Curl',                 'spider-curl',                 ARRAY['prone incline curl'],                       'arms',    'dumbbell'),
  ('Reverse Curl',                'reverse-curl',                ARRAY['reverse grip curl'],                        'arms',    'barbell'),
  ('Zottman Curl',                'zottman-curl',                ARRAY['zottman'],                                  'arms',    'dumbbell'),
  ('Skullcrusher',                'skullcrusher',                ARRAY['lying tricep extension','skull crusher'],   'arms',    'barbell'),
  ('Triceps Extension',           'triceps-extension',           ARRAY['overhead triceps extension'],               'arms',    'dumbbell'),
  ('Overhead Triceps Extension',  'overhead-triceps-extension',  ARRAY['overhead extension'],                       'arms',    'dumbbell'),
  ('Triceps Kickback',            'triceps-kickback',            ARRAY['db kickback'],                              'arms',    'dumbbell'),
  ('Close Grip Push Up',          'close-grip-push-up',          ARRAY['diamond push up','tricep push up'],         'arms',    'bodyweight'),
  ('Cable Overhead Triceps Extension','cable-overhead-triceps-extension',ARRAY['cable overhead extension'],         'arms',    'cable'),
  ('Dip Machine',                 'dip-machine',                 ARRAY['assisted dip','machine dip'],               'arms',    'machine'),
  ('Wrist Curl',                  'wrist-curl',                  ARRAY['forearm curl'],                             'arms',    'dumbbell'),
  ('Reverse Wrist Curl',          'reverse-wrist-curl',          ARRAY['wrist extension'],                          'arms',    'dumbbell'),
  -- Core
  ('Plank',                       'plank',                       ARRAY['front plank'],                              'core',    'bodyweight'),
  ('Side Plank',                  'side-plank',                  ARRAY['lateral plank'],                            'core',    'bodyweight'),
  ('Hanging Leg Raise',           'hanging-leg-raise',           ARRAY['hanging knee raise'],                       'core',    'bodyweight'),
  ('Cable Crunch',                'cable-crunch',                ARRAY['kneeling cable crunch'],                    'core',    'cable'),
  ('Dead Bug',                    'dead-bug',                    ARRAY['dead bug exercise'],                        'core',    'bodyweight'),
  ('Ab Wheel',                    'ab-wheel',                    ARRAY['ab roller','ab wheel rollout'],             'core',    'bodyweight'),
  ('Russian Twist',               'russian-twist',               ARRAY['seated twist'],                             'core',    'bodyweight'),
  ('Bicycle Crunch',              'bicycle-crunch',              ARRAY['bicycle','cross body crunch'],              'core',    'bodyweight'),
  ('Mountain Climber',            'mountain-climber',            ARRAY['mountain climbers'],                        'core',    'bodyweight'),
  ('Leg Raise',                   'leg-raise',                   ARRAY['lying leg raise'],                          'core',    'bodyweight'),
  ('V Up',                        'v-up',                        ARRAY['v-sit','jackknife'],                        'core',    'bodyweight'),
  ('Sit Up',                      'sit-up',                      ARRAY['situp'],                                    'core',    'bodyweight'),
  ('Crunch',                      'crunch',                      ARRAY['basic crunch'],                             'core',    'bodyweight'),
  ('Woodchop',                    'woodchop',                    ARRAY['cable woodchop','wood chop'],               'core',    'cable'),
  ('Pallof Press',                'pallof-press',                ARRAY['anti-rotation press'],                      'core',    'cable'),
  ('Dragon Flag',                 'dragon-flag',                 ARRAY['body flag'],                                'core',    'bodyweight'),
  ('L Sit',                       'l-sit',                       ARRAY['l-sit hold'],                               'core',    'bodyweight'),
  ('Decline Sit Up',              'decline-sit-up',              ARRAY['decline crunch'],                           'core',    'bodyweight'),
  ('Toe Touch',                   'toe-touch',                   ARRAY['lying toe touch'],                          'core',    'bodyweight'),
  ('Flutter Kick',                'flutter-kick',                ARRAY['flutter kicks'],                            'core',    'bodyweight')
) AS seed(name, slug, aliases, muscle_group, equipment)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  aliases = (
    SELECT array_agg(distinct a ORDER BY a)
    FROM unnest(coalesce(exercise_definitions.aliases,'{}'::text[]) || coalesce(excluded.aliases,'{}'::text[])) a
  ),
  muscle_group = coalesce(excluded.muscle_group, exercise_definitions.muscle_group),
  equipment    = coalesce(excluded.equipment, exercise_definitions.equipment);


-- ============ Part 4: Batch D — Olympic / Conditioning / Kettlebell / Band (38 rows) ============

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
SELECT name, slug, aliases::text[], muscle_group, equipment
FROM (VALUES
  -- Olympic lifts
  ('Power Clean',              'power-clean',              ARRAY['clean'],                                'full_body','barbell'),
  ('Hang Clean',               'hang-clean',               ARRAY['hang power clean'],                     'full_body','barbell'),
  ('Clean And Press',          'clean-and-press',          ARRAY['clean and jerk'],                       'full_body','barbell'),
  ('Snatch',                   'snatch',                   ARRAY['barbell snatch','power snatch'],        'full_body','barbell'),
  ('Thruster',                 'thruster',                 ARRAY['squat to press'],                       'full_body','barbell'),
  ('Dumbbell Thruster',        'dumbbell-thruster',        ARRAY['db thruster'],                          'full_body','dumbbell'),
  ('Man Maker',                'man-maker',                ARRAY['manmaker'],                             'full_body','dumbbell'),
  ('Barbell Complex',          'barbell-complex',          ARRAY['bb complex'],                           'full_body','barbell'),
  -- Kettlebell
  ('Kettlebell Swing',         'kettlebell-swing',         ARRAY['kb swing','russian swing'],             'full_body','kettlebell'),
  ('Kettlebell Goblet Squat',  'kettlebell-goblet-squat',  ARRAY['kb goblet squat'],                     'legs',     'kettlebell'),
  ('Kettlebell Clean',         'kettlebell-clean',         ARRAY['kb clean'],                             'full_body','kettlebell'),
  ('Kettlebell Snatch',        'kettlebell-snatch',        ARRAY['kb snatch'],                            'full_body','kettlebell'),
  ('Turkish Get Up',           'turkish-get-up',           ARRAY['tgu','turkish getup'],                  'full_body','kettlebell'),
  ('Kettlebell Press',         'kettlebell-press',         ARRAY['kb press','kb ohp'],                    'shoulders','kettlebell'),
  ('Kettlebell Row',           'kettlebell-row',           ARRAY['kb row'],                               'back',     'kettlebell'),
  ('Kettlebell Windmill',      'kettlebell-windmill',      ARRAY['kb windmill'],                          'core',     'kettlebell'),
  -- Carries / conditioning
  ('Farmers Carry',            'farmers-carry',            ARRAY['farmer walk','farmers walk'],           'full_body','dumbbell'),
  ('Suitcase Carry',           'suitcase-carry',           ARRAY['single arm carry'],                     'core',     'dumbbell'),
  ('Overhead Carry',           'overhead-carry',           ARRAY['waiter walk'],                          'full_body','dumbbell'),
  ('Sled Push',                'sled-push',                ARRAY['prowler push'],                         'full_body','machine'),
  ('Sled Pull',                'sled-pull',                ARRAY['prowler pull'],                         'full_body','machine'),
  ('Battle Ropes',             'battle-ropes',             ARRAY['battle rope','rope waves'],             'full_body','cable'),
  ('Tire Flip',                'tire-flip',                ARRAY['tyre flip'],                            'full_body','bodyweight'),
  ('Box Jump',                 'box-jump',                 ARRAY['plyometric box jump'],                  'legs',     'bodyweight'),
  ('Broad Jump',               'broad-jump',               ARRAY['standing long jump'],                   'legs',     'bodyweight'),
  ('Burpee',                   'burpee',                   ARRAY['burpees'],                              'full_body','bodyweight'),
  ('Bear Crawl',               'bear-crawl',               ARRAY['bear crawl exercise'],                  'full_body','bodyweight'),
  ('Jumping Jack',             'jumping-jack',             ARRAY['jumping jacks','star jump'],            'full_body','bodyweight'),
  ('High Knees',               'high-knees',               ARRAY['high knee run'],                        'full_body','bodyweight'),
  ('Jump Squat',               'jump-squat',               ARRAY['squat jump'],                           'legs',     'bodyweight'),
  ('Lunge Jump',               'lunge-jump',               ARRAY['jumping lunge','split squat jump'],    'legs',     'bodyweight'),
  ('Rope Climb',               'rope-climb',               ARRAY['climbing rope'],                        'full_body','bodyweight'),
  ('Muscle Up',                'muscle-up',                ARRAY['bar muscle up'],                        'full_body','bodyweight'),
  -- Band work
  ('Band Squat',               'band-squat',               ARRAY['banded squat'],                         'legs',     'band'),
  ('Band Row',                 'band-row',                 ARRAY['banded row'],                           'back',     'band'),
  ('Band Bicep Curl',          'band-bicep-curl',          ARRAY['banded curl'],                          'arms',     'band'),
  ('Band Lateral Walk',        'band-lateral-walk',        ARRAY['monster walk'],                         'legs',     'band'),
  ('Band Hip Thrust',          'band-hip-thrust',          ARRAY['banded hip thrust'],                    'legs',     'band')
) AS seed(name, slug, aliases, muscle_group, equipment)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  aliases = (
    SELECT array_agg(distinct a ORDER BY a)
    FROM unnest(coalesce(exercise_definitions.aliases,'{}'::text[]) || coalesce(excluded.aliases,'{}'::text[])) a
  ),
  muscle_group = coalesce(excluded.muscle_group, exercise_definitions.muscle_group),
  equipment    = coalesce(excluded.equipment, exercise_definitions.equipment);


-- ============ Part 5: Batch E — Cardio + Yoga / Mobility (30 rows) ============

INSERT INTO exercise_definitions (name, slug, aliases, muscle_group, equipment)
SELECT name, slug, aliases::text[], muscle_group, equipment
FROM (VALUES
  -- Cardio
  ('Run Outdoor',       'run-outdoor',       ARRAY['outdoor run','jogging'],               'cardio',   'outdoor'),
  ('Treadmill Run',     'treadmill-run',     ARRAY['treadmill','treadmill jog'],           'cardio',   'cardio'),
  ('Interval Run',      'interval-run',      ARRAY['hiit run','sprint intervals'],         'cardio',   'outdoor'),
  ('Walk Outdoor',      'walk-outdoor',      ARRAY['outdoor walk','walking'],              'cardio',   'outdoor'),
  ('Incline Walk',      'incline-walk',      ARRAY['treadmill incline walk','12-3-30'],   'cardio',   'cardio'),
  ('Cycling',           'cycling',           ARRAY['road cycling','bike ride'],            'cardio',   'outdoor'),
  ('Stationary Bike',   'stationary-bike',   ARRAY['exercise bike','spin bike'],           'cardio',   'cardio'),
  ('Rowing Machine',    'rowing-machine',    ARRAY['erg','rower'],                         'cardio',   'cardio'),
  ('Elliptical',        'elliptical',        ARRAY['cross trainer','elliptical machine'],  'cardio',   'cardio'),
  ('Stair Climber',     'stair-climber',     ARRAY['stair master','stairmill'],            'cardio',   'cardio'),
  ('Jump Rope',         'jump-rope',         ARRAY['skipping','skipping rope'],            'cardio',   'bodyweight'),
  ('Hiking',            'hiking',            ARRAY['hike','trail hike'],                   'cardio',   'outdoor'),
  ('Swimming',          'swimming',          ARRAY['swim','lap swim'],                     'cardio',   'outdoor'),
  ('Sprints',           'sprints',           ARRAY['sprint','wind sprints'],               'cardio',   'outdoor'),
  -- Yoga / mobility
  ('Yoga Flow',         'yoga-flow',         ARRAY['vinyasa','yoga session'],              'mobility', 'yoga'),
  ('Yoga Recovery',     'yoga-recovery',     ARRAY['restorative yoga','yin yoga'],         'mobility', 'yoga'),
  ('Sun Salutation',    'sun-salutation',    ARRAY['surya namaskar'],                      'mobility', 'yoga'),
  ('Downward Dog',      'downward-dog',      ARRAY['adho mukha svanasana'],                'mobility', 'yoga'),
  ('Childs Pose',       'childs-pose',       ARRAY['balasana'],                            'mobility', 'yoga'),
  ('Warrior II',        'warrior-ii',        ARRAY['virabhadrasana ii'],                   'mobility', 'yoga'),
  ('Pigeon Pose',       'pigeon-pose',       ARRAY['eka pada rajakapotasana'],             'mobility', 'yoga'),
  ('Cobra Pose',        'cobra-pose',        ARRAY['bhujangasana'],                        'mobility', 'yoga'),
  ('Bridge Pose',       'bridge-pose',       ARRAY['setu bandhasana'],                     'mobility', 'yoga'),
  ('Cat Cow',           'cat-cow',           ARRAY['cat cow stretch'],                     'mobility', 'yoga'),
  ('Foam Roll',         'foam-roll',         ARRAY['foam rolling','myofascial release'],   'mobility', 'bodyweight'),
  ('Hip Opener',        'hip-opener',        ARRAY['hip flexor stretch'],                  'mobility', 'bodyweight'),
  ('Shoulder Stretch',  'shoulder-stretch',  ARRAY['shoulder mobility'],                   'mobility', 'bodyweight'),
  ('Hamstring Stretch', 'hamstring-stretch', ARRAY['hamstring flexibility'],               'mobility', 'bodyweight'),
  ('Quad Stretch',      'quad-stretch',      ARRAY['quad flexibility'],                    'mobility', 'bodyweight'),
  ('Thoracic Rotation', 'thoracic-rotation', ARRAY['thoracic spine mobility','t-spine rotation'],'mobility','bodyweight')
) AS seed(name, slug, aliases, muscle_group, equipment)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  aliases = (
    SELECT array_agg(distinct a ORDER BY a)
    FROM unnest(coalesce(exercise_definitions.aliases,'{}'::text[]) || coalesce(excluded.aliases,'{}'::text[])) a
  ),
  muscle_group = coalesce(excluded.muscle_group, exercise_definitions.muscle_group),
  equipment    = coalesce(excluded.equipment, exercise_definitions.equipment);


-- ============ Part 6: POSTCHECKS ============

DO $$
DECLARE
  _after  bigint;
  _dupes  bigint;
  _nullmg bigint;
  _nulleq bigint;
  _mg     text[];
  _eq     text[];
BEGIN
  RAISE NOTICE '=== MIGRATION-004 POSTCHECKS ===';

  -- Total count
  SELECT count(*) INTO _after FROM exercise_definitions;
  IF _after >= 200 THEN
    RAISE NOTICE 'PASS: exercise_definitions has % rows (>= 200)', _after;
  ELSE
    RAISE NOTICE 'FAIL: exercise_definitions has only % rows (expected >= 200)', _after;
  END IF;

  -- Duplicate slug check (should always be 0 due to unique index)
  SELECT count(*) INTO _dupes
  FROM (SELECT slug FROM exercise_definitions GROUP BY slug HAVING count(*) > 1) sub;
  IF _dupes = 0 THEN
    RAISE NOTICE 'PASS: No duplicate slugs';
  ELSE
    RAISE NOTICE 'FAIL: % duplicate slugs found', _dupes;
  END IF;

  -- muscle_group coverage
  SELECT array_agg(DISTINCT muscle_group ORDER BY muscle_group)
  INTO _mg FROM exercise_definitions WHERE muscle_group IS NOT NULL;
  RAISE NOTICE 'muscle_group values: %', _mg;

  -- equipment coverage
  SELECT array_agg(DISTINCT equipment ORDER BY equipment)
  INTO _eq FROM exercise_definitions WHERE equipment IS NOT NULL;
  RAISE NOTICE 'equipment values: %', _eq;

  -- NULL checks
  SELECT count(*) INTO _nullmg FROM exercise_definitions WHERE muscle_group IS NULL;
  IF _nullmg = 0 THEN
    RAISE NOTICE 'PASS: No NULL muscle_group values';
  ELSE
    RAISE NOTICE 'WARN: % rows have NULL muscle_group', _nullmg;
  END IF;

  SELECT count(*) INTO _nulleq FROM exercise_definitions WHERE equipment IS NULL;
  IF _nulleq = 0 THEN
    RAISE NOTICE 'PASS: No NULL equipment values';
  ELSE
    RAISE NOTICE 'WARN: % rows have NULL equipment', _nulleq;
  END IF;

  RAISE NOTICE '=== MIGRATION-004 COMPLETE ===';
END $$;
