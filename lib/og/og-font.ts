// Font bytes for the link-preview route (pages/api/og.tsx, Node runtime). The
// fonts ship with the server: next.config.ts traces assets/fonts into the
// standalone output for /api/og.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const FONT_DIR = join(process.cwd(), 'assets', 'fonts')

/** The font file `name` from `dir`; rejects when it cannot be read. */
export async function readFont(name: string, dir = FONT_DIR): Promise<ArrayBuffer> {
  const bytes = await readFile(join(dir, name))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
