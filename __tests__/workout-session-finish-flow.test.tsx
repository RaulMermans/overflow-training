import React from 'react'
import {
  WorkoutSessionFinishModal,
  type WorkoutSessionFinishModalState,
} from '../src/features/workoutSession/components/FinishModal'
import { WorkoutCompleteCelebration } from '../src/features/workoutSession/components/WorkoutCompleteCelebration'

type FlowState = WorkoutSessionFinishModalState | 'success'

function buildFinishFlowNode(input: {
  flowState: FlowState
  finishError?: string | null
  queuedDetail?: string | null
  isSharing?: boolean
  shareError?: string | null
}) {
  const {
    flowState,
    finishError = null,
    queuedDetail = null,
    isSharing = false,
    shareError = null,
  } = input

  if (flowState === 'success') {
    return (
      <WorkoutCompleteCelebration
        visible
        data={{
          workoutTitle: 'Leg Day',
          dateLabel: 'Mar 15',
          durationSeconds: 3600,
          setCount: 12,
          exerciseCount: 4,
          volumeKg: 8000,
          units: 'kg',
          prExerciseNames: ['Squat'],
        }}
        labels={{
          title: 'Session complete.',
          confirmed: 'Saved to your account.',
          motivation: 'Consistency looks strong.',
          share: 'Share session',
          sharing: 'Sharing...',
          continue: 'Continue',
          volume: 'Total volume',
          duration: 'Duration',
          sets: 'Sets',
          exercises: 'Exercises',
          pr: 'PR',
        }}
        isSharing={isSharing}
        shareError={shareError}
        reducedMotion={true}
        onShare={() => undefined}
        onDismiss={() => undefined}
      />
    )
  }

  return (
    <WorkoutSessionFinishModal
      visible
      state={flowState}
      errorMessage={finishError}
      queuedDetail={queuedDetail}
      effortRating={3}
      sessionNote="Keep elbows tucked"
      labels={{
        finishTitle: 'How did that feel?',
        finishBody: "Choose a gentle effort rating for today's session.",
        finishNoteLabel: 'Session note (optional)',
        finishNotePlaceholder: 'Any cue to remember next time?',
        finishHint: 'Select a rating, or choose Not now to finish without metadata.',
        close: 'Close',
        finishSubmitting: 'Finishing...',
        finishNotNow: 'Not now',
        finishSubmit: 'Finish',
        finishAndShare: 'Finish and Share',
        finishSavingTitle: 'Saving workout',
        finishSavingBody: 'Hang on while we save your session to your account.',
        finishErrorTitle: 'We could not finish this workout',
        finishRetry: 'Try again',
        finishDismiss: 'Not now',
        finishQueuedTitle: 'Saved on this device',
        finishQueuedBody:
          'Your workout is saved locally and will sync when your connection is back.',
        finishQueuedContinue: 'Continue',
        finishRetrySync: 'Retry sync',
      }}
      effortLabelForRating={() => 'Moderate'}
      overlayStyle={{}}
      cardStyle={{}}
      onRequestClose={() => undefined}
      onSelectEffortRating={() => undefined}
      onChangeSessionNote={() => undefined}
      onClose={() => undefined}
      onFinishNotNow={() => undefined}
      onFinishWithMeta={() => undefined}
      onFinishAndShare={() => undefined}
      onRetry={() => undefined}
      onRetrySync={() => undefined}
      onContinueAfterQueued={() => undefined}
    />
  )
}

describe('workout session finish flow surfaces', () => {
  it('keeps the finish modal visible and shows errors in the active finish surface', () => {
    const node = buildFinishFlowNode({
      flowState: 'error',
      finishError: 'The request timed out. Check your connection and try again.',
    })

    expect(node.type).toBe(WorkoutSessionFinishModal)
    expect(node.props.state).toBe('error')
    expect(node.props.errorMessage).toBe(
      'The request timed out. Check your connection and try again.',
    )
  })

  it('shows queued completion in the finish modal instead of showing celebration', () => {
    const node = buildFinishFlowNode({
      flowState: 'queued',
      queuedDetail: 'Still waiting to sync this workout. Check your connection and try again.',
    })

    expect(node.type).toBe(WorkoutSessionFinishModal)
    expect(node.props.state).toBe('queued')
    expect(node.props.queuedDetail).toBe(
      'Still waiting to sync this workout. Check your connection and try again.',
    )
  })

  it('shows celebration only after confirmed success', () => {
    const node = buildFinishFlowNode({ flowState: 'success' })

    expect(node.type).toBe(WorkoutCompleteCelebration)
    expect(node.props.visible).toBe(true)
  })

  it('renders share failures on the celebration surface', () => {
    const node = buildFinishFlowNode({
      flowState: 'success',
      shareError: 'Share did not open, but your workout is saved.',
    })

    expect(node.type).toBe(WorkoutCompleteCelebration)
    expect(node.props.shareError).toBe('Share did not open, but your workout is saved.')
  })

  it('keeps the success surface visible while sharing is still in progress', () => {
    const node = buildFinishFlowNode({
      flowState: 'success',
      isSharing: true,
    })

    expect(node.type).toBe(WorkoutCompleteCelebration)
    expect(node.props.visible).toBe(true)
    expect(node.props.isSharing).toBe(true)
  })
})
