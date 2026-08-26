import jsQR from 'jsqr'
import QRCode from 'qrcode'

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取'))
    image.src = source
  })
}

// 截屏往往是整块屏幕，二维码只占一小片；先按原尺寸扫，失败再放大一倍重试。
function scan(image, scale) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  if (!canvas.width || !canvas.height) return null
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.imageSmoothingEnabled = scale < 1
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data || null
}

export async function decodeQrImage(source) {
  const image = await loadImage(source)
  for (const scale of [1, 2, 0.5]) {
    const result = scan(image, scale)
    if (result) return result
  }
  throw new Error('没有识别到二维码，请让二维码更清晰一些')
}

export function toQrDataUrl(text, dark = '#2f3437') {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark, light: '#ffffff' },
  })
}

// 剪贴板里的图片走 navigator.clipboard，uTools 与浏览器预览下都能用。
export async function readClipboardImage() {
  const items = await navigator.clipboard?.read?.()
  for (const item of items || []) {
    const type = item.types.find(value => value.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  }
  throw new Error('剪贴板里没有图片')
}
