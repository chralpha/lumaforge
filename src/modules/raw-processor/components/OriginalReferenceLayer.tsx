import type { OriginalReferenceSnapshot } from '../services/compare/original-reference-snapshot'

export function OriginalReferenceLayer({
  snapshot,
}: {
  snapshot: OriginalReferenceSnapshot
}) {
  return (
    <div
      className="raw-preview-original-layer"
      aria-hidden="true"
      data-original-reference-source={snapshot.source}
    >
      <img
        src={snapshot.objectUrl}
        width={snapshot.width}
        height={snapshot.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="raw-preview-original-image"
        decoding="async"
      />
    </div>
  )
}
