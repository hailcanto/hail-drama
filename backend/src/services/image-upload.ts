/**
 * 图片上传服务 - 用于桌面版等无公网地址场景，将本地图片上传到公共图床获取 HTTPS URL
 * 当前实现：ImgBB（https://api.imgbb.com/）
 * - 免费，支持 32MB 图片
 * - 可设置自动过期（默认 24 小时）
 * - 需要 API Key：https://api.imgbb.com/ 免费申请
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA_ROOT } from '../utils/paths.js'

export interface ImageUploadService {
  /** 上传图片，返回公网 HTTPS URL */
  upload(buffer: Buffer, filename: string): Promise<string>
  /** 服务名称（用于日志和错误提示） */
  readonly serviceName: string
}

/**
 * ImgBB 图床上传器
 * 环境变量：IMGBB_API_KEY
 * 申请地址：https://api.imgbb.com/
 */
export class ImgBBUploader implements ImageUploadService {
  readonly serviceName = 'ImgBB'
  private readonly apiKey: string
  private readonly expirationSeconds: number

  constructor(apiKey: string, expirationSeconds = 86400) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('ImgBB API Key 未配置或无效')
    }
    this.apiKey = apiKey.trim()
    this.expirationSeconds = expirationSeconds
  }

  async upload(buffer: Buffer, filename: string): Promise<string> {
    const base64 = buffer.toString('base64')
    const formData = new FormData()
    formData.append('image', base64)
    if (filename) {
      formData.append('name', filename.replace(/\.[^.]+$/, '')) // 去掉扩展名
    }

    const url = `https://api.imgbb.com/1/upload?expiration=${this.expirationSeconds}&key=${this.apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`ImgBB 上传失败 (HTTP ${response.status}): ${text}`)
    }

    const result = await response.json()
    if (!result.success) {
      const msg = result.error?.message || result.error || JSON.stringify(result)
      throw new Error(`ImgBB 上传失败: ${msg}`)
    }

    return result.data.url // 直链 HTTPS URL
  }
}

/** 单例：从环境变量创建上传服务，未配置时返回 null */
let cachedUploader: ImageUploadService | null | undefined

export function getImageUploader(): ImageUploadService | null {
  if (cachedUploader !== undefined) return cachedUploader

  const apiKey = process.env.IMGBB_API_KEY?.trim()
  if (!apiKey) {
    cachedUploader = null
    return null
  }

  try {
    cachedUploader = new ImgBBUploader(apiKey)
    console.log('[ImageUpload] ImgBB uploader initialized')
    return cachedUploader
  } catch (err) {
    console.error('[ImageUpload] Failed to create uploader:', err)
    cachedUploader = null
    return null
  }
}

/**
 * 将本地图片路径上传到图床，返回公网 HTTPS URL
 * @param localPath 本地路径（相对 DATA_ROOT 或绝对路径）
 * @returns 公网 URL，失败时抛出错误
 */
export async function uploadLocalImage(localPath: string): Promise<string> {
  const uploader = getImageUploader()
  if (!uploader) {
    throw new Error(
      '图片上传服务未配置。桌面版请在设置中配置 ImgBB API Key，' +
      '或在 backend/.env 添加 IMGBB_API_KEY=xxx（申请地址：https://api.imgbb.com/）',
    )
  }

  // 解析路径：static/ 开头按相对路径，否则尝试绝对路径
  const resolvedPath = localPath.startsWith('static/')
    ? join(DATA_ROOT, localPath)
    : localPath

  const buffer = await readFile(resolvedPath)
  const filename = localPath.split('/').pop() || 'image.jpg'

  console.log(`[ImageUpload] Uploading ${filename} to ${uploader.serviceName}...`)
  const url = await uploader.upload(buffer, filename)
  console.log(`[ImageUpload] Uploaded: ${url}`)

  return url
}

/**
 * 批量上传本地图片，跳过已经是 HTTPS URL 的项
 * @returns 全部转换为公网 URL 的数组
 */
export async function uploadLocalImages(paths: string[]): Promise<string[]> {
  const results: string[] = []
  for (const path of paths) {
    if (path.startsWith('https://')) {
      results.push(path)
    } else {
      const url = await uploadLocalImage(path)
      results.push(url)
    }
  }
  return results
}
