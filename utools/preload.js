const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

// 插件可能在 Vue 挂载之前就收到 onPluginEnter，先攒着，等界面注册好再回放。
const enterQueue = []
let enterHandler = null

utools.onPluginEnter(action => {
  if (enterHandler) enterHandler(action)
  else enterQueue.push(action)
})

function request(url, { method = 'GET', headers = {}, body = '', timeout = 10000, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.request(target, { method, headers }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects) {
        response.resume()
        return resolve(request(new URL(response.headers.location, target).href, { method, headers, body, timeout, redirects: redirects - 1 }))
      }
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf8')
        // MKCOL 撞上已存在的目录会返回 405，这不算失败。
        if ((response.statusCode >= 200 && response.statusCode < 300) || (method === 'MKCOL' && response.statusCode === 405)) {
          resolve({ status: response.statusCode, body: content })
        } else reject(new Error(`${response.statusCode} ${response.statusMessage || '请求失败'}`))
      })
    })
    req.setTimeout(timeout, () => req.destroy(new Error(`${timeout / 1000}秒超时`)))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const WEBDAV_DIRECTORY = 'FunOTP'

function webdavTarget(config, file = '') {
  const base = new URL(config.host.endsWith('/') ? config.host : `${config.host}/`)
  return new URL(`${WEBDAV_DIRECTORY}/${file}`, base).href
}

function webdavHeaders(config, extra = {}) {
  return { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`, ...extra }
}

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

window.funotp = {
  onEnter(callback) {
    enterHandler = callback
    while (enterQueue.length) callback(enterQueue.shift())
  },
  // 返回 false 表示用户取消，界面据此不提示「已导出」。
  saveBackup(content, defaultName) {
    const destination = utools.showSaveDialog({
      title: '导出 FunOTP 数据',
      defaultPath: defaultName,
      filters: [{ name: defaultName.endsWith('.json') ? 'JSON' : '文本', extensions: [defaultName.split('.').pop()] }],
    })
    if (!destination) return false
    fs.writeFileSync(destination, content, 'utf8')
    return true
  },
  chooseTextFile(extensions) {
    const result = utools.showOpenDialog({ properties: ['openFile'], filters: [{ name: '数据文件', extensions }] })
    if (!result?.[0]) return null
    return fs.readFileSync(path.resolve(result[0]), 'utf8')
  },
  // 读成 data URL，渲染层才能直接丢给 <img> 交给二维码解码。
  chooseImageFile() {
    const result = utools.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    })
    if (!result?.[0]) return null
    const file = path.resolve(result[0])
    const type = IMAGE_TYPES[path.extname(file).toLowerCase()] || 'image/png'
    return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`
  },
  async webdavBackup(config, content) {
    await request(webdavTarget(config), { method: 'MKCOL', headers: webdavHeaders(config) })
    const now = new Date()
    const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()].join('-')
    await request(webdavTarget(config, `${stamp}.json`), {
      method: 'PUT',
      headers: webdavHeaders(config, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(content) }),
      body: content,
    })
  },
  async webdavList(config) {
    const xml = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>'
    return (await request(webdavTarget(config), {
      method: 'PROPFIND',
      headers: webdavHeaders(config, { Depth: '1', 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(xml) }),
      body: xml,
    })).body
  },
  async webdavRestore(config, href) {
    return (await request(new URL(href, config.host).href, { headers: webdavHeaders(config) })).body
  },
  async webdavDelete(config, href) {
    await request(new URL(href, config.host).href, { method: 'DELETE', headers: webdavHeaders(config) })
  },
}
