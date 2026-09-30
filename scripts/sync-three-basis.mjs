import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis')
const destination = path.join(root, 'apps', 'configurator', 'public', 'basis')

await mkdir(destination, { recursive: true })

for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  await copyFile(path.join(source, file), path.join(destination, file))
}

process.stdout.write('Synced local Three.js Basis/KTX2 transcoder assets.\n')
