import * as fs from 'fs'
import { path7za } from '7zip-bin'

export function get7zBinaryPath(): string {
  let bin = path7za

  if (bin.includes('app.asar')) {
    bin = bin.replace('app.asar', 'app.asar.unpacked')
  }

  if (!fs.existsSync(bin)) {
    throw new Error(`7z binary not found at ${bin}`)
  }

  return bin
}