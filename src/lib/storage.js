// uTools 内走 dbStorage，浏览器预览时退回 localStorage。
// 统一从这里读写，避免同一份数据一半在 dbStorage、一半在 localStorage。
function db() {
  return window.utools?.dbStorage || null
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function readStorage(key, fallback = null) {
  const store = db()
  if (!store) return readLocal(key, fallback)
  const value = store.getItem(key)
  if (value != null) return value
  const legacy = readLocal(key, null)
  if (legacy == null) return fallback
  store.setItem(key, legacy)
  localStorage.removeItem(key)
  return legacy
}

export function writeStorage(key, value) {
  // dbStorage 不接受 Vue 的响应式代理，这里统一转成纯对象。
  const plain = JSON.parse(JSON.stringify(value))
  const store = db()
  if (store) store.setItem(key, plain)
  else localStorage.setItem(key, JSON.stringify(plain))
}
