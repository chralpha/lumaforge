/**
 * Controls panel for RAW processing parameters.
 */

import { m } from 'motion/react'
import { useCallback } from 'react'

import { Button } from '~/components/ui/button'
import { Divider } from '~/components/ui/divider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Slider } from '~/components/ui/slider'
import { clsxm } from '~/lib/cn'
import { LOG_SPACES } from '~/lib/color/constants'
import type { ProcessingParams } from '~/lib/gl/pipeline'
import { Spring } from '~/lib/spring'

import { LutDropzone } from './Dropzone'

export interface ControlsPanelProps {
  params: ProcessingParams
  onParamsChange: (params: Partial<ProcessingParams>) => void
  lutName?: string | null
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onExport: (format: 'tiff' | 'jpeg') => void
  canExport: boolean
  isProcessing: boolean
  className?: string
}

export function ControlsPanel({
  params,
  onParamsChange,
  lutName,
  onLutLoad,
  onLutClear,
  onExport,
  canExport,
  isProcessing,
  className,
}: ControlsPanelProps) {
  const handleExposureChange = useCallback(
    (value: number[]) => {
      onParamsChange({ exposure: value[0] })
    },
    [onParamsChange],
  )

  const handleSaturationChange = useCallback(
    (value: number[]) => {
      onParamsChange({ saturation: value[0] })
    },
    [onParamsChange],
  )

  const handleContrastChange = useCallback(
    (value: number[]) => {
      onParamsChange({ contrast: value[0] })
    },
    [onParamsChange],
  )

  const handleLogSpaceChange = useCallback(
    (value: string) => {
      onParamsChange({ logSpace: value })
    },
    [onParamsChange],
  )

  const handleReset = useCallback(() => {
    onParamsChange({
      exposure: 0,
      saturation: 1.25,
      contrast: 1.1,
    })
  }, [onParamsChange])

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
      {/* Log Space Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text">Log Space</label>
        <Select value={params.logSpace} onValueChange={handleLogSpaceChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select log space" />
          </SelectTrigger>
          <SelectContent>
            {LOG_SPACES.map((space) => (
              <SelectItem key={space} value={space}>
                {space}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-text-tertiary">
          Target color space for grading
        </p>
      </div>

      <Divider />

      {/* Exposure */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text">Exposure</label>
          <span className="text-sm text-text-secondary tabular-nums">
            <span>{params.exposure > 0 ? '+' : ''}</span>
            <span>{params.exposure.toFixed(2)} EV</span>
          </span>
        </div>
        <Slider
          value={[params.exposure]}
          onValueChange={handleExposureChange}
          min={-5}
          max={5}
          step={0.05}
        />
      </div>

      {/* Saturation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text">Saturation</label>
          <span className="text-sm text-text-secondary tabular-nums">
            {(params.saturation * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[params.saturation]}
          onValueChange={handleSaturationChange}
          min={0}
          max={2}
          step={0.05}
        />
      </div>

      {/* Contrast */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text">Contrast</label>
          <span className="text-sm text-text-secondary tabular-nums">
            {(params.contrast * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[params.contrast]}
          onValueChange={handleContrastChange}
          min={0.5}
          max={2}
          step={0.05}
        />
      </div>

      <button
        type="button"
        onClick={handleReset}
        className="text-xs text-text-tertiary hover:text-text transition-colors text-left"
      >
        Reset adjustments
      </button>

      <Divider />

      {/* LUT Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text">3D LUT</label>
        <LutDropzone
          onFileDrop={onLutLoad}
          currentLut={lutName}
          onClear={onLutClear}
          disabled={isProcessing}
        />
      </div>

      <Divider />

      {/* Export Buttons */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-text">Export</label>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onExport('tiff')}
            disabled={!canExport || isProcessing}
            className="flex-1"
          >
            <i className="i-mingcute-file-download-line mr-2" />
            TIFF 16-bit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onExport('jpeg')}
            disabled={!canExport || isProcessing}
            className="flex-1"
          >
            <i className="i-mingcute-pic-line mr-2" />
            JPEG
          </Button>
        </div>
        <p className="text-xs text-text-tertiary">
          TIFF exports full 16-bit precision
        </p>
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
