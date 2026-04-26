export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function read(
  data: Float32Array,
  size: number,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const index = ((b * size + g) * size + r) * 3
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function sampleLutTrilinear(
  data: Float32Array,
  size: number,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const maxIndex = Math.max(0, size - 1)
  const x = clamp01(r) * maxIndex
  const y = clamp01(g) * maxIndex
  const z = clamp01(b) * maxIndex

  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const x1 = Math.min(maxIndex, x0 + 1)
  const y1 = Math.min(maxIndex, y0 + 1)
  const z1 = Math.min(maxIndex, z0 + 1)

  const tx = x - x0
  const ty = y - y0
  const tz = z - z0

  const c000 = read(data, size, x0, y0, z0)
  const c100 = read(data, size, x1, y0, z0)
  const c010 = read(data, size, x0, y1, z0)
  const c110 = read(data, size, x1, y1, z0)
  const c001 = read(data, size, x0, y0, z1)
  const c101 = read(data, size, x1, y0, z1)
  const c011 = read(data, size, x0, y1, z1)
  const c111 = read(data, size, x1, y1, z1)

  const output: [number, number, number] = [0, 0, 0]

  for (let channel = 0; channel < 3; channel += 1) {
    const c00 = mix(c000[channel], c100[channel], tx)
    const c10 = mix(c010[channel], c110[channel], tx)
    const c01 = mix(c001[channel], c101[channel], tx)
    const c11 = mix(c011[channel], c111[channel], tx)
    const c0 = mix(c00, c10, ty)
    const c1 = mix(c01, c11, ty)
    output[channel] = mix(c0, c1, tz)
  }

  return output
}
