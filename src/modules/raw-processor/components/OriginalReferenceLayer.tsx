import type { OriginalReferenceSnapshot } from '../services/original-reference-snapshot'

export function OriginalReferenceLayer({
  snapshot,
}: {
  snapshot: OriginalReferenceSnapshot
}) {
  return (
    <div className="raw-preview-original-layer" aria-hidden="true">
      <img
        src={snapshot.objectUrl}
        width={snapshot.width}
        height={snapshot.height}
        alt=""
        role="img"
        aria-hidden="true"
        draggable={false}
        className="raw-preview-original-image"
        decoding="async"
      />
    </div>
  )
}
