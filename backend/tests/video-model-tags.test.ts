import { describe, it, expect } from 'vitest'
import { resolveModelTag, getModelPromptLimit, getModelReferenceImageLimit } from '../src/services/video-model-tags.js'

describe('video-model-tags', () => {
  describe('resolveModelTag', () => {
    it('应该识别 MiniMax H3', () => {
      expect(resolveModelTag('minimax', 'MiniMax-H3')).toBe('minimax-h3')
      expect(resolveModelTag('minimax', 'minimax-h3-v2')).toBe('minimax-h3')
      expect(resolveModelTag('MiniMax', 'MINIMAX-H3')).toBe('minimax-h3')
    })

    it('应该识别 Grok', () => {
      expect(resolveModelTag('aiask', 'grok-imagine-video-1.5')).toBe('grok')
      expect(resolveModelTag('xai', 'grok-imagine-video-1.5-lite')).toBe('grok')
      expect(resolveModelTag('aiask', 'GROK')).toBe('grok')
    })

    it('应该识别 Runway', () => {
      expect(resolveModelTag('runway', 'gen-3')).toBe('runway')
      expect(resolveModelTag('Runway', '')).toBe('runway')
    })

    it('应该识别 ComfyUI', () => {
      expect(resolveModelTag('comfyui', 'any-model')).toBe('comfyui-default')
      expect(resolveModelTag('ComfyUI', '')).toBe('comfyui-default')
    })

    it('应该返回 default 作为兜底', () => {
      expect(resolveModelTag('unknown', 'unknown-model')).toBe('default')
      expect(resolveModelTag('minimax', 'not-h3')).toBe('default')
      expect(resolveModelTag('', '')).toBe('default')
    })
  })

  describe('getModelPromptLimit', () => {
    it('应该返回正确的提示词上限', () => {
      expect(getModelPromptLimit('grok')).toBe(4096)
      expect(getModelPromptLimit('minimax-h3')).toBe(7000)
      expect(getModelPromptLimit('default')).toBeNull()
      expect(getModelPromptLimit('unknown')).toBeNull()
    })
  })

  describe('getModelReferenceImageLimit', () => {
    it('应该返回正确的参考图上限', () => {
      expect(getModelReferenceImageLimit('grok')).toBe(14)
      expect(getModelReferenceImageLimit('minimax-h3')).toBe(9)
      expect(getModelReferenceImageLimit('default')).toBeNull()
      expect(getModelReferenceImageLimit('unknown')).toBeNull()
    })
  })
})
