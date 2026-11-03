---
name: video-prompt-minimax-h3
description: MiniMax H3 视频提示词专用格式（基于官方 h3-prompt-writing skills）
---

# MiniMax H3 视频提示词格式

参考：https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing

MiniMax H3 采用**多模态结构化提示词**，与通用格式有显著差异。根据是否有参考素材，使用不同模式。

---

## 🎯 模式选择

根据分镜的参考图资源（`read_storyboard_context` 返回的 `firstFrameUrl` / `lastFrameUrl` / `referenceImageUrls`）选择：

- **T2VA**（文生视频）：无任何参考图
- **I2VA**（图生视频）：只有 `firstFrameUrl`（首帧图）
- **FL2VA**（首尾帧）：有 `firstFrameUrl` + `lastFrameUrl`
- **Ref2VA**（全参考）：有多个 `referenceImageUrls`（≥2 张，包含角色图、场景图、道具图等）

**本项目主要场景**：
- I2VA：分镜有首帧生成图
- Ref2VA：开启「接上一镜」时，有上一镜结尾帧 + 角色/场景参考图（最多 9 张）

---

## 📝 I2VA / FL2VA / T2VA 格式（Base 模式）

### 结构（3 个字段）

生成的 `video_prompt` 包含 3 个部分，用 **YAML 风格** 排列（每个字段名顶格，冒号后换行，内容缩进）：

```
integrated_multimodal_description:
  镜头、画面、动作、台词、音效的完整描述（英文）

overall_soundscape:
  环境音描述（风声、水流、物体碰撞声等，不含台词和背景音乐）

non_diegetic_music:
  配乐描述（观众能听到但角色听不到的背景音乐）
```

---

### 写法要点

#### 1. 镜头标记与时间戳

**Shot 1**（开头）：
```
[Shot 1] Live-action, cinematic style. The camera slowly pushes in.
A young woman (S1) stands by the window...
```

**Shot 2+**（后续镜头）：
```
[Shot 2] At 00:03.500, the camera cuts to a close-up.
Her hands tremble as she opens the letter...
```

- **Shot 1** 必须声明风格：`live-action` / `2D-animated` / `cinematic` / `documentary` 等
- **Shot 2+** 用时间戳：`At MM:SS.mmm`（如 `00:03.500` = 3.5 秒）
- 运镜用自然英文：`pushes in with small amplitude at slow speed` / `tilts down` / `zooms out slowly`

#### 2. 参考图标记

- 首帧（I2VA）：`<Picture 1>`
- 尾帧（FL2VA）：`<Picture 2>`
- 其他参考图（按 `referenceImageUrls` 数组顺序）：`<Picture 3>`, `<Picture 4>` ...（最多 9 张）

**插入位置**：在该图对应的画面元素前面

```
[Shot 1] From <Picture 1>, live-action. <Picture 3> The cafe interior with warm lighting...
<Picture 4> A man (S1) sits at the table, looking at his phone.
```

#### 3. 台词格式

**基本格式**：
```
(S1) says: <d>[Chinese] 你终于来了。</d>
(S2) says in an off-screen voiceover: <d>[Chinese] 我一直都在。</d>
```

**规则**：
- 说话人用稳定 ID：`(S1)`, `(S2)`, `(S3)` ...（按出场顺序编号，全视频保持一致）
- 台词必须包在 `<d>[语言] ...</d>` 标签内
- 语言标签：中文用 `[Chinese]`，英文用 `[English]`
- 画外音：加 `in an off-screen voiceover`，并注明 `lips remain closed`

**台词来源**：
- **只用 `description` 里的原句，不创作新台词**
- 如果 `description` 里有【镜头N】结构和「@某某说：「...」」格式，提取其中的台词
- 保留原语言（中文台词不要翻译）

**跨镜台词与截断**：
- `<scenetrans>`：台词跨越镜头切换点继续
- `<cutoff>`：视频结束时台词被打断（常用于最后一个 Shot 的结尾）

#### 4. 环境音（overall_soundscape）

描述场景中的自然声音：
- 环境音：风声、水流、交通噪音、虫鸣鸟叫
- 物体声音：门吱呀声、脚步声、杯子碰撞、键盘敲击
- **不含台词和配乐**

示例：
```
Soft ambient cafe chatter in the background. The clinking of coffee cups. The door creaks as it opens. Footsteps approach on the wooden floor.
```

