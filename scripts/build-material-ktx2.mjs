#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const CHANNELS = new Set(['baseColor', 'normal', 'roughness', 'ambientOcclusion'])

function parseArgs(argv) {
  const result = { dryRun: false, selfTest: false, manifest: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--dry-run') result.dryRun = true
    else if (value === '--self-test') result.selfTest = true
    else if (value === '--manifest') result.manifest = argv[++index] ?? ''
    else throw new Error(`Unknown argument: ${value}`)
  }
  return result
}

function profileFor(channel) {
  if (channel === 'baseColor') {
    return {
      codec: 'basis-lz',
      format: 'R8G8B8A8_SRGB',
      transfer: 'srgb',
      normalize: false,
      description: 'ETC1S/BasisLZ sRGB color',
    }
  }

  return {
    codec: 'uastc-ldr-4x4',
    format: 'R8G8B8A8_UNORM',
    transfer: 'linear',
    normalize: channel === 'normal',
    description: channel === 'normal' ? 'UASTC normalized tangent-space data' : 'UASTC linear data',
  }
}

function buildCreateArgs(job) {
  const profile = profileFor(job.channel)
  const args = [
    'create',
    '--encode', profile.codec,
    '--format', profile.format,
    '--assign-tf', profile.transfer,
    '--assign-primaries', 'bt709',
    '--generate-mipmap',
  ]
  if (profile.normalize) args.push('--normalize')
  args.push(job.input, job.output)
  return args
}

function buildValidateArgs(job) {
  return ['validate', '--gltf-basisu', job.output]
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('KTX2 build manifest schemaVersion must be 1.')
  if (!String(manifest.materialId ?? '').trim()) throw new Error('KTX2 build manifest materialId is required.')
  if (!Array.isArray(manifest.jobs) || manifest.jobs.length === 0) throw new Error('KTX2 build manifest requires at least one job.')

  const outputs = new Set()
  for (const [index, job] of manifest.jobs.entries()) {
    if (!CHANNELS.has(job.channel)) throw new Error(`jobs[${index}].channel is unsupported.`)
    if (!String(job.input ?? '').trim()) throw new Error(`jobs[${index}].input is required.`)
    if (!String(job.output ?? '').trim() || !String(job.output).toLowerCase().endsWith('.ktx2')) {
      throw new Error(`jobs[${index}].output must be a .ktx2 path.`)
    }
    if (outputs.has(job.output)) throw new Error(`Duplicate KTX2 output path: ${job.output}`)
    outputs.add(job.output)
  }
}

function printable(command, args) {
  const quote = (value) => /[\s"]/u.test(value) ? JSON.stringify(value) : value
  return [command, ...args].map(quote).join(' ')
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}.`)
}

async function sha256(file) {
  const bytes = await readFile(file)
  return createHash('sha256').update(bytes).digest('hex')
}

async function executeManifest(manifestPath, dryRun) {
  const absoluteManifest = path.resolve(manifestPath)
  const manifestRoot = path.dirname(absoluteManifest)
  const manifest = JSON.parse(await readFile(absoluteManifest, 'utf8'))
  validateManifest(manifest)

  const jobs = manifest.jobs.map((job) => ({
    ...job,
    input: path.resolve(manifestRoot, job.input),
    output: path.resolve(manifestRoot, job.output),
  }))

  if (dryRun) {
    for (const job of jobs) {
      process.stdout.write(`[${job.channel}] ${printable('ktx', buildCreateArgs(job))}\n`)
      process.stdout.write(`[validate] ${printable('ktx', buildValidateArgs(job))}\n`)
    }
    return
  }

  const probe = spawnSync('ktx', ['--version'], { encoding: 'utf8', shell: false })
  if (probe.error || probe.status !== 0) {
    throw new Error('Khronos KTX command-line tools are required. Install KTX-Software and ensure "ktx" is on PATH.')
  }

  const report = {
    schemaVersion: 1,
    materialId: manifest.materialId,
    generatedAt: new Date().toISOString(),
    toolVersion: String(probe.stdout || probe.stderr || '').trim(),
    outputs: [],
  }

  for (const job of jobs) {
    await stat(job.input)
    await mkdir(path.dirname(job.output), { recursive: true })
    process.stdout.write(`\nBuilding ${job.channel}: ${job.output}\n`)
    run('ktx', buildCreateArgs(job))
    run('ktx', buildValidateArgs(job))
    const fileStat = await stat(job.output)
    report.outputs.push({
      channel: job.channel,
      output: job.output,
      bytes: fileStat.size,
      sha256: await sha256(job.output),
      profile: profileFor(job.channel).description,
    })
  }

  const reportPath = path.resolve(manifestRoot, manifest.report ?? `${manifest.materialId}.ktx2-build.json`)
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(`\nValidated KTX2 build report: ${reportPath}\n`)
}

function selfTest() {
  const sample = {
    schemaVersion: 1,
    materialId: 'SCL-SELFTEST',
    jobs: [
      { channel: 'baseColor', input: 'base.png', output: 'base.ktx2' },
      { channel: 'normal', input: 'normal.png', output: 'normal.ktx2' },
      { channel: 'roughness', input: 'roughness.png', output: 'roughness.ktx2' },
    ],
  }
  validateManifest(sample)

  const color = buildCreateArgs(sample.jobs[0])
  const normal = buildCreateArgs(sample.jobs[1])
  const roughness = buildCreateArgs(sample.jobs[2])

  if (!color.includes('basis-lz') || !color.includes('R8G8B8A8_SRGB')) throw new Error('Base-color profile self-test failed.')
  if (!normal.includes('uastc-ldr-4x4') || !normal.includes('--normalize')) throw new Error('Normal profile self-test failed.')
  if (!roughness.includes('uastc-ldr-4x4') || roughness.includes('--normalize')) throw new Error('Roughness profile self-test failed.')
  if (buildValidateArgs(sample.jobs[0]).join(' ') !== 'validate --gltf-basisu base.ktx2') throw new Error('Validation command self-test failed.')

  process.stdout.write('KTX2 material builder self-test passed.\n')
}

const args = parseArgs(process.argv.slice(2))
if (args.selfTest) {
  selfTest()
} else if (args.manifest) {
  await executeManifest(args.manifest, args.dryRun)
} else {
  process.stderr.write('Usage: node scripts/build-material-ktx2.mjs --manifest <file.json> [--dry-run]\n')
  process.stderr.write('       node scripts/build-material-ktx2.mjs --self-test\n')
  process.exitCode = 2
}
