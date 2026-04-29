import type { ComponentProps } from 'react'
import { useId, useState } from 'react'

import type { LUTColorProfile } from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'

import type { LUTProfileSelectionState } from '../model/session'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { FinishTool } from './tools/FinishTool'
import { LutContractTool } from './tools/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import { ToolSection } from './tools/ToolSection'

export function RawToolSurface(props: {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  activeIntensity: StrengthLevel
  onPresetSelect: (id: string) => void
  onIntensitySelect: (level: StrengthLevel) => void
  onCompareReset: () => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  canExport: boolean
  disabledReason: string
  isProcessing: boolean
  hasImage: boolean
  currentLutName?: string | null
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
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
          disabled={disabled}
          onLutLoad={props.onLutLoad}
          onLutClear={props.onLutClear}
          lutProfileSelection={props.lutProfileSelection}
          lutProfileResolution={props.lutProfileResolution}
          onLutProfileSelect={props.onLutProfileSelect}
        />
        <ExportTool
          canExport={props.canExport}
          disabledReason={props.disabledReason}
          isProcessing={props.isProcessing}
          onExport={props.onExport}
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
