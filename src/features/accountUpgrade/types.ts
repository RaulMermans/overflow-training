export interface AccountUpgradeStepResult {
  stepId: string
  applied: boolean
  skipped: boolean
  error: string | null
}

export interface AccountUpgradeResult {
  userId: string
  steps: AccountUpgradeStepResult[]
  legacyItemsScanned: number
  legacyItemsResolved: number
  legacyItemsUnresolved: number
  routinesDropped: number
  repairForced: boolean
}
