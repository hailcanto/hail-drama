/**
 * 改名兼容：旧库 uu889.sqlite3 自动接管为 hail.sqlite3、环境变量 HAIL_* 优先并兼容 UU889_*
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'hail-legacy-db-'))
process.env.HAIL_DATA_DIR = DATA
process.env.SQLITE_PATH = path.join(DATA, 'hail.sqlite3')

// 造一个改名前的库（Windows 上打开中的文件不能改名，先关掉）
const legacy = new Database(path.join(DATA, 'uu889.sqlite3'))
legacy.exec("CREATE TABLE legacy_marker (v TEXT); INSERT INTO legacy_marker VALUES ('from-uu889')")
legacy.close()

test('old uu889.sqlite3 (with -wal) is adopted as hail.sqlite3 on startup', async () => {
  const { dbPath } = await import('../src/db/index')
  assert.equal(dbPath, path.join(DATA, 'hail.sqlite3'))
  assert.ok(!fs.existsSync(path.join(DATA, 'uu889.sqlite3')), '旧文件已改名')
  const db = new Database(dbPath, { readonly: true })
  assert.equal(db.prepare('SELECT v FROM legacy_marker').get()?.['v' as never], 'from-uu889')
  db.close()
})

test('brand env: HAIL_* wins, UU889_* still works', async () => {
  const { brandEnv } = await import('../src/utils/env')
  delete process.env.HAIL_X_TEST
  process.env.UU889_X_TEST = 'old'
  assert.equal(brandEnv('X_TEST'), 'old')
  process.env.HAIL_X_TEST = 'new'
  assert.equal(brandEnv('X_TEST'), 'new')
})
