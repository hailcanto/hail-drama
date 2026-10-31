/**
 * 首次启动导入改名前（UU889-Drama）的数据：复制，不移动，旧软件照常可用。
 *
 * 只在新数据目录还没有数据库时询问；「以后再说」下次启动再问，「不再提示」写标记文件。
 * 复制内容：数据目录（数据库 + 图片 / 视频）和 workspace（可能改过的 skills / prompts）。
 * 数据库文件名由后端启动时改成 hail.sqlite3。
 */
import { app, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { LEGACY_APP_DIRS, copyData, dirSize, findLegacyDataDir } from './migrate-core'

const SKIP_MARKER = 'legacy-import-skipped'

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(n >= 1024 ** 3 ? 1 : 2)} GB`

function hasDatabase(dir: string): boolean {
  return ['hail.sqlite3', 'uu889.sqlite3'].some((name) => fs.existsSync(path.join(dir, name)))
}

/** 不带边框的小窗口显示复制进度（此时主窗口还没创建） */
function openProgressWindow(totalBytes: number): { update: (copied: number) => void; close: () => void } {
  const win = new BrowserWindow({
    width: 420, height: 150, frame: false, resizable: false, closable: false, minimizable: false,
    title: 'Hail 短剧', show: true, backgroundColor: '#0a0f0d',
  })
  const html = `<meta charset="utf-8"><body style="margin:0;padding:24px;font:14px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#0a0f0d;color:#ecf3ef">
    <div style="font-weight:600;margin-bottom:6px">正在导入 UU889-Drama 的数据</div>
    <div id="t" style="color:#8fa198;font-size:12px;margin-bottom:14px">准备中…</div>
    <div style="height:6px;border-radius:6px;background:#1f2c25;overflow:hidden"><i id="b" style="display:block;height:100%;width:0;background:#34d399"></i></div></body>`
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  let last = 0
  return {
    update(copied) {
      if (win.isDestroyed() || Date.now() - last < 200) return
      last = Date.now()
      const pct = totalBytes ? Math.min(100, Math.round((copied / totalBytes) * 100)) : 100
      void win.webContents.executeJavaScript(
        `document.getElementById('b').style.width='${pct}%';document.getElementById('t').textContent='${gb(copied)} / ${gb(totalBytes)}（${pct}%）'`,
      ).catch(() => {})
    },
    close() {
      if (!win.isDestroyed()) win.destroy()
    },
  }
}

/**
 * @param dataDir    新版数据目录
 * @param workspaceDir 新版 workspace 目录（dev 模式下是仓库目录，不复制）
 */
export async function maybeImportLegacyData(dataDir: string, workspaceDir: string | null): Promise<void> {
  const userData = app.getPath('userData')
  if (fs.existsSync(path.join(userData, SKIP_MARKER)) || hasDatabase(dataDir)) return

  const legacyUserData = path.join(app.getPath('appData'), app.isPackaged ? LEGACY_APP_DIRS.packaged : LEGACY_APP_DIRS.dev)
  const legacyData = findLegacyDataDir(legacyUserData)
  if (!legacyData) return

  const totalBytes = await dirSize(legacyData)
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Hail 短剧',
    message: '检测到 UU889-Drama 的数据，要导入吗？',
    detail: `位置：${legacyData}\n大小：约 ${gb(totalBytes)}\n\n会把项目、图片、视频和 AI 服务配置复制到 Hail 短剧，原来的文件不动，UU889-Drama 仍可继续使用。`,
    buttons: ['导入', '以后再说', '不导入，不再提示'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (response === 2) {
    fs.writeFileSync(path.join(userData, SKIP_MARKER), new Date().toISOString())
    return
  }
  if (response !== 0) return

  try {
    const st = await fsp.statfs(dataDir)
    const free = st.bavail * st.bsize
    if (free < totalBytes * 1.05) {
      dialog.showErrorBox('Hail 短剧', `磁盘空间不足，没有导入：需要约 ${gb(totalBytes * 1.05)}，剩余 ${gb(free)}。\n腾出空间后重新打开 Hail 短剧会再次询问。`)
      return
    }
  } catch { /* statfs 不可用时直接尝试复制 */ }

  const progress = openProgressWindow(totalBytes)
  try {
    await copyData(legacyData, dataDir, (p) => progress.update(p.copiedBytes))
    const legacyWorkspace = path.join(legacyUserData, 'workspace')
    if (workspaceDir && fs.existsSync(legacyWorkspace)) {
      await fsp.cp(legacyWorkspace, workspaceDir, { recursive: true, force: true })
    }
  } catch (err) {
    progress.close()
    dialog.showErrorBox('Hail 短剧', `导入失败，已撤销本次复制，原来的数据没有改动：\n${(err as Error)?.message || err}\n\n重新打开 Hail 短剧会再次询问。`)
    return
  }
  progress.close()
}
