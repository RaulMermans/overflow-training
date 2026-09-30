import fs from 'fs'
import path from 'path'

type Guard = {
  file: string
  bannedLiterals: string[]
}

const guards: Guard[] = [
  {
    file: 'app/(app)/checkins/index.tsx',
    bannedLiterals: [
      'Loading check-ins...',
      'No check-ins yet',
      'Save a progress photo now and compare with your next check-in.',
      'Compare with previous',
      'Choose from Library',
    ],
  },
  {
    file: 'app/(app)/checkins/compare.tsx',
    bannedLiterals: [
      'Compare check-ins',
      'Summary between dates',
      'Weekly sessions',
      'No workouts in this date range yet.',
      "We couldn't load one of these photos right now.",
    ],
  },
  {
    file: 'src/components/sync/SyncStatusPill.tsx',
    bannedLiterals: [
      'Source: ',
      'Outbox blocked: ',
      'Outbox offline: ',
      'Outbox paused by auth: ',
      'Schedule sync status: ',
    ],
  },
  {
    file: 'app/(auth)/_layout.tsx',
    bannedLiterals: ["title: 'Sign Up'", "title: 'Reset Password'"],
  },
  {
    file: 'src/components/workout-session/ExerciseAccordionItem.tsx',
    bannedLiterals: ["'No sets logged'", 'accessibilityLabel="Exercise options"'],
  },
  {
    file: 'app/(app)/workout-session.tsx',
    bannedLiterals: ['Last time: ${topSets'],
  },
  {
    file: 'app/(app)/(tabs)/profile.tsx',
    bannedLiterals: [
      'example.com/privacy',
      'example.com/terms',
      'title="PREFERENCES"',
      'title="LOGROS"',
      'title="OVERFLOW GOALS"',
      'title="ACCOUNT"',
      "'Overflow Member'",
      "language === 'es' ? 'Logros'",
    ],
  },
]

describe('localized UI hardcoded copy guard', () => {
  for (const guard of guards) {
    it(`avoids hardcoded copy in ${guard.file}`, () => {
      const absolutePath = path.join(__dirname, '..', guard.file)
      const content = fs.readFileSync(absolutePath, 'utf8')

      guard.bannedLiterals.forEach((literal) => {
        expect(content).not.toContain(literal)
      })
    })
  }
})
