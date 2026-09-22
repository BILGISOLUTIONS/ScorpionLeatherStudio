import {
  averageRgb,
  deriveBaseColor,
  deriveNormalMap,
  deriveRoughnessMap,
  rgbToHex,
  type BaseColorOptions,
  type NormalOptions,
  type PixelImage,
  type RoughnessOptions,
} from '@sls/material-processor'

interface ProcessRequest {
  type: 'process'
  jobId: string
  frames: {
    crossPolarized: PixelImage
    parallel: PixelImage
    north: PixelImage
    east: PixelImage
    south: PixelImage
    west: PixelImage
  }
  options: {
    baseColor: BaseColorOptions
    normal: NormalOptions
    roughness: RoughnessOptions
  }
}

self.onmessage = (event: MessageEvent<ProcessRequest>) => {
  const message = event.data
  if (message.type !== 'process') return

  try {
    const baseColor = deriveBaseColor(message.frames.crossPolarized, message.options.baseColor)
    const roughness = deriveRoughnessMap(
      message.frames.crossPolarized,
      message.frames.parallel,
      message.options.roughness,
    )
    const normal = deriveNormalMap(
      message.frames.north,
      message.frames.east,
      message.frames.south,
      message.frames.west,
      message.options.normal,
    )

    const previewColor = rgbToHex(averageRgb(baseColor))

    self.postMessage(
      {
        type: 'complete',
        jobId: message.jobId,
        maps: { baseColor, roughness, normal },
        previewColor,
      },
      {
        transfer: [
          baseColor.data.buffer as ArrayBuffer,
          roughness.data.buffer as ArrayBuffer,
          normal.data.buffer as ArrayBuffer,
        ],
      },
    )
  } catch (error) {
    self.postMessage({
      type: 'error',
      jobId: message.jobId,
      message: error instanceof Error ? error.message : 'Material processing failed.',
    })
  }
}
