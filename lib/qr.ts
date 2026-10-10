// QR codes for share menus, computed on the server (getServerSideProps): the
// encoder (uqr) never ships to the browser, only the resulting path does.
import { encode } from 'uqr'

export interface QrCode {
  /** Modules per side (no quiet zone). */
  size: number
  /** One SVG path drawing every dark module as a 1x1 square, origin at the top-left module. */
  path: string
}

/** The QR code of `text` (error correction M) as a single SVG path. */
export function qrCode(text: string): QrCode {
  const { size, data } = encode(text, { ecc: 'M', border: 0 })
  let path = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Runs of dark modules on a row become one rectangle (keeps the path short).
      if (!data[y][x] || (x > 0 && data[y][x - 1])) continue
      let run = 1
      while (x + run < size && data[y][x + run]) run++
      path += `M${x} ${y}h${run}v1h-${run}z`
    }
  }
  return { size, path }
}
