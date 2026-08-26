import { isValidSecret, normalizeSecret } from './base32.mjs'
import { DEFAULT_DIGITS, DEFAULT_PERIOD, normalizeDigits, normalizePeriod } from './otp.mjs'

export const COLORS = ['#16b8c7', '#2563eb', '#7c3aed', '#db2777', '#e85d3f', '#0f9f6e', '#f59e0b', '#64748b']

// 同一个服务商每次都落到同一种颜色，卡片墙看起来才稳定。
export function colorFor(seed) {
  const text = String(seed || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  return COLORS[hash % COLORS.length]
}

export function safeColor(value) {
  return /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(value || '') ? value : COLORS[0]
}

export function initials(value) {
  const text = String(value || '').trim()
  if (!text) return 'OTP'
  // 中文按前两个字取，拉丁文取每个单词首字母。
  if (/^[一-龥]/.test(text)) return text.slice(0, 2)
  const words = text.split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words.map(word => word[0]).join('') : words[0] || text).slice(0, 2).toUpperCase()
}

export function accountLabel(account) {
  return [account.issuer, account.name].map(part => String(part || '').trim()).filter(Boolean).join(' · ') || '未命名'
}

export function accountMatches(account, keyword, fields = ['name', 'issuer', 'note']) {
  const query = String(keyword || '').trim().toLocaleLowerCase()
  if (!query) return true
  return fields.map(field => account[field])
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase().includes(query))
}

export function normalizeGroupIds(groupIds) {
  const ids = Array.isArray(groupIds) ? groupIds.filter(id => typeof id === 'string' && id) : []
  return [...new Set(ids)]
}

let idCounter = 0

export function createId(prefix = 'id') {
  idCounter += 1
  const unique = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${unique}`
}

// 把任意来源（手填、扫码、导入、备份）的账号补成完整、可直接算码的形状。
export function normalizeAccount(input) {
  const account = { ...input }
  account.secret = normalizeSecret(account.secret)
  account.type = account.type === 'hotp' ? 'hotp' : 'totp'
  account.issuer = String(account.issuer || '').trim()
  account.name = String(account.name || '').trim()
  account.algorithm = ['SHA1', 'SHA256', 'SHA512'].includes(account.algorithm) ? account.algorithm : 'SHA1'
  account.digits = normalizeDigits(account.digits ?? DEFAULT_DIGITS)
  account.period = normalizePeriod(account.period ?? DEFAULT_PERIOD)
  account.counter = account.type === 'hotp' ? Math.max(0, Math.trunc(Number(account.counter) || 0)) : 0
  account.encoding = account.encoding === 'steam' ? 'steam' : 'standard'
  account.groupIds = normalizeGroupIds(account.groupIds)
  account.color = safeColor(account.color || colorFor(account.issuer || account.name))
  account.iconType = account.iconType === 'image' && account.iconData ? 'image' : 'text'
  account.icon = String(account.icon || '').trim() || initials(account.issuer || account.name)
  account.iconData = account.iconType === 'image' ? String(account.iconData || '') : ''
  account.favorite = Boolean(account.favorite)
  account.quick = Boolean(account.quick)
  account.note = String(account.note || '')
  account.deletedAt = account.deletedAt || null
  return account
}

// 同一个密钥 + 同一个账号名视为同一条，导入时用它去重。
export function accountKey(account) {
  return [normalizeSecret(account.secret), account.issuer?.toLowerCase() || '', account.name?.toLowerCase() || ''].join('|')
}

export function moveItem(items, sourceId, targetId) {
  const from = items.findIndex(item => item.id === sourceId)
  const to = items.findIndex(item => item.id === targetId)
  if (from < 0 || to < 0 || from === to) return items
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.groups) || !Array.isArray(value.accounts)) {
    throw new Error('不是有效的 FunOTP 备份')
  }
  return value
}

// 密钥算不出验证码的账号留着也只会报错，直接丢掉，但不因为一条脏数据让整次恢复失败。
export function migrateState(value) {
  const accounts = value.accounts.filter(account => isValidSecret(account?.secret)).map(normalizeAccount)
  const groups = value.groups
    .filter(group => group?.id)
    .map(group => ({ id: group.id, name: String(group.name || '').trim() || '未命名分组' }))
  const known = new Set(groups.map(group => group.id))
  accounts.forEach(account => { account.groupIds = account.groupIds.filter(id => known.has(id)) })
  return { state: { ...value, groups, accounts }, dropped: value.accounts.length - accounts.length }
}
