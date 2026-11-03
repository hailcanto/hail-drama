/**
 * 视频模型标签映射 — 用于 prompt_generator 选择生成规范
 */
export function resolveModelTag(provider: string, model?: string): string {
  const p = provider.toLowerCase()
  const m = (model || '').toLowerCase()

  // MiniMax H3 系列（识别所有包含 h3 的 MiniMax 模型，包括 MiniMax-H3 / minimax-h3-* 等）
  if ((p === 'minimax' || p === 'minimax_huanling') && (m.includes('h3') || m.includes('h-3'))) {
    return 'minimax-h3'
  }

  // ComfyUI 的 MiniMax H3 工作流（通过模型名判断）
  if (p === 'comfyui') {
    // 检查模型名是否包含 minimax-h3 或 h3
    if (m.includes('minimax') && m.includes('h3')) {
      return 'minimax-h3'
    }
    return 'comfyui-default'
  }

  // Grok（aiask / xai）
  if ((p === 'aiask' || p === 'xai') && m.includes('grok')) {
    return 'grok'
  }

  // Runway
  if (p === 'runway') {
    return 'runway'
  }

  // 其他模型用通用格式
  return 'default'
}

/**
 * 获取模型的提示词字节上限（用于 Agent 指令）
 */
export function getModelPromptLimit(tag: string): number | null {
  switch (tag) {
    case 'grok': return 4096
    case 'minimax-h3': return 7000
    default: return null
  }
}

/**
 * 获取模型的参考图上限（用于 Agent 指令）
 */
export function getModelReferenceImageLimit(tag: string): number | null {
  switch (tag) {
    case 'grok': return 14  // grok-imagine-video-1.5
    case 'minimax-h3': return 9
    default: return null
  }
}
