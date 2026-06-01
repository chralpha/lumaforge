import {
  useLutValue,
  useProcessingParamsValue,
  useSetLut,
  useSetProcessingParams,
} from '../state/workflow.atoms'

export function useRawDetachedWorkflowState() {
  const baseParams = useProcessingParamsValue()
  const setParams = useSetProcessingParams()
  const lut = useLutValue()
  const setLut = useSetLut()

  return { baseParams, setParams, lut, setLut }
}
