/**
 * 批量视频提示词任务 — 异步为缺少 video_prompt 的分镜逐个运行 prompt_generator Agent
 * 进程内内存态：按集跟踪一份任务，运行中不重复启动；重启后状态丢失
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { splitOverlongShots } from './shot-split.js'
import { resolveModelTag, getModelPromptLimit, getModelReferenceImageLimit } from './video-model-tags.js'

export interface VideoPromptBatchStatus {
  status: 'running' | 'done' | 'error'
  total: number
  completed: number
  failed: number
  current_storyboard_id?: number
  started_at: string
  finished_at?: string
  error?: string
  /** 写完提示词后台词仍超过单镜上限、被自动拆开的分镜数 */
  split?: number
}

const tasks = new Map<number, VideoPromptBatchStatus>()

/** 启动批量生成（立即返回）；运行中返回 started:false,total:-1；无待生成分镜返回 started:false,total:0；
 *  传入 storyboardIds 时只处理所选分镜（即使已有提示词也重新生成），否则处理全部缺失提示词的分镜 */
export async function startVideoPromptBatch(
  episodeId: number,
  dramaId: number,
  opts: { model?: string; configId?: number } = {},
  storyboardIds?: number[],
): Promise<{ started: boolean; total: number }> {
  if (tasks.get(episodeId)?.status === 'running') return { started: false, total: -1 }

  const sbs = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
  const pending = storyboardIds?.length
    ? sbs.filter(sb => storyboardIds.includes(sb.id))
    : sbs.filter(sb => !(sb.videoPrompt || '').trim())
  if (!pending.length) return { started: false, total: 0 }

  // 视频模型标签：跟随该集锁定的视频配置，供 Agent 按模型特性生成
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  let videoLabel = '默认'
  let modelTag = 'default'
  let promptLimit: number | null = null
  let refImageLimit: number | null = null
  let promptSkill: string | null = null  // 用户在配置中手动绑定的 skill 名称

  if (ep?.videoConfigId) {
    const [cfg] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, ep.videoConfigId))
    if (cfg) {
      videoLabel = `${cfg.name} (${cfg.provider})`
      const providerParam = cfg.provider === null ? '' : cfg.provider
      const modelParam: string | undefined = cfg.model === null ? undefined : cfg.model
      modelTag = resolveModelTag(providerParam, modelParam)
      promptLimit = getModelPromptLimit(modelTag)
      refImageLimit = getModelReferenceImageLimit(modelTag)
      promptSkill = cfg.promptSkill || null  // 读取用户指定的 skill
    }
  }

  const task: VideoPromptBatchStatus = {
    status: 'running',
    total: pending.length,
    completed: 0,
    failed: 0,
    started_at: new Date().toISOString(),
  }
  tasks.set(episodeId, task)

  logTaskStart('VideoPrompt', 'batch', { episodeId, dramaId, total: pending.length, model: opts.model || undefined })
  ;(async () => {
    const agent = mastra.getAgent('prompt_generator')
    if (!agent) throw new Error('视频提示词 Agent 不可用')
    const requestContext = buildAgentRequestContext({
      episodeId,
      dramaId,
      modelOverride: opts.model || undefined,
      textConfigId: opts.configId || undefined,
    })

    // 动态读取 skill 内容（如果配置指定了 prompt_skill）
    let skillContent = ''
    if (promptSkill) {
      try {
        const { skillsManagerWorkspace } = await import('../agents/skills.js')
        const fs = skillsManagerWorkspace.filesystem
        if (fs) {
          const skillPath = `skills/${promptSkill}/SKILL.md`
          const content = await fs.readFile(skillPath)
          const contentStr = typeof content === 'string' ? content : content.toString('utf-8')
          // 去掉 frontmatter，只保留正文
          const bodyMatch = contentStr.match(/^---\s*\n[\s\S]*?\n---\s*\n(.*)$/s)
          skillContent = bodyMatch ? bodyMatch[1].trim() : contentStr.trim()
          console.log(`[VideoPrompt] Loaded skill "${promptSkill}", content length: ${skillContent.length}`)
        } else {
          console.log('[VideoPrompt] filesystem is null')
        }
      } catch (err: any) {
        logTaskError('VideoPrompt', 'load-skill', { skill: promptSkill, error: err?.message })
        console.error(`[VideoPrompt] Failed to load skill "${promptSkill}":`, err)
      }
    } else {
      console.log('[VideoPrompt] No promptSkill specified')
    }

    for (const sb of pending) {
      task.current_storyboard_id = sb.id
      logTaskProgress('VideoPrompt', 'batch-shot', { episodeId, storyboardId: sb.id, index: task.completed + task.failed + 1, total: task.total })
      try {
        // 构建模型相关的提示信息
        let modelInfo = `视频模型: ${videoLabel}\n模型标签: ${modelTag}`
        if (promptLimit) modelInfo += `\n提示词字节上限: ${promptLimit} 字节`
        if (refImageLimit) modelInfo += `\n参考图数量上限: ${refImageLimit} 张`

        // 如果配置指定了 skill 且成功加载，将完整 skill 内容作为格式规范附加
        let formatSection = ''
        if (skillContent) {
          formatSection = `\n\n## 提示词格式规范\n\n${skillContent}\n\n请严格遵循上述格式规范生成 video_prompt。`
        }

        const userMessage = `请为分镜 #${sb.storyboardNumber}(ID:${sb.id})生成视频提示词(video_prompt)。

${modelInfo}${formatSection}

请先调用 read_storyboard_context 获取该分镜的画面描述(含【镜头N】子镜头与台词/旁白)、氛围及时长，据此生成 video_prompt，然后调用 update_storyboard 保存到分镜 ID:${sb.id}。update_storyboard 参数只传 storyboard_id 和 video_prompt 两个键，不要回传该分镜的其他任何字段，不要重新拆分整集。`

        console.log(`[VideoPrompt] Storyboard ${sb.id} - Message length: ${userMessage.length}, has formatSection: ${!!formatSection}`)

        await agent.generate([{
          role: 'user',
          content: userMessage,
        }], { maxSteps: 8, requestContext })
        // 以实际落库为准判定成败
        const [fresh] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, sb.id))
        if ((fresh?.videoPrompt || '').trim()) task.completed++
        else {
          task.failed++
          logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: 'agent finished but video_prompt is empty' })
        }
      } catch (err: any) {
        task.failed++
        logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: err?.message })
      }
    }
    // 提示词按描述写出来的台词仍超过单镜上限（描述里塞了整段台词）：按台词自动拆开这几个分镜
    const split = await splitOverlongShots(episodeId, { storyboardIds: pending.map(sb => sb.id) }).catch((err: any) => {
      logTaskError('ShotSplit', 'after-video-prompts', { episodeId, error: err?.message })
      return null
    })
    if (split?.split.length) task.split = split.split.length
  })()
    .then(() => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      task.current_storyboard_id = undefined
      logTaskSuccess('VideoPrompt', 'batch', { episodeId, total: task.total, completed: task.completed, failed: task.failed })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = err?.message || '批量生成失败'
      logTaskError('VideoPrompt', 'batch', { episodeId, error: err?.message })
    })
  return { started: true, total: pending.length }
}

export function getVideoPromptBatchStatus(episodeId: number): VideoPromptBatchStatus | null {
  return tasks.get(episodeId) || null
}
