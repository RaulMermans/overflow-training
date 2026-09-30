import type { ProgramTemplate } from './types'

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'ppl',
    nameKey: 'programs.template.ppl.name',
    descriptionKey: 'programs.template.ppl.description',
    weeklySchedule: {
      mon: 'push',
      tue: 'pull',
      wed: 'legs',
      thu: 'push',
      fri: 'pull',
      sat: 'legs',
      sun: null,
    },
    workouts: [
      {
        id: 'push',
        nameKey: 'programs.workout.push',
        exercises: [
          { slug: 'bench-press', sets: 4, reps: 6, type: 'compound', restSeconds: 150 },
          { slug: 'incline-bench-press', sets: 3, reps: 8, type: 'compound', restSeconds: 120 },
          { slug: 'overhead-press', sets: 3, reps: 8, type: 'compound', restSeconds: 120 },
          { slug: 'tricep-pushdown', sets: 3, reps: 12, type: 'accessory', restSeconds: 75 },
        ],
      },
      {
        id: 'pull',
        nameKey: 'programs.workout.pull',
        exercises: [
          { slug: 'deadlift', sets: 3, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'lat-pulldown', sets: 3, reps: 10, type: 'compound', restSeconds: 120 },
          { slug: 'dumbbell-row', sets: 3, reps: 10, type: 'compound', restSeconds: 120 },
          { slug: 'bicep-curl', sets: 3, reps: 12, type: 'accessory', restSeconds: 75 },
        ],
      },
      {
        id: 'legs',
        nameKey: 'programs.workout.legs',
        exercises: [
          { slug: 'squat', sets: 4, reps: 6, type: 'compound', restSeconds: 180 },
          { slug: 'deadlift', sets: 2, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'dumbbell-row', sets: 3, reps: 10, type: 'accessory', restSeconds: 90 },
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    nameKey: 'programs.template.upperLower.name',
    descriptionKey: 'programs.template.upperLower.description',
    weeklySchedule: {
      mon: 'upper',
      tue: 'lower',
      wed: null,
      thu: 'upper',
      fri: 'lower',
      sat: null,
      sun: null,
    },
    workouts: [
      {
        id: 'upper',
        nameKey: 'programs.workout.upper',
        exercises: [
          { slug: 'bench-press', sets: 4, reps: 6, type: 'compound', restSeconds: 150 },
          { slug: 'dumbbell-row', sets: 4, reps: 8, type: 'compound', restSeconds: 120 },
          { slug: 'overhead-press', sets: 3, reps: 8, type: 'compound', restSeconds: 120 },
          { slug: 'bicep-curl', sets: 3, reps: 12, type: 'accessory', restSeconds: 75 },
          { slug: 'tricep-pushdown', sets: 3, reps: 12, type: 'accessory', restSeconds: 75 },
        ],
      },
      {
        id: 'lower',
        nameKey: 'programs.workout.lower',
        exercises: [
          { slug: 'squat', sets: 4, reps: 6, type: 'compound', restSeconds: 180 },
          { slug: 'deadlift', sets: 3, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'lat-pulldown', sets: 3, reps: 10, type: 'accessory', restSeconds: 90 },
        ],
      },
    ],
  },
  {
    id: 'full-body',
    nameKey: 'programs.template.fullBody.name',
    descriptionKey: 'programs.template.fullBody.description',
    weeklySchedule: {
      mon: 'full',
      tue: null,
      wed: 'full',
      thu: null,
      fri: 'full',
      sat: null,
      sun: null,
    },
    workouts: [
      {
        id: 'full',
        nameKey: 'programs.workout.fullBody',
        exercises: [
          { slug: 'squat', sets: 3, reps: 5, type: 'compound', restSeconds: 150 },
          { slug: 'bench-press', sets: 3, reps: 5, type: 'compound', restSeconds: 150 },
          { slug: 'dumbbell-row', sets: 3, reps: 8, type: 'compound', restSeconds: 120 },
          { slug: 'overhead-press', sets: 2, reps: 8, type: 'accessory', restSeconds: 90 },
        ],
      },
    ],
  },
  {
    id: 'five-by-five',
    nameKey: 'programs.template.fiveByFive.name',
    descriptionKey: 'programs.template.fiveByFive.description',
    weeklySchedule: {
      mon: 'a',
      tue: null,
      wed: 'b',
      thu: null,
      fri: 'a',
      sat: null,
      sun: null,
    },
    workouts: [
      {
        id: 'a',
        nameKey: 'programs.workout.a',
        exercises: [
          { slug: 'squat', sets: 5, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'bench-press', sets: 5, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'dumbbell-row', sets: 5, reps: 5, type: 'compound', restSeconds: 150 },
        ],
      },
      {
        id: 'b',
        nameKey: 'programs.workout.b',
        exercises: [
          { slug: 'squat', sets: 5, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'overhead-press', sets: 5, reps: 5, type: 'compound', restSeconds: 180 },
          { slug: 'deadlift', sets: 1, reps: 5, type: 'compound', restSeconds: 180 },
        ],
      },
    ],
  },
]
