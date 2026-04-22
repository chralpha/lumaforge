export function UnsupportedState({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-2xl font-semibold text-text">
        This browser is not supported
      </h2>
      <p className="max-w-xl text-sm text-text-secondary">{reason}</p>
      <p className="max-w-xl text-sm text-text-tertiary">
        Use the latest desktop Chrome, Edge, or Safari with WebGL2 enabled.
      </p>
    </div>
  )
}
