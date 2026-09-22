export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface NormalOptions {
  strength: number
}

export interface RoughnessOptions {
  baseRoughness: number
  responseGain: number
  minRoughness: number
  maxRoughness: number
}

export interface BaseColorOptions {
  exposure: number
  redGain: number
  greenGain: number
  blueGain: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function assertMatching(images: PixelImage[]) {
  if (!images.length) throw new Error('At least one image is required.')
  const { width, height } = images[0]
  for (const image of images) {
    if (image.width !== width || image.height !== height) {
      throw new Error('All processing frames must have matching dimensions.')
    }
    if (image.data.length !== width * height * 4) {
      throw new Error('Image data length does not match image dimensions.')
    }
  }
}

export function luminance8(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function meanLuminance(image: PixelImage): number {
  assertMatching([image])
  let sum = 0
  let samples = 0
  const stride = Math.max(1, Math.floor(Math.sqrt((image.width * image.height) / 65536)))

  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const index = (y * image.width + x) * 4
      sum += luminance8(image.data[index], image.data[index + 1], image.data[index + 2])
      samples += 1
    }
  }

  return samples ? sum / samples : 0
}

export function deriveBaseColor(
  source: PixelImage,
  options: BaseColorOptions = { exposure: 1, redGain: 1, greenGain: 1, blueGain: 1 },
): PixelImage {
  assertMatching([source])
  const output = new Uint8ClampedArray(source.data.length)

  for (let index = 0; index < source.data.length; index += 4) {
    output[index] = source.data[index] * options.exposure * options.redGain
    output[index + 1] = source.data[index + 1] * options.exposure * options.greenGain
    output[index + 2] = source.data[index + 2] * options.exposure * options.blueGain
    output[index + 3] = 255
  }

  return { width: source.width, height: source.height, data: output }
}

export function deriveNormalMap(
  north: PixelImage,
  east: PixelImage,
  south: PixelImage,
  west: PixelImage,
  options: NormalOptions = { strength: 2.2 },
): PixelImage {
  assertMatching([north, east, south, west])

  const images = [north, east, south, west]
  const means = images.map((image) => Math.max(1, meanLuminance(image)))
  const targetMean = means.reduce((sum, value) => sum + value, 0) / means.length
  const scales = means.map((mean) => targetMean / mean)
  const output = new Uint8ClampedArray(north.data.length)

  for (let index = 0; index < north.data.length; index += 4) {
    const n = luminance8(north.data[index], north.data[index + 1], north.data[index + 2]) * scales[0] / 255
    const e = luminance8(east.data[index], east.data[index + 1], east.data[index + 2]) * scales[1] / 255
    const s = luminance8(south.data[index], south.data[index + 1], south.data[index + 2]) * scales[2] / 255
    const w = luminance8(west.data[index], west.data[index + 1], west.data[index + 2]) * scales[3] / 255

    const dx = (w - e) * options.strength
    const dy = (s - n) * options.strength
    const dz = 1

    const length = Math.hypot(dx, dy, dz) || 1
    const nx = dx / length
    const ny = dy / length
    const nz = dz / length

    output[index] = Math.round((nx * 0.5 + 0.5) * 255)
    output[index + 1] = Math.round((ny * 0.5 + 0.5) * 255)
    output[index + 2] = Math.round((nz * 0.5 + 0.5) * 255)
    output[index + 3] = 255
  }

  return { width: north.width, height: north.height, data: output }
}

export function deriveRoughnessMap(
  crossPolarized: PixelImage,
  parallel: PixelImage,
  options: RoughnessOptions = {
    baseRoughness: 0.78,
    responseGain: 1.35,
    minRoughness: 0.28,
    maxRoughness: 0.96,
  },
): PixelImage {
  assertMatching([crossPolarized, parallel])

  const output = new Uint8ClampedArray(crossPolarized.data.length)

  for (let index = 0; index < crossPolarized.data.length; index += 4) {
    const diffuse = luminance8(
      crossPolarized.data[index],
      crossPolarized.data[index + 1],
      crossPolarized.data[index + 2],
    ) / 255

    const reflected = luminance8(
      parallel.data[index],
      parallel.data[index + 1],
      parallel.data[index + 2],
    ) / 255

    const response = Math.max(0, reflected - diffuse)
    const roughness = Math.max(
      options.minRoughness,
      Math.min(options.maxRoughness, options.baseRoughness - response * options.responseGain),
    )
    const value = Math.round(clamp01(roughness) * 255)

    output[index] = value
    output[index + 1] = value
    output[index + 2] = value
    output[index + 3] = 255
  }

  return { width: crossPolarized.width, height: crossPolarized.height, data: output }
}

export function averageRgb(image: PixelImage): [number, number, number] {
  assertMatching([image])
  let red = 0
  let green = 0
  let blue = 0
  let samples = 0
  const stride = Math.max(1, Math.floor(Math.sqrt((image.width * image.height) / 65536)))

  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const index = (y * image.width + x) * 4
      red += image.data[index]
      green += image.data[index + 1]
      blue += image.data[index + 2]
      samples += 1
    }
  }

  return [
    Math.round(red / Math.max(1, samples)),
    Math.round(green / Math.max(1, samples)),
    Math.round(blue / Math.max(1, samples)),
  ]
}

export function rgbToHex([red, green, blue]: [number, number, number]): string {
  return '#' + [red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
