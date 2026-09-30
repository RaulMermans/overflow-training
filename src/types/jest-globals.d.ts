declare namespace jest {
  interface MockFunction {
    (...args: unknown[]): unknown
    mock: { calls: unknown[][]; results: Array<{ value: unknown }> }
    mockClear(): this
    mockReset(): this
    mockImplementation(fn?: (...args: never[]) => unknown): this
    mockRejectedValue(value: unknown): this
    mockResolvedValue(value: unknown): this
    mockResolvedValueOnce(value: unknown): this
    mockReturnValue(value: unknown): this
    mockReturnValueOnce(value: unknown): this
  }

  type Mock = MockFunction

  type MockedFunction<T extends (...args: never[]) => unknown> = MockFunction & T

  interface SpyInstance extends MockFunction {
    mockRestore(): void
  }
}

interface ExpectMatcher {
  not: ExpectMatcher
  resolves: ExpectMatcher
  rejects: ExpectMatcher
  toBe(value: unknown): ExpectMatcher
  toBeInstanceOf(expectedClass: unknown): ExpectMatcher
  toBeCloseTo(value: number, digits?: number): ExpectMatcher
  toBeDefined(): ExpectMatcher
  toBeGreaterThan(value: number): ExpectMatcher
  toBeGreaterThanOrEqual(value: number): ExpectMatcher
  toBeLessThan(value: number): ExpectMatcher
  toBeLessThanOrEqual(value: number): ExpectMatcher
  toBeNull(): ExpectMatcher
  toBeTruthy(): ExpectMatcher
  toBeFalsy(): ExpectMatcher
  toBeUndefined(): ExpectMatcher
  toContain(value: unknown): ExpectMatcher
  toEqual(value: unknown): ExpectMatcher
  toHaveBeenCalled(): ExpectMatcher
  toHaveBeenCalledTimes(value: number): ExpectMatcher
  toHaveBeenCalledWith(...args: unknown[]): ExpectMatcher
  toHaveBeenNthCalledWith(callIndex: number, ...args: unknown[]): ExpectMatcher
  toHaveLength(value: number): ExpectMatcher
  toMatch(value: string | RegExp): ExpectMatcher
  toThrow(value?: unknown): ExpectMatcher
}

declare const jest: {
  fn: (implementation?: (...args: never[]) => unknown) => jest.MockFunction
  spyOn: (object: object, methodName: string) => jest.SpyInstance
  mock: (moduleName: string, factory?: (...args: never[]) => unknown) => void
  requireActual: <T extends object = Record<string, unknown>>(moduleName: string) => T
  requireMock: <T = unknown>(moduleName: string) => T
  clearAllMocks: () => void
  resetModules: () => void
  isolateModules: (fn: () => void) => void
  restoreAllMocks: () => void
  useFakeTimers: () => void
  useRealTimers: () => void
  advanceTimersByTime: (msToRun: number) => void
  runAllTimers: () => void
}

declare function describe(name: string, fn: () => void): void
declare function it(name: string, fn: () => void | Promise<void>, timeout?: number): void
declare function beforeEach(fn: () => void | Promise<void>): void
declare function afterEach(fn: () => void | Promise<void>): void

interface ExpectGlobal {
  (value: unknown): ExpectMatcher
  any: (expectedClass: unknown) => unknown
  stringContaining: (value: string) => unknown
  objectContaining: (value: Record<string, unknown>) => unknown
  arrayContaining: (value: readonly unknown[]) => unknown
}

declare const expect: ExpectGlobal
