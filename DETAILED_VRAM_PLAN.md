# RTX 4080 Laptop (12GB) MiniMax H3 完整方案 - 3D漫剧制作专用

## 📋 方案总览

### 模板 1: 「Hail定制版 - MiniMax H3 RTX低显存快速版」
- **目标用户**: RTX 4080/3090 单卡用户，日常720p漫剧制作
- **适用场景**: 3D动画、虚拟人物、卡通角色、场景渲染
- **核心优化**: INT8量化 + 稀疏注意力 + 低采样步数
- **输出规格**: 720p@24fps, 5-8秒/镜头
- **显存占用**: 11-12GB
- **生成速度**: 8-12分钟/镜头

### 模板 2: 「Hail定制版 - MiniMax H3 高清1080p版」
- **目标用户**: 需要高清输出或显存压力大的用户
- **适用场景**: 精品剧集、高清导出、后期制作
- **核心优化**: GGUF量化 + CPU卸载 + 稳定采样
- **输出规格**: 1080p@24fps, 4-10秒/镜头 (灵活)
- **显存占用**: 6-8GB
- **生成速度**: 20-35分钟/镜头

---

## 🎬 模板 1: 低显存快速版

### 1.1 核心模型组件

#### 【扩散模型 - UNet】
```
模型名称: minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors
下载源: HuggingFace - Comfy-Org/MiniMax-H3
存放位置: models/diffusion_models/
文件大小: ~14GB → INT8量化后 ~8-9GB显存
精度: INT8 (INT8 Post-Training Quantization)

特点:
- "hybrid" = 融合FL2VA (First&Last frame) + Ref2VA (Reference to Video)
- "b25-49" = 完整的25-49层模型块
- INT8量化 = 显存节省70%+

🎯 为什么选这个:
- INT8对3D动画影响小 (3D本身有去噪特性)
- 虚拟人物 > 真人，量化伪影不明显
- 显存节省最多，是12GB方案的必需选择
```

#### 【文本编码器 - CLIP】
```
模型名称: qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
下载源: HuggingFace - Comfy-Org/MiniMax-H3
存放位置: models/text_encoders/
文件大小: ~10GB (FP4量化版本)
类型: Multimodal Vision-Language (多模态视觉-语言)
精度: NVF4 (NVIDIA FP4) + AWQ量化

特点:
- "qwen3vl" = Qwen3 Vision Language model
- "32b" = 32B参数规模
- "nvfp4" = NVIDIA的4位浮点量化
- "awq" = Activation-aware Weighted Quantization

🎯 为3D漫剧的作用:
- 支持参考图 + 提示词双重控制
- 能理解中文提示词和视觉一致性要求
- 参考图 + 提示词 = 角色锁定最强
```

#### 【音频生成】
```
说明: MiniMax H3 的音频是模型内生成（自带）
不需要单独音频模型，视频/音频同时出

细节:
- 根据提示词自动生成音频
- 支持「系统音」(虚拟音、电子音效)
- 支持「旁白」(画外音、解说词)
- 口型自动与文字同步

🎯 对漫剧的影响:
- 虚拟人物说话口型同步
- 环境音自动匹配场景
- 台词控制指令生效
```

#### 【视频VAE】
```
模型名称: minimax_h3_video_vae_int8_convrot.safetensors
下载源: HuggingFace - Comfy-Org/MiniMax-H3
存放位置: models/vae/
文件大小: ~2GB
精度: INT8 + ConvROT优化

特点:
- "convrot" = 卷积旋转优化
- INT8精度 = 显存节省
- 处理全部视频帧
```

#### 【音频VAE】
```
模型名称: minimax_h3_audio_vae_fp32.safetensors
下载源: HuggingFace - Comfy-Org/MiniMax-H3
存放位置: models/vae/
文件大小: ~1.5GB
精度: FP32 (不量化，音频对精度敏感)
```

#### 【小型预览VAE】
```
模型名称: taeh3.safetensors
下载源: HuggingFace - Comfy-Org/MiniMax-H3
存放位置: models/vae/
文件大小: ~200MB
功能: 实时预览生成过程
```

---

### 1.2 LoRA (低秩适配)

#### 【DMAD LoRA - 核心质感】
```
模型名称: minimax_h3_dmad_full_dareties_v4_step600_comfy_fro.safetensors
下载源: HuggingFace - YZGoldfish/YZGoldfish-Models
存放位置: models/loras/
文件大小: ~400MB
强度设置: 0.8 (低显存版)

功能: DMAD = Differentiable Motion-Aware Detail
- 增强光影细节
- 优化动作连贯性
- 提升渲染质感 (3D动画感)

🎯 为3D漫剧的作用:
- 虚拟人物皮肤质感
- 场景材质细节
- 光源方向感
- 动作平滑度
```