#### 5. 配乐（non_diegetic_music）

描述背景音乐（观众能听到，角色听不到）：
- 乐器：piano, violin, guitar, electronic synth...
- 节奏：slow tempo, fast-paced, rhythmic...
- 情绪：melancholic, uplifting, tense, peaceful...

示例：
```
A gentle piano melody with slow tempo, conveying anticipation and relief.
```

---

### 示例 1：I2VA 模式（5 秒，有首帧，单镜头）

```
integrated_multimodal_description:
  [Shot 1] From <Picture 1>, live-action, cinematic style. The cafe interior with warm lighting and vintage decor. <Picture 3> A man (S1) in a gray coat sits at a corner table, nervously tapping his fingers on the table. His eyes keep glancing at the door. (S1) mutters to himself: <d>[Chinese] 她会来吗？</d> The camera slowly pushes in with small amplitude. <cutoff>

overall_soundscape:
  Soft ambient cafe chatter in the background. The clinking of coffee cups. Fingers tapping rhythmically on the wooden table.

non_diegetic_music:
  A gentle piano melody with slow tempo, creating a tense and anticipatory atmosphere.
```

---

### 示例 2：I2VA 模式（8 秒，有首帧，双镜头切换）

```
integrated_multimodal_description:
  [Shot 1] From <Picture 1>, live-action, cinematic style. <Picture 3> The cafe interior with warm lighting. <Picture 4> A man (S1) in a gray coat sits at a corner table, nervously looking at his watch. The camera holds steady on him for 2 seconds.
  
  [Shot 2] At 00:03.000, the camera cuts to the entrance. The door opens, and <Picture 5> a woman (S2) in a red scarf walks in. (S2) smiles and says: <d>[Chinese] 不好意思，来晚了。</d> (S1) stands up and replies: <d>[Chinese] 没关系，我也刚到。</d> <cutoff>

overall_soundscape:
  Soft ambient cafe chatter. The clinking of coffee cups. The door creaks as it opens. Footsteps on the wooden floor.

non_diegetic_music:
  A gentle piano melody transitions to a warmer, more uplifting tone as the woman enters.
```

---

## 📐 Ref2VA 格式（全参考模式）

当有**多个参考图**（≥2 张，通常包括角色图、场景图、道具图、上一镜结尾帧等）时，使用 **6 个字段** 的结构。

### 结构（6 个字段）

```
subject_definitions:
  给每个参考素材分配标签和说明

summary:
  任务摘要（一段话）

retention_analysis:
  每个参考素材的保留程度分析

detailed_description:
  详细画面描述（350-500 词，英文）

overall_soundscape:
  环境音

non_diegetic_music:
  配乐
```

---

### 写法要点

#### 1. subject_definitions（素材定义）

为每个参考图分配标签：
- `<Subject N>`：角色（用于描述人物）
- `<Picture N>`：图片素材（用于描述场景、道具、构图）
- `<Video N>`：视频素材（如果有）
- `<Audio N>`：音频素材（如果有）

**格式**：一行一个，说明它代表什么

```
<Subject 1> A young man in a gray coat, from <Picture 4>.
<Subject 2> A woman in a red scarf, from <Picture 5>.
<Subject 3> The cafe interior with warm lighting, from <Picture 3>.
<Picture 1> The first frame showing <Subject 1> sitting alone.
<Picture 2> The last frame showing <Subject 1> standing up.
```

**规则**：
- 角色图（`referenceImageUrls` 中的角色外观参考）用 `<Subject N>`
- 场景图用 `<Subject N>`（如果场景是主体）或 `<Picture N>`（如果场景是背景）
- 首帧（`firstFrameUrl`）通常是 `<Picture 1>`
- 尾帧（`lastFrameUrl`）通常是 `<Picture 2>`
- 上一镜结尾帧（接戏时）也是 `<Picture N>`

#### 2. summary（任务摘要）

一段话，用前缀标注任务类型：
- `[reference generation]`：基于参考生成新视频
- `[video editing]`：编辑已有视频
- `[continuation]`：接续上一镜

概述目标视频和如何使用各个参考素材。

```
[reference generation] Generate a 5-second video showing <Subject 1> waiting in <Subject 3>, then <Subject 2> arrives. <Picture 1> serves as the starting composition. <Picture 4> and <Picture 5> define character appearances. <Picture 3> establishes the spatial environment.
```

