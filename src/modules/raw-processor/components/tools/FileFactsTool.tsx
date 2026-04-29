import { ToolSection } from './ToolSection'

export function FileFactsTool({
  supportLevel,
  metadata,
  stats,
}: {
  supportLevel: 'official' | 'experimental'
  metadata: null | {
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
  stats: null | {
    processTime: number
    inputSize: { width: number; height: number }
    previewSize: { width: number; height: number }
  }
}) {
  const hasSessionFacts = metadata !== null || stats !== null
  const facts = [
    { label: 'Support', value: hasSessionFacts ? supportLevel : undefined },
    {
      label: 'Camera',
      value:
        metadata && `${metadata.make || ''} ${metadata.model || ''}`.trim(),
    },
    {
      label: 'Size',
      value: metadata ? `${metadata.width} x ${metadata.height}` : undefined,
    },
    {
      label: 'Preview',
      value: stats
        ? `${stats.previewSize.width} x ${stats.previewSize.height}`
        : undefined,
    },
    {
      label: 'Render',
      value: stats ? `${Math.round(stats.processTime)} ms` : undefined,
    },
  ]

  return (
    <ToolSection title="File facts">
      <dl className="raw-file-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value || 'Not loaded'}</dd>
          </div>
        ))}
      </dl>
    </ToolSection>
  )
}