#### 【风格LoRA - 艺术风格】
```
模型名称: MysticXXX_MMH3-V1.safetensors (可选列表)
下载源: HuggingFace - MysticX/MysticXXX_MMH3
存放位置: models/loras/
文件大小: ~200-400MB (各风格不同)
强度设置 (低显存版): 0.15

可选风格列表:
- Anime (二次元动画风) ✓推荐3D漫剧
- 3D Stylized (3D风格化) ✓推荐
- Photorealistic (写实风)
- Oil Painting (油画风)
- Watercolor (水彩风)
- Comic (漫画风)
- Cyberpunk (赛博朋克)
- Fantasy (奇幻风)

🎯 为3D漫剧选择:
- "3D Stylized" 或 "Anime" 最佳
- 强度0.15 = 微调，不过度
- 配合虚拟人物模型保持一致性
```

---

### 1.3 采样配置

#### 【采样器】
```
选择: SelfLiftH3Sampler (自升进阶采样器)
步数: 8步 (低显存版降至8)
CFG Scale: 1.5 (平衡提示词遵循度与创意)
Sampler Name: euler
Scheduler: simple

性能指标:
- 显存峰值: -10% vs 10步
- 生成时间: 8分钟/镜头 (vs 12分钟)
- 质量损失: 不明显 (3D有自然去噪特性)
```

#### 【注意力优化层】
```
1. ModelAttentionBackend
   - 设置: "comfy_kitchen attention"
   
2. BlockSparseAttention
   - selection: "sol-attn"
   - tau: 1.3
   - start_percent: 0.2
   - end_percent: 1
   - sink_conditioning: "exact_kv_and_rows"
   - min_tokens: 12288
   - extra_tokens: 256
   - 效果: 显存 -20%

3. MiniMaxLowVRAMAttention
   - head_chunks: 4
   - 效果: 显存 -30%
```

#### 【模型优化层】
```
1. MiniMaxH3SigmaShift
   - shift_video: 12
   - shift_audio: 3
   
2. MiniMaxChunkFeedForward
   - chunks: 2
   - seq_threshold: 4096
   - 效果: 显存 -15%
```

---

### 1.4 参考图与输入

#### 【参考图配置】
```
最大参考图数: 3张 (低显存版限制)

用途:
1. 参考图1: 角色模型 (虚拟人物)
2. 参考图2: 场景背景 (环境设定)
3. 参考图3: 服装/配饰 (细节锁定)

显存影响: 每张+1-2GB (总计 +3-6GB)
```

#### 【首尾帧锚定】
```
首帧 (first_frame): 上一镜头结尾自动提取
尾帧 (last_frame): 角色最终姿态
MiniMaxH3AddGuide: frame_idx 0和-1
```

---

### 1.5 视频输出

#### 【分辨率与长宽比】
```
分辨率: 720p (1280×720, 16:9)
时长限制: 5-8秒/镜头 (推荐6秒)

帧数计算:
- 5秒 = 121帧
- 6秒 = 145帧
- 8秒 = 193帧
(24fps + 1帧 MiniMax H3规则)

其他比例支持:
- 9:16 (竖屏) → 720×1280
- 3:4 (常规) → 960×1280
- 4:3 (传统) → 960×720
- 1:1 (方形) → 720×720
```

#### 【视频编码】
```
编码器: VHS_VideoCombine
格式: H.264 MP4
参数:
- frame_rate: 24fps
- pix_fmt: yuv420p
- crf: 19 (高质量)
- codec: auto

输出: hail-drama_[timestamp].mp4
存储: data/static/videos/
```

---

### 1.6 提示词结构

#### 【完整提示词示例 (3D漫剧)】
```
基础提示词:
"3D风格的虚拟女孩，穿着学生制服，在教室里转身看向镜头，笑容温暖"

【台词控制】
角色说：「你好！」（约1秒）
不得增加、改写或补充任何台词

【人物外观锁定】
脸型、发型、学生制服与参考图完全一致，全片不变

【场景一致】
教室内，日光从左侧窗户照射，温暖氛围

【画风一致】
全程保持3D动画风格

【画质】
画面清晰锐利、皮肤纹理清楚、制服质感真实、细节丰富

【物理真实】
动作符合物理：脚踩实地面、头发衣摆自然摆动、转身速度连贯
```

---

## 🎬 模板 2: 高清1080p版

### 2.1 核心差异

