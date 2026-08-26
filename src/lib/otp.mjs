import { base32Decode } from './base32.mjs'

// 全部计算都在本地完成，密钥不出设备，也不需要联网。
export const ALGORITHMS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }
export const DEFAULT_PERIOD = 30
export const DEFAULT_DIGITS = 6

// Steam 令牌用自己的字母表，位数固定 5 位。
const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY'
const STEAM_DIGITS = 5

// HOTP 的计数器是 8 字节大端整数。时间戳除以周期后可能超过 2^32，用 BigInt 才不会丢精度。
export function counterBytes(counter) {
  const bytes = new Uint8Array(8)
  let value = BigInt(counter)
  for (let index = 7; index >= 0 && value > 0n; index -= 1) {
    bytes[index] = Number(value & 0xffn)
    value >>= 8n
  }
  return bytes
}

// RFC 4226 动态截断：末字节低 4 位当偏移，从那里取 4 字节并抹掉符号位。
export function truncate(digest) {
  const offset = digest[digest.length - 1] & 0x0f
  return ((digest[offset] & 0x7f) * 2 ** 24)
    + (digest[offset + 1] * 2 ** 16)
    + (digest[offset + 2] * 2 ** 8)
    + digest[offset + 3]
}

async function hmac(algorithm, key, message) {
  const hash = ALGORITHMS[algorithm] || ALGORITHMS.SHA1
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, message))
}

export function normalizeDigits(digits) {
  const value = Number(digits)
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 4), 10) : DEFAULT_DIGITS
}

export function normalizePeriod(period) {
  const value = Number(period)
  return Number.isFinite(value) && value > 0 ? Math.min(Math.trunc(value), 3600) : DEFAULT_PERIOD
}

export async function generateOtp({ secret, algorithm = 'SHA1', digits = DEFAULT_DIGITS, counter = 0, encoding = 'standard' }) {
  const digest = await hmac(algorithm, base32Decode(secret), counterBytes(counter))
  const value = truncate(digest)
  if (encoding === 'steam') {
    let remaining = value
    let code = ''
    for (let index = 0; index < STEAM_DIGITS; index += 1) {
      code += STEAM_ALPHABET[remaining % STEAM_ALPHABET.length]
      remaining = Math.floor(remaining / STEAM_ALPHABET.length)
    }
    return code
  }
  const length = normalizeDigits(digits)
  return String(value % 10 ** length).padStart(length, '0')
}

export function counterAt(timestamp, period = DEFAULT_PERIOD) {
  return Math.floor(timestamp / 1000 / normalizePeriod(period))
}

// 距离当前验证码失效还剩多少秒，用来画倒计时圆环。
export function remainingSeconds(timestamp, period = DEFAULT_PERIOD) {
  const length = normalizePeriod(period)
  return length - Math.floor(timestamp / 1000) % length
}

// HOTP 的计数器存在账号上，TOTP 则由时间推出来。
export async function generateAccountCode(account, timestamp = Date.now()) {
  const counter = account.type === 'hotp' ? Number(account.counter) || 0 : counterAt(timestamp, account.period)
  return generateOtp({
    secret: account.secret,
    algorithm: account.algorithm,
    digits: account.digits,
    encoding: account.encoding,
    counter,
  })
}

// 显示成 123 456 / 1234 5678 比一长串数字好认。
export function formatCode(code, grouped = true) {
  const text = String(code || '')
  if (!grouped || text.length < 6 || !/^\d+$/.test(text)) return text
  const size = text.length % 3 === 0 ? 3 : Math.ceil(text.length / 2)
  return text.replace(new RegExp(`.{1,${size}}`, 'g'), '$& ').trim()
}
