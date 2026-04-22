/**
 * Controls panel for style-first RAW editing.
 */

import { m } from 'motion/react'

import { Button } from '~/components/ui/button'
import { Divider } from '~/components/ui/divider'
import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

import { LutDropzone } from './Dropzone'
import { IntensityChips } from './IntensityChips'

export interface ControlsPanelProps {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: 'processed' | 'original'
  onPresetSelect: (id: string) => void
  onIntensitySelect: (level: 'off' | 'light' | 'standard' | 'strong') => void
  onViewModeChange: (mode: 'processed' | 'original') => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  canExport: boolean
  isProcessing: boolean
  currentLutName?: string | null
  className?: string
}

export function ControlsPanel({
  presetOptions,
  activePresetId,
  activeIntensity,
  viewMode,
  onPresetSelect,
  onIntensitySelect,
  onViewModeChange,
  onLutLoad,
  onLutClear,
  onExport,
  canExport,
  isProcessing,
  currentLutName,
  className,
}: ControlsPanelProps) {
  return (
    <m.div
      className={clsxm(
        'flex flex-col gap-6 p-5 bg-material-medium rounded-xl border border-border',
        className,
      )}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={Spring.presets.smooth}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Builtin looks</label>
          <div className="grid grid-cols-2 gap-2">
            {presetOptions.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetSelect(preset.id)}
                className={
                  activePresetId === preset.id
                    ? 'rounded-xl border border-accent bg-accent/10 px-3 py-3 text-left text-sm text-text'
                    : 'rounded-xl border border-border bg-background px-3 py-3 text-left text-sm text-text-secondary'
                }
              >
                {preset.name}
              </button>
            ))}
          </div>
        </section>

        <Divider />

        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Intensity</label>
          <IntensityChips
            value={activeIntensity}
            onChange={onIntensitySelect}
          />
        </section>

        <Divider />

        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Compare</label>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'processed' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onViewModeChange('processed')}
            >
              Processed
            </Button>
            <Button
              variant={viewMode === 'original' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onViewModeChange('original')}
            >
              Original
            </Button>
          </div>
        </section>

        <Divider />

        <section className="space-y-2">
          <label className="text-sm font-medium text-text">Custom LUT</label>
          <LutDropzone
            onFileDrop={onLutLoad}
            currentLut={currentLutName}
            onClear={onLutClear}
            disabled={isProcessing}
          />
          <p className="text-xs text-text-tertiary">
            `.cube` LUTs run in a best effort path for Phase 1.
          </p>
        </section>

        <Divider />

        <section className="space-y-3">
          <label className="text-sm font-medium text-text">Export</label>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
            disabled={!canExport || isProcessing}
            className="w-full"
          >
            Export JPEG
          </Button>
          <p className="text-xs text-text-tertiary">
            Export stays locked until the HQ preview is ready.
          </p>
        </section>
      </div>
    </m.div>
  )
}

/**
 * Compact metadata display.
 */
export function MetadataPanel({
  metadata,
  className,
}: {
  metadata: {
    make?: string
    model?: string
    lens?: string
    iso?: number
    aperture?: number
    focalLength?: number
    shutterSpeed?: string
    width: number
    height: number
  }
  className?: string
}) {
  const items = [
    {
      label: 'Camera',
      value: `${metadata.make || ''} ${metadata.model || ''}`.trim(),
    },
    { label: 'Lens', value: metadata.lens },
    { label: 'ISO', value: metadata.iso },
    {
      label: 'Aperture',
      value: metadata.aperture ? `f/${metadata.aperture}` : undefined,
    },
    {
      label: 'Focal',
      value: metadata.focalLength ? `${metadata.focalLength}mm` : undefined,
    },
    { label: 'Shutter', value: metadata.shutterSpeed },
    { label: 'Size', value: `${metadata.width} × ${metadata.height}` },
  ].filter((item) => item.value)

  return (
    <m.div
      className={clsxm(
        'grid grid-cols-2 gap-x-4 gap-y-2 p-4 bg-fill/50 rounded-lg text-xs',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={Spring.presets.smooth}
    >
      {items.map((item) => (
        <div key={item.label} className="flex justify-between">
          <span className="text-text-tertiary">{item.label}</span>
          <span className="text-text-secondary font-medium">{item.value}</span>
        </div>
      ))}
    </m.div>
  )
}

/**
 * Processing stats display.
 */
export function StatsPanel({
  stats,
  className,
}: {
  stats: {
    processTime: number
    inputSize: { width: number; height: number }
    previewSize: { width: number; height: number }
  }
  className?: string
}) {
  return (
    <div
      className={clsxm(
        'flex items-center gap-4 text-xs text-text-tertiary',
        className,
      )}
    >
      <span>Process: {stats.processTime.toFixed(1)}ms</span>
      <span>
        Preview: {stats.previewSize.width}×{stats.previewSize.height}
      </span>
      <span>
        Full: {stats.inputSize.width}×{stats.inputSize.height}
      </span>
    </div>
  )
}
