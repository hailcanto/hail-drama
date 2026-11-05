import Database from 'better-sqlite3'

const db = new Database('E:/uu889/data/hail.sqlite3', { readonly: true })
try {
  const row = db.prepare('SELECT settings FROM ai_service_configs WHERE provider = ?').get('comfyui')
  if (row?.settings) {
    const cfg = JSON.parse(row.settings as string)
    if (cfg.comfyui_workflow) {
      console.log(JSON.stringify(cfg.comfyui_workflow, null, 2))
    }
  }
} finally {
  db.close()
}
