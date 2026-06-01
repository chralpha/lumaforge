import {
  useErrorMessageValue,
  usePipelineStatsValue,
  useProcessingStatusValue,
  useProgressValue,
  useSetErrorMessage,
  useSetPipelineStats,
  useSetProcessingStatus,
  useSetProgress,
} from '../state/workflow.atoms'

export function useRawWorkflowState() {
  const status = useProcessingStatusValue()
  const setStatus = useSetProcessingStatus()
  const error = useErrorMessageValue()
  const setError = useSetErrorMessage()
  const progress = useProgressValue()
  const setProgress = useSetProgress()
  const stats = usePipelineStatsValue()
  const setStats = useSetPipelineStats()

  return {
    status,
    setStatus,
    error,
    setError,
    progress,
    setProgress,
    stats,
    setStats,
  }
}
