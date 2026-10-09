import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { readStorage, writeStorage } from '../src/lib/storage'

const local = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => local.set(key, value),
  removeItem: (key: string) => local.delete(key),
}

afterEach(() => {
  local.clear()
  vi.unstubAllGlobals()
})

test('浏览器预览时从 localStorage 读写，并在损坏数据时返回后备值', () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', localStorageMock)
  writeStorage('settings', { dark: true })
  assert.deepEqual(readStorage('settings', { dark: false }), { dark: true })
  local.set('broken', '{')
  assert.deepEqual(readStorage('broken', { safe: true }), { safe: true })
})

test('uTools 数据库优先读取，并迁移旧 localStorage 数据', () => {
  const database = new Map<string, unknown>()
  const store = { getItem: (key: string) => database.get(key) ?? null, setItem: (key: string, value: unknown) => database.set(key, value) }
  vi.stubGlobal('window', { utools: { dbStorage: store } })
  vi.stubGlobal('localStorage', localStorageMock)
  local.set('legacy', JSON.stringify({ migrated: true }))

  assert.deepEqual(readStorage('legacy', { migrated: false }), { migrated: true })
  assert.deepEqual(database.get('legacy'), { migrated: true })
  assert.equal(local.get('legacy'), undefined)
  database.set('current', { source: 'db' })
  assert.deepEqual(readStorage('current', { source: 'fallback' }), { source: 'db' })
})

test('写入前去除响应式代理形状，并在不可序列化时抛错', () => {
  const saved: unknown[] = []
  vi.stubGlobal('window', { utools: { dbStorage: { getItem: () => null, setItem: (_key: string, value: unknown) => saved.push(value) } } })
  vi.stubGlobal('localStorage', localStorageMock)
  writeStorage('state', { nested: { value: 1 } })
  assert.deepEqual(saved, [{ nested: { value: 1 } }])
  const circular: { self?: unknown } = {}
  circular.self = circular
  assert.throws(() => writeStorage('bad', circular))
})
