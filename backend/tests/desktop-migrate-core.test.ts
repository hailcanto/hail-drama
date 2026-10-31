/**
 * 桌面版「更改存储位置」的文件操作（desktop/src/migrate-core.ts，不依赖 Electron）
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// desktop 包是 CommonJS：动态导入后取 default（tsx 的 CJS 互操作）
const mod: any = await import('../../desktop/src/migrate-core')
const core: typeof import('../../desktop/src/migrate-core') = mod.default ?? mod
const { cleanIpcError, copyData, DATA_SUBDIR, findLegacyDataDir, moveData, resolveMigrationTarget, sameVolume, validateTarget } = core

function tmp(prefix: string, base = os.tmpdir()) {
  return fs.mkdtempSync(path.join(base, prefix))
}

/** 造一个像样的数据目录：数据库 + WAL + 图片 / 视频子目录 */
function makeDataDir(dir: string) {
  fs.mkdirSync(path.join(dir, 'static', 'videos'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'static', 'images'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'hail.sqlite3'), Buffer.alloc(4096, 1))
  fs.writeFileSync(path.join(dir, 'hail.sqlite3-wal'), Buffer.alloc(1024, 2))
  fs.writeFileSync(path.join(dir, 'static', 'videos', '镜头1.mp4'), Buffer.alloc(200_000, 3))
  fs.writeFileSync(path.join(dir, 'static', 'images', 'a.png'), Buffer.alloc(5000, 4))
}

function snapshot(dir: string): Record<string, number> {
  const out: Record<string, number> = {}
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else out[path.relative(dir, full)] = fs.statSync(full).size
    }
  }
  walk(dir)
  return out
}

test('target folder: empty / new folders are used as-is, a folder with files gets a HailDrama-Data subfolder', async () => {
  const root = tmp('hail-mig-')
  const current = path.join(root, 'old-data')
  makeDataDir(current)
  const fresh = path.join(root, 'new-place')
  assert.equal(await resolveMigrationTarget(fresh, current), fresh)
  const empty = path.join(root, 'empty'); fs.mkdirSync(empty)
  fs.writeFileSync(path.join(empty, '.DS_Store'), 'x') // 系统隐藏文件不算内容
  assert.equal(await resolveMigrationTarget(empty, current), empty)
  // 以前选 D:\ 这种有东西的目录会直接报「目标目录必须为空」
  const busy = path.join(root, 'busy'); fs.mkdirSync(busy); fs.writeFileSync(path.join(busy, 'notes.txt'), 'hi')
  assert.equal(await resolveMigrationTarget(busy, current), path.join(busy, DATA_SUBDIR))
  // 选当前数据目录的上级目录（里面有当前数据目录）也能用子目录
  assert.equal(await resolveMigrationTarget(root, current), path.join(root, DATA_SUBDIR))
  await assert.rejects(resolveMigrationTarget(current, current), /不能选择当前数据目录/)
  fs.mkdirSync(path.join(busy, DATA_SUBDIR)); fs.writeFileSync(path.join(busy, DATA_SUBDIR, 'x'), 'x')
  await assert.rejects(resolveMigrationTarget(busy, current), /也不是空的/)
  const file = path.join(root, 'file.txt'); fs.writeFileSync(file, 'x')
  await assert.rejects(resolveMigrationTarget(file, current), /不是文件夹/)
})

test('validate: creates the folder, measures data size, refuses nesting', async () => {
  const root = tmp('hail-mig-')
  const current = path.join(root, 'data')
  makeDataDir(current)
  const target = path.join(root, 'next')
  const bytes = await validateTarget(target, current)
  assert.ok(fs.statSync(target).isDirectory())
  assert.equal(bytes, 4096 + 1024 + 200_000 + 5000)
  await assert.rejects(validateTarget(path.join(current, 'inner'), current), /当前数据目录里面/)
  assert.equal(await sameVolume(current, target), true)
})

