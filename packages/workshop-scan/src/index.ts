const QR_SIZE = 33
const DATA_CODEWORDS = 80
const ECC_CODEWORDS = 20
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

export interface WorkshopScanRef {
  requestId: string
  revisionId: string
  payload: string
}

export function parseWorkshopScanPayload(value: string): WorkshopScanRef {
  const payload = String(value || '').trim().toUpperCase()
  const match = /^SLS:WORKSHOP:1:([A-Z0-9_-]{3,96}):(REV-[A-Z0-9_-]{3,96})$/u.exec(payload)
  if (!match) throw new Error('INVALID_WORKSHOP_SCAN_PAYLOAD')
  return { requestId: match[1], revisionId: match[2], payload }
}

function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    if (((y >>> i) & 1) !== 0) z ^= x
  }
  return z & 0xff
}

function rsGenerator(degree: number): number[] {
  const result = new Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], degree: number): number[] {
  const divisor = rsGenerator(degree)
  const result = new Array(degree).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor)
    }
  }
  return result
}

function appendBits(target: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) target.push((value >>> i) & 1)
}

function encodeAlphanumeric(payload: string): number[] {
  if (payload.length > 114) throw new Error('WORKSHOP_SCAN_PAYLOAD_TOO_LONG')
  for (const char of payload) {
    if (!ALPHANUMERIC.includes(char)) throw new Error('WORKSHOP_SCAN_PAYLOAD_NOT_QR_ALPHANUMERIC')
  }

  const bits: number[] = []
  appendBits(bits, 0b0010, 4)
  appendBits(bits, payload.length, 9)

  for (let i = 0; i < payload.length; i += 2) {
    const a = ALPHANUMERIC.indexOf(payload[i])
    if (i + 1 < payload.length) {
      const b = ALPHANUMERIC.indexOf(payload[i + 1])
      appendBits(bits, a * 45 + b, 11)
    } else {
      appendBits(bits, a, 6)
    }
  }

  const capacityBits = DATA_CODEWORDS * 8
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j]
    data.push(value)
  }

  let pad = 0
  while (data.length < DATA_CODEWORDS) {
    data.push(pad % 2 === 0 ? 0xec : 0x11)
    pad += 1
  }
  return data
}

function setFunction(matrix: boolean[][], reserved: boolean[][], x: number, y: number, dark: boolean) {
  if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) return
  matrix[y][x] = dark
  reserved[y][x] = true
}

function drawFinder(matrix: boolean[][], reserved: boolean[][], x: number, y: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx
      const yy = y + dy
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
      const dark = inside && (
        dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
      )
      setFunction(matrix, reserved, xx, yy, dark)
    }
  }
}

function drawAlignment(matrix: boolean[][], reserved: boolean[][], cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy))
      setFunction(matrix, reserved, cx + dx, cy + dy, distance !== 1)
    }
  }
}

function drawFormat(matrix: boolean[][], reserved: boolean[][]) {
  const bits = 0x77c4 // Error correction L, mask 0
  const get = (i: number) => ((bits >>> i) & 1) !== 0

  for (let i = 0; i <= 5; i += 1) setFunction(matrix, reserved, 8, i, get(i))
  setFunction(matrix, reserved, 8, 7, get(6))
  setFunction(matrix, reserved, 8, 8, get(7))
  setFunction(matrix, reserved, 7, 8, get(8))
  for (let i = 9; i < 15; i += 1) setFunction(matrix, reserved, 14 - i, 8, get(i))

  for (let i = 0; i < 8; i += 1) setFunction(matrix, reserved, QR_SIZE - 1 - i, 8, get(i))
  for (let i = 8; i < 15; i += 1) setFunction(matrix, reserved, 8, QR_SIZE - 15 + i, get(i))
  setFunction(matrix, reserved, 8, QR_SIZE - 8, true)
}

export function encodeWorkshopQr(payloadInput: string): boolean[][] {
  const payload = parseWorkshopScanPayload(payloadInput).payload
  const data = encodeAlphanumeric(payload)
  const codewords = [...data, ...rsRemainder(data, ECC_CODEWORDS)]

  const matrix = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false))
  const reserved = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false))

  drawFinder(matrix, reserved, 0, 0)
  drawFinder(matrix, reserved, QR_SIZE - 7, 0)
  drawFinder(matrix, reserved, 0, QR_SIZE - 7)

  for (let i = 8; i < QR_SIZE - 8; i += 1) {
    setFunction(matrix, reserved, i, 6, i % 2 === 0)
    setFunction(matrix, reserved, 6, i, i % 2 === 0)
  }

  drawAlignment(matrix, reserved, 26, 26)
  drawFormat(matrix, reserved)

  const bits: number[] = []
  for (const codeword of codewords) appendBits(bits, codeword, 8)

  let bitIndex = 0
  let upward = true
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1
    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const y = upward ? QR_SIZE - 1 - vertical : vertical
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset
        if (reserved[y][x]) continue
        let dark = bitIndex < bits.length ? bits[bitIndex] === 1 : false
        bitIndex += 1
        if ((x + y) % 2 === 0) dark = !dark
        matrix[y][x] = dark
      }
    }
    upward = !upward
  }

  return matrix
}

export function workshopQrSvg(payload: string, scale = 4, quiet = 4): string {
  const matrix = encodeWorkshopQr(payload)
  const size = matrix.length
  const dimension = (size + quiet * 2) * scale
  const rects: string[] = []

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!matrix[y][x]) continue
      rects.push(`<rect x="${(x + quiet) * scale}" y="${(y + quiet) * scale}" width="${scale}" height="${scale}"/>`)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${dimension}" height="${dimension}" role="img" aria-label="Workshop QR code"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>`
}