#### 【扩散模型 - 改用GGUF】
```
模型名称: minimax_h3_hybrid_fl2va_ref2va_b25-49_gguf.safetensors
下载源: HuggingFace - Comfy-Org/MiniMax-H3 (GGUF分支)
存放位置: models/diffusion_models/
文件大小: ~4-5GB (GGUF二进制)
精度: GGUF 4-bit量化
加载器: UnetLoaderGGUF

特性:
- 4-bit量化 = FP32的12-15%显存占用
- 支持CPU卸载 (权重放CPU RAM)
- 推理速度: 比INT8慢40-60%

🎯 优势:
- 显存节省极多 (6-8GB)
- 可用CPU RAM卸载 (64GB充足)
- 支持1080p分辨率
```

### 2.2 LoRA简化

#### 【DMAD LoRA】
```
选项1 (推荐): 完全移除
- 显存节省: +0.3GB

选项2 (折中): 强度0.4
- 显存占用: +0.15GB
```

#### 【风格LoRA】
```
选项1 (推荐): 完全移除
- 理由: 1080p不需额外风格干涉

选项2: 强度0.1
- 最小化干涉
```

### 2.3 采样配置 - 高清特化

```
采样器: SelfLiftH3Sampler (保持)
步数: 10步 (高清版恢复到10)
CFG Scale: 2.0 (提高)

注意力配置:
- BlockSparseAttention: 可关闭
- MiniMaxLowVRAMAttention: 保持必需
- MiniMaxChunkFeedForward: 保持
```

### 2.4 参考图与时长

```
最大参考图数: 5-7张 (vs低显存版3张)

时长配置 (灵活):
- 标准: 6秒 (平衡)
- 长镜: 8-10秒 (需谨慎)
- 短镜: 3-4秒 (快速)

分辨率配置:
- 1080p (1920×1080) 主力
- 720p (1280×720) 备选 (更快)
```

---

## 📊 两个模板对比

```
特性 | 低显存快速版 | 高清1080p版 | 差异
-----|------------|-----------|-----
UNet模型 | INT8 | GGUF | 量化方式
显存占用 | 11-12GB | 6-8GB | 节省40%
生成速度 | 8-12分钟 | 20-35分钟 | 慢3倍
输出分辨率 | 720p固定 | 1080p | 4倍像素
时长限制 | 5-8秒 | 3-10秒 | 灵活
参考图 | 3张 | 5-7张 | 更多细节
DMAD强度 | 0.8 | 0.4或移除 | 质感取舍
风格LoRA | 0.15 | 移除 | 风格简化
CFG Scale | 1.5 | 2.0 | 约束力度
采样步数 | 8步 | 10步 | 质量vs速度
文件大小 | 20-40MB | 60-100MB | 质量权衡

评分:
低显存快速版:
- 质感完整: ★★★★☆
- 清晰度: ★★★★☆ (720p充足)
- 生成速度: ★★★★★
- 角色一致: ★★★★★

高清1080p版:
- 质感完整: ★★★☆☆
- 清晰度: ★★★★★ (1080p最高)
- 生成速度: ★★★☆☆
- 角色一致: ★★★★☆
```

---

## 📥 文件清单

### 低显存快速版 (必需)
```
models/diffusion_models/
  └─ minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors (8-9GB)

models/text_encoders/
  └─ qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors (10GB)

models/vae/
  ├─ minimax_h3_video_vae_int8_convrot.safetensors (2GB)
  ├─ minimax_h3_audio_vae_fp32.safetensors (1.5GB)
  └─ taeh3.safetensors (200MB)

models/loras/
  ├─ minimax_h3_dmad_full_dareties_v4_step600_comfy_fro.safetensors (400MB)
  └─ MysticXXX_MMH3-V1.safetensors (200-400MB)

总大小: ~25-30GB (下载)
运行时: 11-12GB
```

### 高清1080p版 (新增)
```
models/diffusion_models/
  └─ minimax_h3_hybrid_fl2va_ref2va_b25-49_gguf.safetensors (4-5GB)

(其他文件与低显存版共用)

总大小: ~18-20GB (新增GGUF)
运行时: 6-8GB
```

---

## ✅ 最终建议

**推荐方案: 两个模板都装**

1. **低显存快速版** (日常主力)
   - 日常720p制作
   - 快速迭代 (8-12分钟/镜头)
   - 角色质感最佳
   - 推荐先用这个

2. **高清1080p版** (精品备选)
   - 偶尔高清需求
   - 1080p输出 (精品定版)
   - 显存压力最小
   - 预留给重要镜头

**选择策略:**
- 日常漫剧: 低显存快速版
- 精品大制作: 高清1080p版
- 两个都要: 按需切换最佳
