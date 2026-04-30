type RuntimeConsole = {
  warn?: (...data: unknown[]) => void
}

export function warn(message: string) {
  const runtimeConsole = (globalThis as { console?: RuntimeConsole }).console
  runtimeConsole?.warn?.(message)
}
