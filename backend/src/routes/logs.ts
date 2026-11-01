/**
 * 运行日志路由 — 设置页「运行日志」数据源
 * GET    /logs?since=<seq>&limit=<n>  增量取日志（前端轮询）
 * DELETE /logs                       清空界面上的日志（文件保留）
 */
import { Hono } from 'hono'
import { readLogs, clearLogs, LOG_FILE } from '../utils/log-buffer.js'
import { success } from '../utils/response.js'

const app = new Hono()

app.get('/', (c) => {
  const since = Math.max(0, Number(c.req.query('since')) || 0)
  const limit = Math.min(3000, Math.max(1, Number(c.req.query('limit')) || 1000))
  return success(c, { ...readLogs(since, limit), file: LOG_FILE })
})

app.delete('/', (c) => {
  clearLogs()
  return success(c)
})

export default app