#### 3. retention_analysis（保留度分析）

每个参考素材一行，说明保留程度：

**视觉素材**：
- `fully_preserved`：完全保留（如首帧构图）
- `partially_preserved`：部分保留（如环境参考，保留布局和光照）
- `attribute_transfer`：属性迁移（如角色外观应用到画面中的人物）
- `weak_reference`：弱参考（仅作灵感）

**音频素材**：
- `fully_copy`：完全复制
- `partially_copy`：部分复制
- `reference`：参考
- `weak_reference`：弱参考

```
<Picture 1>: fully_preserved (opening frame)
<Picture 3>: partially_preserved (environment reference, lighting and layout retained)
<Picture 4>: attribute_transfer (character appearance and clothing applied)
<Picture 5>: attribute_transfer (character appearance transferred)
```

#### 4. detailed_description（详细描述）

与 Base 模式的 `integrated_multimodal_description` 类似，但：
- **长度要求**：350-500 词（英文）
- 在画面中插入 `<Subject N>` / `<Picture N>` 标签
- 仍然使用 `[Shot 1]` / `[Shot 2] At MM:SS.mmm` 标记镜头
- 台词格式相同：`(S1) says: <d>[Chinese] ...</d>`

```
[Shot 1] From <Picture 1>, live-action, cinematic style. <Subject 3> The cafe interior with warm lighting, wooden tables and vintage decor. <Subject 1> sits at a corner table, nervously tapping his fingers. His eyes keep glancing toward the door. The camera slowly pushes in.

[Shot 2] At 00:03.000, the camera cuts to the entrance. The door opens, and <Subject 2> walks in with a bright smile. She says: <d>[Chinese] 不好意思，来晚了。</d> <cutoff>
```

#### 5 & 6. overall_soundscape / non_diegetic_music

与 Base 模式相同。

---

### 示例：Ref2VA 模式（5 秒，多参考图）

```
subject_definitions:
  <Subject 1> A young man in a gray coat, from <Picture 4>.
  <Subject 2> A woman in a red scarf, from <Picture 5>.
  <Subject 3> The cafe interior with warm lighting, from <Picture 3>.
  <Picture 1> The first frame showing <Subject 1> sitting alone at the table.

summary:
  [reference generation] Generate a 5-second video showing <Subject 1> waiting nervously in <Subject 3>, then <Subject 2> arrives and greets him. <Picture 1> serves as the starting composition. <Picture 4> and <Picture 5> define the character appearances. <Picture 3> establishes the cafe environment with specific lighting and decor.

retention_analysis:
  <Picture 1>: fully_preserved (opening frame composition)
  <Picture 3>: partially_preserved (environment reference, lighting and spatial layout retained)
  <Picture 4>: attribute_transfer (character appearance, clothing, and hairstyle applied to subject)
  <Picture 5>: attribute_transfer (character appearance and clothing transferred)

detailed_description:
  [Shot 1] From <Picture 1>, live-action, cinematic style. <Subject 3> The cafe interior with warm yellow lighting, wooden tables, vintage posters on brick walls, and soft shadows. <Subject 1> sits at a corner table near the window, dressed in a gray wool coat. His fingers tap rhythmically on the table surface. His eyes dart toward the entrance every few seconds, betraying his nervousness. The camera slowly pushes in with small amplitude, gradually tightening the frame on his anxious expression.
  
  [Shot 2] At 00:03.000, the camera cuts to the entrance. The wooden door swings open with a faint creak. <Subject 2>, wearing a bright red scarf over a dark coat, steps inside. Her face lights up with a warm smile as she spots <Subject 1>. She raises one hand in a small wave and says: <d>[Chinese] 不好意思，来晚了。</d> <cutoff>

overall_soundscape:
  Soft ambient cafe chatter fills the background. The gentle hum of a coffee machine. Ceramic cups clinking against saucers. Fingers tapping on wood. The door creaks as it opens. Light footsteps on the tiled floor.

non_diegetic_music:
  A gentle piano melody with slow, deliberate notes. The tempo remains steady, creating a sense of quiet anticipation that shifts to warmth as the woman enters.
```

---

## 🎯 本项目适配规则

### 1. 判断模式

- 无任何参考图 → **T2VA**
- 只有 `firstFrameUrl` → **I2VA**
- 有 `firstFrameUrl` + `lastFrameUrl` → **FL2VA**
- 有多个 `referenceImageUrls`（≥2）→ **Ref2VA**

