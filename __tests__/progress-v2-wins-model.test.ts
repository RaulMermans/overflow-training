import { buildProgressWins } from '../src/features/progress-v2/winsModel'

describe('progress-v2 winsModel', () => {
  it('shows PR win only when prsCount is positive', () => {
    const withWins = buildProgressWins({ prsCount: 2 })
    const withoutWins = buildProgressWins({ prsCount: 0 })

    expect(withWins.wins[0]).toEqual(
      expect.objectContaining({
        id: 'prs',
        title: { key: 'progress.v2.wins.prs.title' },
        body: { key: 'progress.v2.wins.prs.bodyPlural', params: { count: 2 } },
      }),
    )
    expect(withoutWins.wins.find((win) => win.id === 'prs')).toBeUndefined()
  })

  it('shows a best-week win when the current period beats the previous one', () => {
    const wins = buildProgressWins({
      bestWeekCurrent: 5,
      bestWeekPrevious: 3,
    })

    expect(wins.wins[0]).toEqual(
      expect.objectContaining({
        id: 'bestWeek',
        title: { key: 'progress.v2.wins.bestWeek.title' },
        body: { key: 'progress.v2.wins.bestWeek.body', params: { count: 5 } },
      }),
    )
  })

  it('shows a goal-streak win only for streaks of two weeks or more', () => {
    const wins = buildProgressWins({ goalHitStreak: 3 })
    const short = buildProgressWins({ goalHitStreak: 1 })

    expect(wins.wins[0]).toEqual(
      expect.objectContaining({
        id: 'goalStreak',
        title: { key: 'progress.v2.wins.goalStreak.title' },
        body: { key: 'progress.v2.wins.goalStreak.body', params: { count: 3 } },
      }),
    )
    expect(short.wins).toHaveLength(0)
  })

  it('shows a comeback win when the previous period had no activity', () => {
    const wins = buildProgressWins({
      currentAverage: 2.5,
      previousAverage: 0,
    })

    expect(wins.wins[0]).toEqual(
      expect.objectContaining({
        id: 'comeback',
        title: { key: 'progress.v2.wins.comeback.title' },
        body: { key: 'progress.v2.wins.comeback.body' },
      }),
    )
  })

  it('keeps deterministic order across win types', () => {
    const wins = buildProgressWins({
      prsCount: 4,
      bestWeekCurrent: 5,
      bestWeekPrevious: 4,
      goalHitStreak: 3,
      currentAverage: 3,
      previousAverage: 0,
    })

    expect(wins.wins.map((win) => win.id)).toEqual(['prs', 'bestWeek', 'goalStreak'])
  })
})
