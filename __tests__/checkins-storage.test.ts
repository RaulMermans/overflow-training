const mockFiles = new Map<string, string>()
const mockDirectories = new Set<string>()

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  __setFile: (uri: string, value: string) => {
    mockFiles.set(uri, value)
  },
  __getFile: (uri: string) => mockFiles.get(uri),
  __hasFile: (uri: string) => mockFiles.has(uri),
  __clear: () => {
    mockFiles.clear()
    mockDirectories.clear()
  },
  makeDirectoryAsync: jest.fn(async (uri: string) => {
    mockDirectories.add(uri)
  }),
  getInfoAsync: jest.fn(async (uri: string) => ({
    exists: mockFiles.has(uri) || mockDirectories.has(uri),
  })),
  readAsStringAsync: jest.fn(async (uri: string) => {
    const value = mockFiles.get(uri)
    if (typeof value !== 'string') {
      throw new Error('File not found')
    }
    return value
  }),
  writeAsStringAsync: jest.fn(async (uri: string, value: string) => {
    mockFiles.set(uri, value)
  }),
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    const value = mockFiles.get(from)
    if (typeof value !== 'string') {
      throw new Error('File not found')
    }
    mockFiles.set(to, value)
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri)
    mockDirectories.delete(uri)
  }),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    const value = mockFiles.get(from)
    if (typeof value !== 'string') {
      throw new Error('File not found')
    }
    mockFiles.delete(from)
    mockFiles.set(to, value)
  }),
}))

import {
  addCheckinFromPicker,
  deleteCheckin,
  getCheckinDueInfo,
  listCheckins,
  markCheckinPromptedNow,
} from '../src/features/checkins/storage'

describe('check-ins local storage', () => {
  const FileSystem = jest.requireMock('expo-file-system/legacy') as {
    __setFile: (uri: string, value: string) => void
    __hasFile: (uri: string) => boolean
    __clear: () => void
  }

  beforeEach(() => {
    FileSystem.__clear()
  })

  it('copies picker image to document directory and persists entry', async () => {
    const userId = 'user-1'
    const pickerUri = 'file:///tmp/picker-image.jpg'
    FileSystem.__setFile(pickerUri, 'binary-data')

    const saved = await addCheckinFromPicker(userId, pickerUri, {
      takenAtISO: '2026-01-01T12:00:00.000Z',
      pose: 'front',
      width: 1200,
      height: 1800,
    })

    expect(saved).not.toBeNull()
    expect(saved?.photoUri).toContain('file:///documents/checkins-v1/user-1/photos/')
    expect(saved?.photoUri).not.toBe(pickerUri)
    expect(saved?.syncState).toBe('pending')

    const entries = await listCheckins(userId)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe(saved?.id)
    expect(entries[0]?.syncState).toBe('pending')
    expect(FileSystem.__hasFile(saved?.photoUri ?? '')).toBe(true)
  })

  it('falls back to backup index when primary is invalid', async () => {
    const userId = 'user+backup'
    const encodedUserId = encodeURIComponent(userId)
    const primaryUri = `file:///documents/checkins-v1/${encodedUserId}/index.json`
    const backupUri = `file:///documents/checkins-v1/${encodedUserId}/index.backup.json`

    FileSystem.__setFile(primaryUri, '{broken-json')
    FileSystem.__setFile(
      backupUri,
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: 'c1',
            userId,
            takenAtISO: '2026-01-01T12:00:00.000Z',
            pose: 'front',
            photoUri: 'file:///documents/checkins-v1/user/photos/c1.jpg',
          },
        ],
        lastPromptedAtISO: null,
      }),
    )

    const entries = await listCheckins(userId)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe('c1')
  })

  it('computes due info and stores prompt timestamp', async () => {
    const userId = 'user-2'
    const pickerUri = 'file:///tmp/checkin.jpg'
    FileSystem.__setFile(pickerUri, 'img')

    await addCheckinFromPicker(userId, pickerUri, {
      takenAtISO: '2026-01-01T10:00:00.000Z',
      pose: 'front',
    })

    const beforeDue = await getCheckinDueInfo(userId, new Date('2026-01-20T10:00:00.000Z'))
    expect(beforeDue.isDue).toBe(false)
    expect(beforeDue.nextDueAtISO).toBe('2026-01-31T10:00:00.000Z')

    const afterDue = await getCheckinDueInfo(userId, new Date('2026-02-02T10:00:00.000Z'))
    expect(afterDue.isDue).toBe(true)

    const promptedAtISO = await markCheckinPromptedNow(userId, new Date('2026-02-02T11:00:00.000Z'))
    expect(promptedAtISO).toBe('2026-02-02T11:00:00.000Z')

    const withPrompt = await getCheckinDueInfo(userId, new Date('2026-02-02T12:00:00.000Z'))
    expect(withPrompt.lastPromptedAtISO).toBe('2026-02-02T11:00:00.000Z')
  })

  it('deletes photo file and removes index entry', async () => {
    const userId = 'user-3'
    const pickerUri = 'file:///tmp/to-delete.jpg'
    FileSystem.__setFile(pickerUri, 'img')

    const saved = await addCheckinFromPicker(userId, pickerUri, {
      takenAtISO: '2026-01-01T12:00:00.000Z',
      pose: 'front',
    })

    expect(saved).not.toBeNull()
    expect(FileSystem.__hasFile(saved?.photoUri ?? '')).toBe(true)

    await deleteCheckin(userId, saved?.id ?? '')

    const remaining = await listCheckins(userId)
    expect(remaining).toEqual([])
    expect(FileSystem.__hasFile(saved?.photoUri ?? '')).toBe(false)
  })
})
