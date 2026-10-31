/**
 * MiniMax H3 视频生成 Adapter —— 第三方幻灵网关（https://api.huanling.icu）
 * 协议与官方 H3 一致（同路径、同字段、同状态机），见 https://api.huanling.icu/guides/minimax-h3
 * 端点: POST /v2/video_generation -> { task_id }
 * 轮询: GET  /v2/query/video_generation/{task_id} -> { task: { status, content.url, error } }
 *
 * 与官方的差异（网关裁剪）：
 * - 仅 MiniMax-H3（无 H3-Max），分辨率固定 768P，时长 1–15 秒
 * - 媒体只接受公网 HTTPS URL，不支持 base64 / mm_file://
 * - content.url 是网关代理地址，下载必须带 Authorization
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
  DownloadRequest,
} from './types'
import { joinProviderUrl } from './url'
import { uploadLocalImages, getImageUploader } from '../image-upload.js'

const MODEL = 'MiniMax-H3'

/** 多模态参考素材上限：图片 9、视频 3、音频 3，混合总数 12 */
const REF_LIMITS = { images: 9, videos: 3, audios: 3, total: 12 } as const

const PROMPT_MAX_CHARS = 7000

const VALID_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'])

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

export class MiniMaxHuanlingVideoAdapter implements VideoProviderAdapter {
  provider = 'minimax_huanling'

  async buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): Promise<ProviderRequest> {
    const model = record.model || config.model || MODEL
    if (model !== MODEL) throw new Error(`幻灵网关仅支持 ${MODEL} 模型，当前: ${model}`)

    const prompt = (record.prompt || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)
    let firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
    let lastFrame = (record.lastFrameUrl || '').trim()

    if (!prompt) throw new Error('MiniMax H3 要求必须提供提示词（text content）')
    if (prompt.length > PROMPT_MAX_CHARS) {
      throw new Error(`提示词超长：MiniMax H3 上限 ${PROMPT_MAX_CHARS} 字符，当前 ${prompt.length}`)
    }

    // 收集所有需要处理的媒体 URL（首帧、尾帧、参考素材）
    const allMedia = [firstFrame, lastFrame, ...refImages, ...refVideos, ...refAudios].filter(Boolean)
    const hasLocalMedia = allMedia.some((url) => !/^https:\/\//i.test(url))

    // 如果有本地媒体（非 HTTPS），尝试上传到图床
    if (hasLocalMedia) {
      const uploader = getImageUploader()
      if (!uploader) {
        throw new Error(
          '幻灵网关的首帧 / 尾帧 / 参考素材只接受公网 HTTPS 地址，不支持本地图片（base64）。\n' +
          '桌面版解决方案：\n' +
          '  1. 在设置中配置 ImgBB API Key（免费申请：https://api.imgbb.com/），自动上传本地图片到公共图床\n' +
          '  2. 或改用不带参考图的文生视频\n' +
          '  3. 或换用官方 MiniMax\n' +
          '服务器部署：在 backend/.env 配置 PUBLIC_BASE_URL 暴露本地 /static 目录',
        )
      }

      // 上传本地图片到图床，获取公网 URL
      console.log(`[MiniMaxHuanling] 检测到本地媒体，正在上传到 ${uploader.serviceName}...`)
      const uploadedMedia: string[] = []
      for (const url of allMedia) {
        if (url.startsWith('https://')) {
          uploadedMedia.push(url)
        } else {
          // 上传本地文件（data: URL 或 static/ 路径）
          const uploaded = await this.uploadMedia(url)
          uploadedMedia.push(uploaded)
        }
      }

      // 替换为上传后的 URL
      let idx = 0
      if (firstFrame) firstFrame = uploadedMedia[idx++]
      if (lastFrame) lastFrame = uploadedMedia[idx++]
      const uploadedRefImages = refImages.map(() => uploadedMedia[idx++])
      const uploadedRefVideos = refVideos.map(() => uploadedMedia[idx++])
      const uploadedRefAudios = refAudios.map(() => uploadedMedia[idx++])

      // 更新引用数组
      refImages.splice(0, refImages.length, ...uploadedRefImages)
      refVideos.splice(0, refVideos.length, ...uploadedRefVideos)
      refAudios.splice(0, refAudios.length, ...uploadedRefAudios)
    }

    const totalRefs = refImages.length + refVideos.length + refAudios.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)
    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios || totalRefs > REF_LIMITS.total) {
      throw new Error(`参考素材超限：图片≤${REF_LIMITS.images}、视频≤${REF_LIMITS.videos}、音频≤${REF_LIMITS.audios}、总数≤${REF_LIMITS.total}`)
    }

    const content: any[] = [{ type: 'text', text: prompt }]
    if (firstFrame) content.push({ type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' })
    if (lastFrame) content.push({ type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' })
    for (const url of refImages) content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    for (const url of refVideos) content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
    for (const url of refAudios) content.push({ type: 'audio_url', audio_url: { url } })

    const body: any = {
      model,
      content,
      duration: this.normalizeDuration(record.duration),
      // 网关只认 768P，2K 会被 400 拒绝
      resolution: '768P',
    }
    // 图生视频（有首帧）ratio 恒为 adaptive，省略；文生视频 ratio 必填
    if (!firstFrame) {
      const ratio = (record.aspectRatio || '').trim()
      body.ratio = VALID_RATIOS.has(ratio) ? ratio : '16:9'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v2', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  /** 上传单个媒体文件（data: URL 或本地路径）到图床 */
  private async uploadMedia(url: string): Promise<string> {
    // data: URL 转 Buffer 上传
    if (url.startsWith('data:')) {
      const uploader = getImageUploader()!
      const match = url.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!match) throw new Error(`不支持的 data URL 格式: ${url.substring(0, 50)}...`)
      const [, ext, base64] = match
      const buffer = Buffer.from(base64, 'base64')
      const filename = `ref-${Date.now()}.${ext}`
      return await uploader.upload(buffer, filename)
    }

    // 本地路径上传（通过 image-upload 模块处理）
    const { uploadLocalImage } = await import('../image-upload.js')
    return await uploadLocalImage(url)
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.task_id) return { isAsync: true, taskId: String(result.task_id) }
    const videoUrl = result.task?.content?.url || result.content?.url || result.video_url
    if (videoUrl) return { isAsync: false, videoUrl }
    throw new Error('No task_id or video url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v2', `/query/video_generation/${taskId}`),
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const task = result.task && typeof result.task === 'object' ? result.task : result
    const status = task.status
    if (status === 'succeeded') return { status: 'completed', videoUrl: task.content?.url || task.video_url }
    if (status === 'failed' || status === 'cancelled') {
      const err = task.error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Video generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    const task = result.task && typeof result.task === 'object' ? result.task : result
    return task.content?.url || task.video_url || null
  }

  /** 网关的成片地址需要带 Key 才能下载（官方是裸链） */
  resolveDownload(config: AIConfig, videoUrl: string): DownloadRequest {
    return { url: videoUrl, headers: { 'Authorization': `Bearer ${config.apiKey}` }, fallbackExt: '.mp4' }
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    return Math.min(15, Math.max(1, parsed))
  }
}
