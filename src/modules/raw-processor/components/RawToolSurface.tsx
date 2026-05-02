import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import type { ComponentProps } from 'react'
import { useId, useState } from 'react'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  ExportRecoveryState,
  LUTProfileSelectionState,
} from '../model/session'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { FinishTool } from './tools/FinishTool'
import { HistogramTool } from './tools/HistogramTool'
import { LutContractTool } from './tools/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToneTool } from './tools/ToneTool'
import { ToolSection } from './tools/ToolSection'

export function RawToolSurface(props: {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  activeIntensity: StrengthLevel
  tone: ToneValue
  onPresetSelect: (id: string) => void
  onIntensitySelect: (level: StrengthLevel) => void
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
  onCompareReset: () => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  histogram: PreviewHistogramState
  recovery?: ExportRecoveryState
  onShareExport: () => void
  onDownloadExport: () => void
  onCopyExport: () => void
  onRecoverExportSource?: () => void
  hasImage: boolean
  currentLutName?: string | null
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onlineLutSources?: UseOnlineLutSourcesResult
  supportLevel: 'official' | 'experimental'
  metadata: ComponentProps<typeof FileFactsTool>['metadata']
  stats: ComponentProps<typeof FileFactsTool>['stats']
}) {
  const [open, setOpen] = useState(false)
  const toolStackId = useId()
  const disabled = !props.hasImage || props.isProcessing

  return (
    <aside
      className="raw-tool-surface"
      data-raw-tool-surface="raw-finishing"
      data-raw-tool-sheet={open ? 'open' : 'closed'}
      aria-label="RAW finishing controls"
    >
      <button
        type="button"
        className="raw-tool-sheet-toggle"
        aria-expanded={open}
        aria-controls={toolStackId}
        onClick={() => setOpen((value) => !value)}
      >
        RAW tools
      </button>

      <div id={toolStackId} className="raw-tool-stack">
        <FinishTool
          presetOptions={props.presetOptions}
          activePresetId={props.activePresetId}
          disabled={disabled}
          onPresetSelect={props.onPresetSelect}
        />
        <ToneTool
          value={props.tone}
          disabled={disabled}
          onChange={props.onToneChange}
          onReset={props.onToneReset}
        />
        <HistogramTool histogram={props.histogram} />
        <ToolSection title="Strength">
          <StrengthControl
            value={props.activeIntensity}
            onChange={props.onIntensitySelect}
            disabled={disabled}
          />
        </ToolSection>
        <CompareTool
          disabled={disabled}
          onCompareReset={props.onCompareReset}
        />
        <LutContractTool
          currentLutName={props.currentLutName}
          disabled={props.isProcessing}
          onLutLoad={props.onLutLoad}
          onLutClear={props.onLutClear}
          lutProfileSelection={props.lutProfileSelection}
          lutProfileResolution={props.lutProfileResolution}
          onLutProfileSelect={props.onLutProfileSelect}
          onlineLutSources={props.onlineLutSources}
        />
        <ExportTool
          canExport={props.canExport}
          disabledReason={props.disabledReason}
          isProcessing={props.isProcessing}
          onExport={props.onExport}
          exportResult={props.exportResult}
          exportShareCapability={props.exportShareCapability}
          recovery={props.recovery}
          onShareExport={props.onShareExport}
          onDownloadExport={props.onDownloadExport}
          onCopyExport={props.onCopyExport}
          onRecoverExportSource={props.onRecoverExportSource}
        />
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </div>
    </aside>
  )
}
