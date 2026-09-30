import fs from 'node:fs'
import path from 'node:path'

describe('root layout safe area provider wiring', () => {
  const rootLayoutPath = path.join(__dirname, '..', 'app', '_layout.tsx')
  const source = fs.readFileSync(rootLayoutPath, 'utf8')

  it('imports SafeAreaProvider from react-native-safe-area-context', () => {
    expect(source).toContain("import { SafeAreaProvider } from 'react-native-safe-area-context'")
  })

  it('wraps app output in SafeAreaProvider', () => {
    expect(source).toContain('return <SafeAreaProvider>{appTree}</SafeAreaProvider>')
  })
})
