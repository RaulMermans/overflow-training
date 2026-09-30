export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'))
    }, timeoutMs)

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}
