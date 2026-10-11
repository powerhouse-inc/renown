// P-256 app keys as did:key (multicodec 0x1200, compressed point, base58btc),
// verified with WebCrypto. Renown app keys sign document operations and bearer
// tokens with these. Pure apart from crypto.subtle; runs in the browser and in
// Node (the e2e worker).

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
/** varint(0x1200): the p256-pub multicodec prefix. */
const P256_PREFIX = [0x80, 0x24]

// Curve parameters of P-256 (secp256r1).
const P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff')
const B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b')

export class DidKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DidKeyError'
  }
}

/** base58btc to bytes; null on a character outside the alphabet. */
export function base58Decode(input: string): Uint8Array | null {
  let value = BigInt(0)
  for (const char of input) {
    const digit = BASE58.indexOf(char)
    if (digit < 0) return null
    value = value * BigInt(58) + BigInt(digit)
  }
  const bytes: number[] = []
  while (value > BigInt(0)) {
    bytes.unshift(Number(value % BigInt(256)))
    value /= BigInt(256)
  }
  for (const char of input) {
    if (char !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = BigInt(1)
  let b = base % modulus
  let e = exponent
  while (e > BigInt(0)) {
    if (e & BigInt(1)) result = (result * b) % modulus
    b = (b * b) % modulus
    e >>= BigInt(1)
  }
  return result
}

function toBytes32(value: bigint): Uint8Array {
  const out = new Uint8Array(32)
  let v = value
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & BigInt(255))
    v >>= BigInt(8)
  }
  return out
}

/** The uncompressed point (0x04 || x || y) of a compressed P-256 point. */
function decompress(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33 || (compressed[0] !== 2 && compressed[0] !== 3)) {
    throw new DidKeyError('not a compressed P-256 point')
  }
  let x = BigInt(0)
  for (const byte of compressed.subarray(1)) x = (x << BigInt(8)) | BigInt(byte)
  if (x >= P) throw new DidKeyError('not a point on P-256')
  // y^2 = x^3 - 3x + b; p = 3 (mod 4), so y = rhs^((p+1)/4).
  const rhs = (((x * x * x - BigInt(3) * x + B) % P) + P) % P
  let y = modPow(rhs, (P + BigInt(1)) / BigInt(4), P)
  if ((y * y) % P !== rhs) throw new DidKeyError('not a point on P-256')
  if ((y & BigInt(1)) !== BigInt(compressed[0] & 1)) y = P - y
  const out = new Uint8Array(65)
  out[0] = 4
  out.set(toBytes32(x), 1)
  out.set(toBytes32(y), 33)
  return out
}

/** True for `did:key:z…` with a P-256 public key (Renown app keys). */
export function isP256DidKey(did: string): boolean {
  try {
    p256PublicKey(did)
    return true
  } catch {
    return false
  }
}

/**
 * The raw uncompressed public key of a P-256 did:key.
 * @throws {DidKeyError} for any other DID or a malformed key.
 */
export function p256PublicKey(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) throw new DidKeyError('not a base58btc did:key')
  const decoded = base58Decode(did.slice('did:key:z'.length))
  if (!decoded || decoded.length !== 35) throw new DidKeyError('not a compressed P-256 key')
  if (decoded[0] !== P256_PREFIX[0] || decoded[1] !== P256_PREFIX[1]) throw new DidKeyError('not a P-256 key')
  return decompress(decoded.subarray(2))
}

/**
 * Whether `signature` (64 bytes, r || s) is the key's ECDSA P-256 / SHA-256
 * signature of `message`. False on any malformed input.
 */
export async function verifyP256(did: string, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  try {
    if (signature.length !== 64) return false
    const key = await crypto.subtle.importKey(
      'raw',
      p256PublicKey(did) as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature as BufferSource,
      message as BufferSource,
    )
  } catch {
    return false
  }
}

export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) return null
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  try {
    const binary = atob(padded)
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}
