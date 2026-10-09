// uTools 内走 dbStorage，浏览器预览时退回 localStorage。
// 统一从这里读写，避免同一份数据一半在 dbStorage、一半在 localStorage。
function db() {
  return window.utools?.dbStorage || null
}

function readLocal<T>(key: string, fallback: T | null): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** 从 uTools 数据库或浏览器本地存储读取数据，并迁移旧的 localStorage 数据。
 * @param key 存储键名。
 * @param fallback 未找到或读取失败时返回的值。
 * @returns 已读取的数据或后备值。
 */
export function readStorage<T>(key: string, fallback: T | null = null): T | null {
  const store = db()
  if (!store) return readLocal(key, fallback)
  const value = store.getItem(key)
  if (value != null) return value as T
  const legacy = readLocal(key, null)
  if (legacy == null) return fallback
  store.setItem(key, legacy)
  localStorage.removeItem(key)
  return legacy
}

/** 将可序列化数据写入 uTools 数据库或浏览器本地存储。
 * @param key 存储键名。
 * @param value 要保存的可序列化数据。
 * @returns 无返回值。
 * @throws 数据无法 JSON 序列化时抛出错误。
 */
export function writeStorage(key: string, value: unknown): void {
  // dbStorage 不接受 Vue 的响应式代理，这里统一转成纯对象。
  const plain = JSON.parse(JSON.stringify(value))
  const store = db()
  if (store) store.setItem(key, plain)
  else localStorage.setItem(key, JSON.stringify(plain))
}
