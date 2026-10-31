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

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || MODEL
    if (model !== MODEL) throw new Error(`幻灵网关仅支持 ${MODEL} 模型，当前: ${model}`)

    const prompt = (record.prompt || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)
    const firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
    const lastFrame = (record.lastFrameUrl || '').trim()

    if (!prompt) throw new Error('MiniMax H3 要求必须提供提示词（text content）')
    if (prompt.length > PROMPT_MAX_CHARS) {
      throw new Error(`提示词超长：MiniMax H3 上限 ${PROMPT_MAX_CHARS} 字符，当前 ${prompt.length}`)
    }

    // 本地参考图在 generation.ts 里会被编码成 data: URL，网关不接受
    const media = [firstFrame, lastFrame, ...refImages, ...refVideos, ...refAudios].filter(Boolean)
    if (media.some((url) => !/^https:\/\//i.test(url))) {
      throw new Error(
        '幻灵网关的首帧 / 尾帧 / 参考素材只接受公网 HTTPS 地址，不支持本地图片（base64）。' +
        '服务器部署可在 backend/.env 配置 PUBLIC_BASE_URL；桌面版请改用不带参考图的文生视频，或换用官方 MiniMax。',
      )
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
