import React, { type ComponentProps } from 'react'
import { SetRow as BaseSetRow } from '../../../components/ui/SetRow'

type WorkoutSessionSetRowProps = ComponentProps<typeof BaseSetRow>

export const SetRow = React.memo(function SetRow(props: WorkoutSessionSetRowProps) {
  return <BaseSetRow {...props} />
})