### 2. 字符数上限

生成的 `video_prompt` 总长度（所有字段加起来）≤ **7000 字符**（英文 + 中文台词混合计数）。

**如果超出**：
- 缩短 `detailed_description` / `integrated_multimodal_description` 中的环境描述
- 但**台词必须保留**（来自 `description` 的原句）

### 3. 参考图上限

最多 **9 张**参考图（`<Picture 1>` ~ `<Picture 9>`）。

**如果 `referenceImageUrls` 超过 9 张**：
- 只使用前 9 张
- 在 `summary` 或回复中说明「仅使用前 9 张参考图」

### 4. 时长处理

根据 `duration`（秒）决定镜头数量：
- 4-6 秒：1-2 个 Shot
- 7-10 秒：2-3 个 Shot
- 11-15 秒：3-4 个 Shot

**时间戳计算**：
- Shot 1：从 0 秒开始（不写时间戳）
- Shot 2+：用 `At MM:SS.mmm` 标注切换点（如 `00:03.500` = 3.5 秒）

### 5. 台词来源

**只用 `description` 里的原句，不创作新台词**。

**提取规则**：
- 如果 `description` 有「@某某说：「...」」或「@某某：「...」」格式，提取台词
- 如果 `description` 有【镜头N】结构，每个子镜头的台词分别提取
- 保留原语言（中文台词包在 `<d>[Chinese] ...</d>` 内）

**说话人 ID 映射**：
- 按角色出场顺序分配 `(S1)`, `(S2)`, `(S3)` ...
- 如果 `description` 里有「@小明」，映射为 `(S1)`；「@小红」映射为 `(S2)`
- 全视频保持一致

### 6. 参考图标签映射

**`<Picture N>` 编号规则**：
1. `<Picture 1>` = `firstFrameUrl`（如果有）
2. `<Picture 2>` = `lastFrameUrl`（如果有 FL2VA 模式）
3. `<Picture 3>`, `<Picture 4>` ... = `referenceImageUrls[0]`, `referenceImageUrls[1]` ...（按数组顺序）

**插入位置**：
- 在该图对应的画面元素**前面**
- 如 `<Picture 3> The cafe interior...`（场景参考）
- 如 `<Picture 4> A man (S1)...`（角色参考）

### 7. 【镜头N】结构映射

如果 `description` 里有【镜头1】【镜头2】...子镜头结构：
- 每个子镜头映射为一个 `[Shot N]`
- 时间戳按 `duration` 平均分配（或根据台词长度估算）

**示例**（`description` 有 2 个子镜头，总时长 8 秒）：
```
【镜头1】@咖啡厅，@小明低头看手机，焦急等待。
【镜头2】@小红推门走入，@小明抬头，脸上露出笑容。
```

映射为：
```
[Shot 1] From <Picture 1>, ... (S1) sits, looking at his phone anxiously.
[Shot 2] At 00:04.000, ... (S2) enters. (S1) looks up and smiles.
```

---

## ⚠️ 注意事项

1. **语言**：
   - 所有描述用**英文**
   - **台词保留原语言**（中文台词不翻译）

2. **格式严格性**：
   - 字段名顶格，冒号后换行，内容缩进（YAML 风格）
   - 参考图标签必须是 `<Picture N>` / `<Subject N>` 格式（大写 P / S，有空格）
   - 台词标签必须是 `<d>[语言] ...</d>` 格式

3. **保存**：
   - 调用 `update_storyboard(storyboard_id, video_prompt)` 保存
   - `video_prompt` 参数传入完整的结构化文本（包含所有字段）

4. **兜底**：
   - 如果生成过程中出现任何困难（如参考图过多、台词过长、格式复杂），可以**降级到 Base 模式（I2VA / FL2VA）** 而不是 Ref2VA
   - 保证生成的提示词在 7000 字符以内

---

## 🔗 参考资源

- MiniMax H3 官方 GitHub：https://github.com/MiniMax-AI/MiniMax-H3
- H3 prompt-writing skills：https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing
- 官方文档（中文）：https://platform.minimaxi.com/document/video-generation-v2

---

**总结**：MiniMax H3 的提示词格式是**英文为主、结构化、多字段、多模态标签**的，与通用中文格式完全不同。请严格按照本规范生成，确保格式正确、台词保留、参考图映射准确。
