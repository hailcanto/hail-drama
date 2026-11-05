import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('E:/uu889/data/hail.sqlite3', { readonly: true });
try {
  const config = db.prepare('SELECT settings FROM ai_service_configs WHERE provider = ?').get('comfyui');
  if (config?.settings) {
    const settings = JSON.parse(config.settings);
    if (settings.comfyui_workflow) {
      fs.writeFileSync('E:/uu889/custom_workflow.json', JSON.stringify(settings.comfyui_workflow, null, 2));
      console.log('Workflow exported to E:/uu889/custom_workflow.json');
    } else {
      console.log('No custom workflow in settings');
    }
  }
} catch (e) {
  console.error(e.message);
} finally {
  db.close();
}
