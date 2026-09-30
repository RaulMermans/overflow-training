jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}))

jest.mock('../src/lib/supabaseClient', () => {
  const actual = jest.requireActual('../src/lib/supabaseClient')
  return {
    ...actual,
    requireSupabase: jest.fn(),
  }
})

jest.mock('../src/db/checkinPhotos', () => ({
  listCheckinPhotoMeta: jest.fn(),
  upsertCheckinPhotoMeta: jest.fn(),
}))

jest.mock('../src/features/checkins/storage', () => ({
  listCheckins: jest.fn(),
  patchCheckinCloudFields: jest.fn(async () => null),
  mergeRemoteCheckins: jest.fn(async () => []),
}))

import * as FileSystem from 'expo-file-system/legacy'
import { requireSupabase } from '../src/lib/supabaseClient'
import { listCheckinPhotoMeta, upsertCheckinPhotoMeta } from '../src/db/checkinPhotos'
import {
  listCheckins,
  mergeRemoteCheckins,
  patchCheckinCloudFields,
} from '../src/features/checkins/storage'
import {
  base64ToArrayBuffer,
  resolveCheckinImageUri,
  syncCheckinsCloud,
} from '../src/features/checkins/cloudSync'

const readAsStringAsyncMock = FileSystem.readAsStringAsync as jest.MockedFunction<
  typeof FileSystem.readAsStringAsync
>
const getInfoAsyncMock = FileSystem.getInfoAsync as jest.MockedFunction<
  typeof FileSystem.getInfoAsync
>
const requireSupabaseMock = requireSupabase as jest.MockedFunction<typeof requireSupabase>
const listCheckinPhotoMetaMock = listCheckinPhotoMeta as jest.MockedFunction<
  typeof listCheckinPhotoMeta
>
const upsertCheckinPhotoMetaMock = upsertCheckinPhotoMeta as jest.MockedFunction<
  typeof upsertCheckinPhotoMeta
>
const listCheckinsMock = listCheckins as jest.MockedFunction<typeof listCheckins>
const mergeRemoteCheckinsMock = mergeRemoteCheckins as jest.MockedFunction<
  typeof mergeRemoteCheckins
>
const patchCheckinCloudFieldsMock = patchCheckinCloudFields as jest.MockedFunction<
  typeof patchCheckinCloudFields
>

function buildStorageClient() {
  const upload = jest.fn(async () => ({ data: { path: 'ok' }, error: null }))
  const createSignedUrl = jest.fn(async () => ({
    data: { signedUrl: 'https://signed-url.test/photo' },
    error: null,
  }))
  const from = jest.fn(() => ({ upload, createSignedUrl }))

  requireSupabaseMock.mockReturnValue({
    storage: { from },
  } as unknown as ReturnType<typeof requireSupabase>)

  return { upload, createSignedUrl, from }
}

describe('check-in cloud sync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getInfoAsyncMock.mockResolvedValue({ exists: true } as Awaited<
      ReturnType<typeof FileSystem.getInfoAsync>
    >)
    readAsStringAsyncMock.mockResolvedValue('AQID')
    upsertCheckinPhotoMetaMock.mockResolvedValue({ data: null, error: null })
    listCheckinPhotoMetaMock.mockResolvedValue({ data: [], error: null })
    listCheckinsMock.mockResolvedValue([])
  })

  it('converts base64 to ArrayBuffer', () => {
    const buffer = base64ToArrayBuffer('AQID')
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3])
  })

  it('uploads pending local check-ins using ArrayBuffer payload', async () => {
    const storageClient = buildStorageClient()
    listCheckinsMock.mockResolvedValue([
      {
        id: 'c1',
        userId: 'user-1',
        takenAtISO: '2026-02-01T00:00:00.000Z',
        pose: 'front',
        photoUri: 'file:///documents/checkins-v1/user-1/photos/c1.jpg',
        syncState: 'pending',
      },
    ])

    const result = await syncCheckinsCloud('user-1', { pullRemote: false })

    expect(result.uploaded).toBe(1)
    expect(result.failed).toBe(0)
    expect(storageClient.from).toHaveBeenCalledWith('checkins')
    const uploadCall = storageClient.upload.mock.calls[0]
    expect(uploadCall[0]).toBe('user-1/c1.jpg')
    expect(uploadCall[1]).toBeInstanceOf(ArrayBuffer)
    expect(Array.from(new Uint8Array(uploadCall[1] as ArrayBuffer))).toEqual([1, 2, 3])
    expect(upsertCheckinPhotoMetaMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        checkin_id: 'c1',
        photo_path: 'user-1/c1.jpg',
      }),
    )
    expect(patchCheckinCloudFieldsMock).toHaveBeenCalledWith(
      'user-1',
      'c1',
      expect.objectContaining({
        remotePath: 'user-1/c1.jpg',
        syncState: 'synced',
      }),
    )
  })

  it('pulls remote metadata and merges into local index', async () => {
    buildStorageClient()
    listCheckinPhotoMetaMock.mockResolvedValue({
      data: [
        {
          checkin_id: 'remote-1',
          user_id: 'user-1',
          taken_at: '2026-01-15T10:00:00.000Z',
          pose: 'front',
          photo_path: 'user-1/remote-1.jpg',
          width: 800,
          height: 1200,
          notes: null,
          weight_kg: null,
          updated_at: '2026-01-15T10:10:00.000Z',
        },
      ],
      error: null,
    })

    const result = await syncCheckinsCloud('user-1', { pullRemote: true })

    expect(result.pulled).toBe(1)
    expect(mergeRemoteCheckinsMock).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'remote-1',
          remotePath: 'user-1/remote-1.jpg',
        }),
      ]),
    )
  })

  it('prefers existing local photo uri when file is present', async () => {
    const storageClient = buildStorageClient()

    const uri = await resolveCheckinImageUri('user-1', {
      id: 'c1',
      userId: 'user-1',
      takenAtISO: '2026-02-01T00:00:00.000Z',
      pose: 'front',
      photoUri: 'file:///documents/checkins-v1/user-1/photos/c1.jpg',
      remotePath: 'user-1/c1.jpg',
      syncState: 'synced',
    })

    expect(uri).toBe('file:///documents/checkins-v1/user-1/photos/c1.jpg')
    expect(storageClient.createSignedUrl).not.toHaveBeenCalled()
  })

  it('creates and caches signed url when local file is missing', async () => {
    const storageClient = buildStorageClient()
    getInfoAsyncMock.mockResolvedValue({ exists: false } as Awaited<
      ReturnType<typeof FileSystem.getInfoAsync>
    >)

    const uri = await resolveCheckinImageUri('user-1', {
      id: 'c2',
      userId: 'user-1',
      takenAtISO: '2026-02-02T00:00:00.000Z',
      pose: 'front',
      photoUri: 'file:///documents/checkins-v1/user-1/photos/c2.jpg',
      remotePath: 'user-1/c2.jpg',
      syncState: 'synced',
    })

    expect(storageClient.createSignedUrl).toHaveBeenCalledWith('user-1/c2.jpg', 60 * 60 * 24)
    expect(patchCheckinCloudFieldsMock).toHaveBeenCalledWith(
      'user-1',
      'c2',
      expect.objectContaining({
        remoteSignedUrl: 'https://signed-url.test/photo',
      }),
    )
    expect(uri).toBe('https://signed-url.test/photo')
  })
})
