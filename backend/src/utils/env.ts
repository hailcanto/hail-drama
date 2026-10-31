/**
 * 品牌环境变量：优先读 HAIL_*，没设置时兼容改名前的 UU889_*（老部署的 .env / docker-compose 不用改）
 */
export function brandEnv(name: string): string | undefined {
  return process.env[`HAIL_${name}`] ?? process.env[`UU889_${name}`]
}