test('same disk: everything moves, old folder removed, progress reported', async () => {
  const root = tmp('hail-mig-')
  const oldDir = path.join(root, 'data'); makeDataDir(oldDir)
  const before = snapshot(oldDir)
  const newDir = path.join(root, 'moved')
  const progress: number[] = []
  const res = await moveData(oldDir, newDir, (p) => progress.push(p.copiedBytes))
  assert.deepEqual(snapshot(newDir), before)
  assert.ok(!fs.existsSync(oldDir))
  assert.equal(res.leftover, undefined)
  assert.ok(progress.length >= 1 && progress[progress.length - 1] === 210_120)
})

test('same disk: a failure halfway moves everything back, the old folder stays complete', async () => {
  const root = tmp('hail-mig-')
  const oldDir = path.join(root, 'data'); makeDataDir(oldDir)
  const before = snapshot(oldDir)
  const newDir = path.join(root, 'moved'); fs.mkdirSync(newDir)
  // 目标里放一个同名「文件」挡住 static 目录的 rename（ENOTDIR / EEXIST，不是可重试的占用错误）
  fs.writeFileSync(path.join(newDir, 'static'), 'blocker')
  await assert.rejects(moveData(oldDir, newDir))
  assert.deepEqual(snapshot(oldDir), before, '旧目录完整')
  assert.deepEqual(fs.readdirSync(newDir), ['static'], '新目录只剩挡路的文件，搬过去的已经搬回')
})

test('different disks: copy + verify + delete old', { skip: (() => { try { return fs.statSync('/dev/shm').dev === fs.statSync(os.tmpdir()).dev } catch { return true } })() }, async () => {
  const oldDir = path.join(tmp('hail-mig-'), 'data'); makeDataDir(oldDir)
  const before = snapshot(oldDir)
  const newDir = path.join(tmp('hail-mig-', '/dev/shm'), 'data')
  assert.equal(await sameVolume(path.dirname(oldDir), path.dirname(newDir)), false, '真正的跨盘')
  await moveData(oldDir, newDir)
  assert.deepEqual(snapshot(newDir), before)
  assert.ok(!fs.existsSync(oldDir))
  fs.rmSync(path.dirname(newDir), { recursive: true, force: true })
})

test('IPC error text: Electron prefix is stripped, the reason stays', () => {
  assert.equal(cleanIpcError("Error invoking remote method 'hail:start-migration': Error: 目标文件夹必须为空"), '目标文件夹必须为空')
  assert.equal(cleanIpcError('普通错误'), '普通错误')
})

test('legacy import: finds the old data dir (default or storage-config) only when it has uu889.sqlite3', () => {
  const legacyUserData = tmp('hail-legacy-')
  assert.equal(findLegacyDataDir(legacyUserData), null, '没有旧版数据')
  const def = path.join(legacyUserData, 'data')
  fs.mkdirSync(def)
  fs.writeFileSync(path.join(def, 'uu889.sqlite3'), 'db')
  assert.equal(findLegacyDataDir(legacyUserData), def)
  const moved = tmp('hail-legacy-moved-')
  fs.writeFileSync(path.join(legacyUserData, 'storage-config.json'), JSON.stringify({ version: 1, dataDir: moved }))
  assert.equal(findLegacyDataDir(legacyUserData), null, '改过存储位置但那里没有数据库')
  fs.writeFileSync(path.join(moved, 'uu889.sqlite3'), 'db')
  assert.equal(findLegacyDataDir(legacyUserData), moved)
})

test('legacy import: copyData copies everything and leaves the old dir untouched', async () => {
  const oldDir = path.join(tmp('hail-copy-'), 'data'); makeDataDir(oldDir)
  const before = snapshot(oldDir)
  const newDir = path.join(tmp('hail-copy-'), 'data')
  let last = 0
  await copyData(oldDir, newDir, (p) => { last = p.copiedBytes })
  assert.deepEqual(snapshot(newDir), before)
  assert.deepEqual(snapshot(oldDir), before, '旧目录不动')
  assert.equal(last, Object.values(before).reduce((s, n) => s + n, 0))
})
