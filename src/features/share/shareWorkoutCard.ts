import { Share } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'

const SHARE_CARD_CACHE_DIRECTORY = 'share-cards'

type SvgLike = {
  toDataURL: (callback: (base64: string) => void, options?: object) => void
}

interface ShareWorkoutCardInput {
  cacheKey: string
  fallbackText: string
  renderImageBase64: () => Promise<string>
}

interface ShareWorkoutCardResult {
  shared: boolean
  usedImage: boolean
}

function sanitizeCacheKey(cacheKey: string): string {
  return cacheKey.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function getOrCreateShareImageUri(
  cacheKey: string,
  renderImageBase64: () => Promise<string>,
): Promise<string | null> {
  const baseDirectory = FileSystem.cacheDirectory
  if (!baseDirectory) return null

  const cacheDirectory = `${baseDirectory}${SHARE_CARD_CACHE_DIRECTORY}/`

  await FileSystem.makeDirectoryAsync(cacheDirectory, { intermediates: true })

  const fileUri = `${cacheDirectory}${sanitizeCacheKey(cacheKey)}.png`
  const fileInfo = await FileSystem.getInfoAsync(fileUri)

  if (fileInfo.exists) {
    return fileUri
  }

  const imageBase64 = await renderImageBase64()
  if (!imageBase64) return null

  await FileSystem.writeAsStringAsync(fileUri, imageBase64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  return fileUri
}

export function captureSvgToPngBase64(svg: SvgLike | null): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!svg) {
      reject(new Error('Share card renderer is unavailable.'))
      return
    }

    try {
      svg.toDataURL((base64) => {
        if (!base64) {
          reject(new Error('Failed to capture share card image.'))
          return
        }

        resolve(base64)
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Failed to capture image.'))
    }
  })
}

export async function shareWorkoutCard({
  cacheKey,
  fallbackText,
  renderImageBase64,
}: ShareWorkoutCardInput): Promise<ShareWorkoutCardResult> {
  try {
    const imageUri = await getOrCreateShareImageUri(cacheKey, renderImageBase64)

    if (imageUri) {
      await Share.share({
        url: imageUri,
        message: fallbackText,
      })

      return {
        shared: true,
        usedImage: true,
      }
    }
  } catch {
    // Image rendering/caching failures should fall back to text share.
  }

  try {
    await Share.share({ message: fallbackText })
    return {
      shared: true,
      usedImage: false,
    }
  } catch {
    return {
      shared: false,
      usedImage: false,
    }
  }
}
