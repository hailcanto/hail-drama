/**
 * 改名前的界面偏好（localStorage 键 uu889:*）一次性复制成 hail:*，旧键保留不删。
 * 模块顶层执行：i18n.ts / useTheme.ts 在模块顶层读偏好，必须先 import 本模块。
 */
const LEGACY_PREFIX = 'uu889:'
const PREFIX = 'hail:'
const DONE_KEY = 'hail:legacy-storage-copied'

try {
  if (typeof window !== 'undefined' && !localStorage.getItem(DONE_KEY)) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(LEGACY_PREFIX)) continue
      const next = PREFIX + key.slice(LEGACY_PREFIX.length)
      const value = localStorage.getItem(key)
      if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value)
    }
    localStorage.setItem(DONE_KEY, '1')
  }
} catch { /* localStorage 不可用时跳过 */ }

export {}
