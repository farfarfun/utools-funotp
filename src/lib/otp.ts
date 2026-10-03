import { base32Decode } from './base32'

// 全部计算都在本地完成，密钥不出设备，也不需要联网。
export const ALGORITHMS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }
export const DEFAULT_PERIOD = 30
export const DEFAULT_DIGITS = 6

export type OtpAlgorithm = keyof typeof ALGORITHMS

export interface OtpAccount {
  secret: string
  type?: string
  algorithm?: string
  digits?: number
  counter?: number
  period?: number
  encoding?: string
}

// Steam 令牌用自己的字母表，位数固定 5 位。
const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY'
const STEAM_DIGITS = 5

// HOTP 的计数器是 8 字节大端整数。时间戳除以周期后可能超过 2^32，用 BigInt 才不会丢精度。
/** 将 HOTP 计数器转换为 8 字节大端数组。
 * @param counter HOTP 计数器。
 * @returns 计数器字节数组。
 */
export function counterBytes(counter: number | bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  let value = BigInt(counter)
  for (let index = 7; index >= 0 && value > 0n; index -= 1) {
    bytes[index] = Number(value & 0xffn)
    value >>= 8n
  }
  return bytes
}

// RFC 4226 动态截断：末字节低 4 位当偏移，从那里取 4 字节并抹掉符号位。
/** 按 RFC 4226 对 HMAC 摘要执行动态截断。
 * @param digest HMAC 摘要字节。
 * @returns 非负整数验证码种子。
 */
export function truncate(digest: Uint8Array): number {
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

/** 将验证码位数限制到支持范围。
 * @param digits 待规范化的位数。
 * @returns 4 至 10 的整数位数。
 */
export function normalizeDigits(digits: unknown): number {
  const value = Number(digits)
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 4), 10) : DEFAULT_DIGITS
}

/** 将 TOTP 周期限制到支持范围。
 * @param period 待规范化的周期秒数。
 * @returns 1 至 3600 的整数秒数。
 */
export function normalizePeriod(period: unknown): number {
  const value = Number(period)
  return Number.isFinite(value) && value > 0 ? Math.min(Math.trunc(value), 3600) : DEFAULT_PERIOD
}

/** 根据密钥和计数器生成 HOTP、TOTP 或 Steam 验证码。
 * @param options 计算所需的密钥、算法、位数、计数器与编码方式。
 * @returns 生成的验证码。
 * @throws 密钥无效或浏览器加密接口失败时抛出错误。
 */
export async function generateOtp({ secret, algorithm = 'SHA1', digits = DEFAULT_DIGITS, counter = 0, encoding = 'standard' }: OtpAccount): Promise<string> {
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

/** 计算指定时间所属的 TOTP 计数器。
 * @param timestamp Unix 时间戳（毫秒）。
 * @param period 验证码周期（秒）。
 * @returns TOTP 计数器。
 */
export function counterAt(timestamp: number, period: unknown = DEFAULT_PERIOD): number {
  return Math.floor(timestamp / 1000 / normalizePeriod(period))
}

// 距离当前验证码失效还剩多少秒，用来画倒计时圆环。
/** 计算当前验证码距离失效的秒数。
 * @param timestamp Unix 时间戳（毫秒）。
 * @param period 验证码周期（秒）。
 * @returns 剩余秒数。
 */
export function remainingSeconds(timestamp: number, period: unknown = DEFAULT_PERIOD): number {
  const length = normalizePeriod(period)
  return length - Math.floor(timestamp / 1000) % length
}

// HOTP 的计数器存在账号上，TOTP 则由时间推出来。
/** 为账号在给定时间生成验证码。
 * @param account 已规范化的 OTP 账号。
 * @param timestamp Unix 时间戳（毫秒）。
 * @returns 生成的验证码。
 */
export async function generateAccountCode(account: OtpAccount, timestamp: number = Date.now()): Promise<string> {
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
/** 将数字验证码按易读分组格式化。
 * @param code 原始验证码。
 * @param grouped 是否启用分组。
 * @returns 格式化后的验证码。
 */
export function formatCode(code: unknown, grouped: boolean = true): string {
  const text = String(code || '')
  if (!grouped || text.length < 6 || !/^\d+$/.test(text)) return text
  const size = text.length % 3 === 0 ? 3 : Math.ceil(text.length / 2)
  return text.replace(new RegExp(`.{1,${size}}`, 'g'), '$& ').trim()
}
