/**
 * Type declarations for libraw-wasm package.
 * Based on the actual libraw-wasm 1.1.2 API.
 */

declare module 'libraw-wasm' {
  export interface LibRawMetadata {
    make?: string
    model?: string
    lens?: string
    iso_speed?: number
    shutter?: number
    aperture?: number
    focal_len?: number
    timestamp?: Date
    desc?: string
    thumb_format?: string
  }

  export interface LibRawImageData {
    data: Uint8Array | Uint16Array
    width: number
    height: number
    bits: number
    colors: number
    flip?: number
  }

  export interface LibRawOpenOptions {
    halfSize?: boolean
    useCameraWb?: boolean
    outputColor?: number
    outputBps?: 8 | 16
    noAutoBright?: boolean
  }

  export default class LibRaw {
    constructor()

    /**
     * Open a RAW file from binary data.
     * @param data - The raw file data as Uint8Array
     * @param options - Optional libraw processing settings
     */
    open(data: Uint8Array, options?: LibRawOpenOptions): Promise<void>

    /**
     * Get image metadata.
     * @param detailed - Whether to get detailed metadata
     */
    metadata(detailed?: boolean): Promise<LibRawMetadata>

    /**
     * Get processed image data.
     */
    imageData(): Promise<LibRawImageData>
  }
}
