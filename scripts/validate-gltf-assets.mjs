import fs from 'node:fs'
import path from 'node:path'

const modelRoot = path.resolve('apps/configurator/public/models')
const componentBytes = new Map([[5120,1],[5121,1],[5122,2],[5123,2],[5125,4],[5126,4]])
const typeComponents = new Map([
  ['SCALAR',1],['VEC2',2],['VEC3',3],['VEC4',4],['MAT2',4],['MAT3',9],['MAT4',16],
])

function fail(file, message) {
  throw new Error(`${path.relative(process.cwd(), file)}: ${message}`)
}

function dataUriBytes(file, buffer, index) {
  if (typeof buffer.uri !== 'string' || !buffer.uri.startsWith('data:')) {
    fail(file, `buffer[${index}] must use an embedded data URI for this validator`)
  }
  const marker = ';base64,'
  const offset = buffer.uri.indexOf(marker)
  if (offset < 0) fail(file, `buffer[${index}] data URI must be base64 encoded`)
  return Buffer.from(buffer.uri.slice(offset + marker.length), 'base64')
}

function validateFile(file) {
  const gltf = JSON.parse(fs.readFileSync(file, 'utf8'))
  const decoded = (gltf.buffers ?? []).map((buffer, index) => {
    const bytes = dataUriBytes(file, buffer, index)
    if (bytes.byteLength !== buffer.byteLength) {
      fail(file, `buffer[${index}] declares ${buffer.byteLength} bytes but embeds ${bytes.byteLength}`)
    }
    return bytes
  })

  for (const [index, view] of (gltf.bufferViews ?? []).entries()) {
    const bytes = decoded[view.buffer]
    if (!bytes) fail(file, `bufferView[${index}] references missing buffer ${view.buffer}`)
    const start = view.byteOffset ?? 0
    const end = start + view.byteLength
    if (start < 0 || view.byteLength < 0 || end > bytes.byteLength) {
      fail(file, `bufferView[${index}] range ${start}..${end} exceeds buffer length ${bytes.byteLength}`)
    }
  }

  for (const [index, accessor] of (gltf.accessors ?? []).entries()) {
    const view = gltf.bufferViews?.[accessor.bufferView]
    if (!view) fail(file, `accessor[${index}] references missing bufferView ${accessor.bufferView}`)
    const bytesPerComponent = componentBytes.get(accessor.componentType)
    const components = typeComponents.get(accessor.type)
    if (!bytesPerComponent || !components) {
      fail(file, `accessor[${index}] uses unsupported component/type combination`)
    }
    const elementBytes = bytesPerComponent * components
    const stride = view.byteStride ?? elementBytes
    if (stride < elementBytes) fail(file, `accessor[${index}] byteStride is smaller than one element`)
    const offset = accessor.byteOffset ?? 0
    const required = accessor.count === 0 ? offset : offset + (accessor.count - 1) * stride + elementBytes
    if (required > view.byteLength) {
      fail(file, `accessor[${index}] requires ${required} bytes inside bufferView[${accessor.bufferView}] but only ${view.byteLength} are available`)
    }
  }

  return path.relative(process.cwd(), file)
}

const files = fs.readdirSync(modelRoot)
  .filter((name) => name.endsWith('.gltf'))
  .sort()
  .map((name) => path.join(modelRoot, name))

if (!files.length) throw new Error('No glTF assets found to validate.')
const validated = files.map(validateFile)
console.log(`Validated ${validated.length} embedded glTF asset(s):\n- ${validated.join('\n- ')}`)
