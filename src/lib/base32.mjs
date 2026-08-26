// RFC 4648 Base32。两步验证密钥全都以这种形式在服务商与验证器之间传递。
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// 用户从网页上抄密钥时经常带上空格、连字符或小写，这里一并容忍。
export function normalizeSecret(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
}

export function base32Decode(value) {
  const input = normalizeSecret(value)
  if (!input) throw new Error('请输入密钥')
  const bytes = []
  let buffer = 0
  let bits = 0
  for (const char of input) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error('密钥只能包含 A-Z 和 2-7')
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 0xff)
    }
  }
  if (!bytes.length) throw new Error('密钥太短，至少需要 2 个字符')
  return Uint8Array.from(bytes)
}

export function base32Encode(bytes) {
  let output = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += ALPHABET[(buffer >>> bits) & 31]
    }
  }
  if (bits) output += ALPHABET[(buffer << (5 - bits)) & 31]
  return output
}

export function isValidSecret(value) {
  try {
    base32Decode(value)
    return true
  } catch {
    return false
  }
}
