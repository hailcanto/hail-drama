/**
 * 服务器 / Docker 部署的版本检查与更新触发
 *
 * - 版本检查：复用桌面版同一份发布清单（HAIL_UPDATE_FEED 的 latest.json）
 * - 当前版本：构建时注入 HAIL_VERSION（Docker ARG / 环境变量），缺省回退 package.json
 * - 一键更新：仅在配置 Watchtower（HAIL_WATCHTOWER_URL）时可用——容器不可变，
 *   容器内自更新是反模式，正确路径是由 Watchtower 拉新镜像并重建本容器；
 *   未配置时前端展示手动更新指引（docker compose pull && up -d）
 */
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { brandEnv } from '../utils/env.js'

// 默认读取 GitHub Releases 的 latest.json；HAIL_UPDATE_FEED 可整体覆盖（如自建国内镜像）
const FEED_URLS = process.env.HAIL_UPDATE_FEED
  ? [process.env.HAIL_UPDATE_FEED]
  : [
    'https://github.com/hailcanto/hail-drama/releases/latest/download/latest.json',
    'https://cdn.jsdelivr.net/gh/hailcanto/hail-drama@latest/releases/latest.json',
  ]

const FETCH_TIMEOUT = 30_000 // 30秒，考虑国内网络环境
const FETCH_RETRIES = 2 // 每个源失败后重试次数

const WATCHTOWER_URL = brandEnv('WATCHTOWER_URL')?.replace(/\/+$/, '')
const WATCHTOWER_TOKEN = brandEnv('WATCHTOWER_TOKEN') || ''

export type ServerUpdateMode = 'watchtower' | 'manual'

export interface ServerUpdateState {
  status: 'idle' | 'up-to-date' | 'available' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  updateMode: ServerUpdateMode
}

let lastState: Omit<ServerUpdateState, 'updateMode'> | null = null

function currentVersion(): string {
  // compose 默认注入 dev（本地构建未指定版本）：不是版本号，改用 package.json，避免永远提示有新版本
  const injected = (brandEnv('VERSION') || '').replace(/^v/, '')
  if (/^\d+\.\d+\.\d+/.test(injected)) return injected
  try {
    const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')
    return JSON.parse(readFileSync(pkg, 'utf-8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function updateMode(): ServerUpdateMode {
  return WATCHTOWER_URL ? 'watchtower' : 'manual'
}

/** 与桌面版 updater.ts 同规则的三段数字比较 */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/** GET /state — 当前版本 + 更新模式 + 上次检查结果（不触发网络请求） */
export function getServerUpdateState(): ServerUpdateState {
  return {
    status: lastState?.status ?? 'idle',
    currentVersion: currentVersion(),
    latestVersion: lastState?.latestVersion,
    notes: lastState?.notes,
    error: lastState?.error,
    updateMode: updateMode(),
  }
}

/** POST /check — 拉取发布清单比较版本（双源依次尝试） */
export async function checkServerUpdate(): Promise<ServerUpdateState> {
  try {
    let feed: any
    const errors: string[] = []

    for (const url of FEED_URLS) {
      for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          feed = await res.json()
          if (!feed?.version) throw new Error('版本清单格式不正确')
          break // 成功，跳出重试循环
        } catch (err) {
          const isTimeout = (err as Error).name === 'TimeoutError' || (err as Error).message.includes('timeout')
          const errMsg = isTimeout
            ? `请求超时 (${FETCH_TIMEOUT / 1000}秒)`
            : (err as Error).message
          errors.push(`${url} (尝试 ${attempt}/${FETCH_RETRIES}): ${errMsg}`)

          // 非最后一次尝试，等待后重试
          if (attempt < FETCH_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          }
        }
      }
      if (feed) break // 已成功获取 feed，跳出源循环
    }

    if (!feed) {
      throw new Error(
        `版本清单请求失败，已尝试 ${FEED_URLS.length} 个源，共 ${errors.length} 次请求。\n` +
        `可能原因：网络不稳定或 GitHub 访问受限。请稍后重试或检查网络连接。\n` +
        `详细信息：\n${errors.slice(-3).join('\n')}`
      )
    }

    const latestVersion = String(feed.version).replace(/^v/, '')
    lastState = {
      status: compareVersions(latestVersion, currentVersion()) > 0 ? 'available' : 'up-to-date',
      currentVersion: currentVersion(),
      latestVersion,
      notes: feed.notes,
    }
  } catch (err) {
    lastState = {
      status: 'error',
      currentVersion: currentVersion(),
      error: (err as Error).message,
    }
  }
  return getServerUpdateState()
}

/**
 * POST /apply — 触发 Watchtower 立即检查并重建本容器
 * Watchtower 异步执行：拉取新镜像 → 重建容器，本进程随后被替换，调用方只能拿到"已触发"
 */
export async function triggerWatchtowerUpdate(): Promise<void> {
  if (!WATCHTOWER_URL) throw new Error('未配置 Watchtower（HAIL_WATCHTOWER_URL），无法应用内更新')
  const res = await fetch(`${WATCHTOWER_URL}/v1/update`, {
    method: 'POST',
    headers: WATCHTOWER_TOKEN ? { Authorization: `Bearer ${WATCHTOWER_TOKEN}` } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) throw new Error(`Watchtower 触发失败（HTTP ${res.status}）`)
}
