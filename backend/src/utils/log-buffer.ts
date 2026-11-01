/**
 * 运行日志收集：接管 console.log / info / warn / error，原样输出到终端的同时
 * - 存进内存环形缓冲（最近 LOG_BUFFER_MAX 行），供设置页「运行日志」实时查看（GET /logs）
 * - 追加写入 DATA_ROOT/logs/backend.log（超过 LOG_FILE_MAX 字节时改名为 backend.old.log 再重写）
 * 必须在 index.ts 最先 import，才能收到其它模块启动阶段的输出。
 */
import fs from 'fs'
import path from 'path'
import { format } from 'util'
import { DATA_ROOT } from './paths.js'

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  seq: number
  time: string
  level: LogLevel
  text: string
}

const LOG_BUFFER_MAX = 3000
const LOG_FILE_MAX = 10 * 1024 * 1024
const ANSI_RE = /\x1b\[[0-9;]*m/g

export const LOG_DIR = path.join(DATA_ROOT, 'logs')
export const LOG_FILE = path.join(LOG_DIR, 'backend.log')

const buffer: LogEntry[] = []
let seq = 0
let fileReady = false
let fileBytes = 0

function prepareFile() {
  if (fileReady) return
  fileReady = true
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fileBytes = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0
  } catch { /* 日志目录不可写时只保留内存缓冲 */ }
}

function writeFile(line: string) {
  prepareFile()
  try {
    if (fileBytes > LOG_FILE_MAX) {
      fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'backend.old.log'))
      fileBytes = 0
    }
    fs.appendFileSync(LOG_FILE, line)
    fileBytes += Buffer.byteLength(line)
  } catch { /* 写文件失败不影响程序运行 */ }
}

function record(level: LogLevel, args: unknown[]) {
  const text = format(...args).replace(ANSI_RE, '')
  const entry: LogEntry = { seq: ++seq, time: new Date().toISOString(), level, text }
  buffer.push(entry)
  if (buffer.length > LOG_BUFFER_MAX) buffer.splice(0, buffer.length - LOG_BUFFER_MAX)
  writeFile(`${entry.time} [${level.toUpperCase()}] ${text}\n`)
}

let installed = false
export function installLogCapture() {
  if (installed) return
  installed = true
  const wrap = (method: 'log' | 'info' | 'warn' | 'error', level: LogLevel) => {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      original(...args)
      try { record(level, args) } catch { /* 记录失败不影响原输出 */ }
    }
  }
  wrap('log', 'info')
  wrap('info', 'info')
  wrap('warn', 'warn')
  wrap('error', 'error')
}

/** 取 seq 之后的日志（最多 limit 条，取最新的） */
export function readLogs(since = 0, limit = 1000): { entries: LogEntry[]; last: number } {
  const entries = buffer.filter(e => e.seq > since)
  return { entries: entries.slice(-limit), last: seq }
}

export function clearLogs() {
  buffer.length = 0
}

installLogCapture()
