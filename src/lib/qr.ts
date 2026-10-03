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

/** 从图片地址或 data URL 中识别二维码文本。
 * @param source 图片地址或 data URL。
 * @returns 识别出的二维码文本。
 * @throws 图片无法读取或不含二维码时抛出错误。
 */
export async function decodeQrImage(source: string): Promise<string> {
  const image = await loadImage(source)
  for (const scale of [1, 2, 0.5]) {
    const result = scan(image, scale)
    if (result) return result
  }
  throw new Error('没有识别到二维码，请让二维码更清晰一些')
}

/** 将文本生成二维码 data URL。
 * @param text 要编码的文本。
 * @param dark 二维码前景色。
 * @returns 二维码 PNG 的 data URL。
 */
export function toQrDataUrl(text: string, dark: string = '#2f3437'): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark, light: '#ffffff' },
  })
}

// 剪贴板里的图片走 navigator.clipboard，uTools 与浏览器预览下都能用。
/** 读取剪贴板中的第一张图片并转换为 data URL。
 * @returns 图片 data URL。
 * @throws 剪贴板没有图片时抛出错误。
 */
export async function readClipboardImage(): Promise<string> {
  const items = await navigator.clipboard?.read?.()
  for (const item of items || []) {
    const type = item.types.find(value => value.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    return await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  }
  throw new Error('剪贴板里没有图片')
}
