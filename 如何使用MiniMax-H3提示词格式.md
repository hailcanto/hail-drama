# 如何使用 MiniMax H3 提示词格式

## 📌 当前系统的绑定机制

### 1. 数据库层面

**表**: `episodes`（剧集表）

**关键字段**:
```sql
video_config_id  -- 锁定的视频配置 ID（指向 ai_service_configs 表）
```

**表**: `ai_service_configs`（AI 服务配置表）

**关键字段**:
```sql
id          -- 配置 ID
name        -- 配置名称（用户可见，如「MiniMax H3 配置」）
provider    -- 提供商（minimax / aiask / comfyui / xai 等）
model       -- 模型名（MiniMax-H3 / grok-imagine-video-1.5 等）
is_active   -- 是否启用
```

---

## 🔄 当前工作流程（v1.1.7）

### 步骤 1：创建 AI 服务配置

1. 打开「**设置**」页面
2. 找到「**AI 服务配置**」部分
3. 点击「**添加视频配置**」
4. 填写：
   - **名称**：`MiniMax H3 配置`（自定义，方便识别）
   - **提供商**：选择 `minimax` 或 `comfyui`
   - **模型**：`MiniMax-H3`（如果是 ComfyUI，在工作流设置里选）
   - **API Key** / **Base URL** 等认证信息
5. **启用**该配置（开关打开）
6. 保存

此时 `ai_service_configs` 表会插入一条记录，假设 `id = 5`，`provider = 'minimax'`，`model = 'MiniMax-H3'`。

---

### 步骤 2：创建剧集时自动绑定

**自动绑定逻辑**（`backend/src/routes/episodes.ts` 第 24-27 行）：

```typescript
// 创建新集时，自动锁定当前启用的最高优先级视频配置
const videoConfigId = body.video_config_id ?? await getActiveConfigId('video')
```

- 如果你在创建集时手动指定了 `video_config_id`，使用指定的
- 否则，自动选择**当前启用的、优先级最高的视频配置**

**结果**：新剧集的 `episodes.video_config_id = 5`（绑定到 MiniMax H3 配置）

---

### 步骤 3：生成视频提示词

**前端操作**（`frontend/app/views/drama/episode.vue`）：

1. 打开剧集的「**制作**」页面（`/drama/:dramaId/episode/:episodeId`）
2. 顶部工具栏会显示：
   - **文本模型**（用于 Agent）
   - **图片模型**
   - **视频模型** ← 这里显示当前生效的视频配置
   - **分辨率**

3. 在「**分镜**」区域，点击「**批量生成提示词**」按钮

---

### 步骤 4：后端读取配置并传给 Agent

**代码位置**: `backend/src/services/video-prompts.ts` 第 45-51 行

```typescript
// 读取该集锁定的视频配置
const [ep] = await db.select().from(schema.episodes)
  .where(eq(schema.episodes.id, episodeId))

let videoLabel = '默认'
if (ep?.videoConfigId) {  // 读取 video_config_id
  const [cfg] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, ep.videoConfigId))
  if (cfg) videoLabel = `${cfg.name} (${cfg.provider})`
  // 示例：videoLabel = 'MiniMax H3 配置 (minimax)'
}
```

然后在第 78 行传给 `prompt_generator` Agent：

```typescript
await agent.generate([{
  role: 'user',
  content: `请为分镜生成视频提示词(video_prompt)。
视频模型: ${videoLabel}  // ← 这里会显示 'MiniMax H3 配置 (minimax)'
请根据该模型的特性和时长限制生成。
...`
}])
```

---

### 步骤 5：Agent 生成提示词

**当前行为**（v1.1.7）：

Agent 读取 `workspace/prompts/prompt_generator.md` 和 `workspace/skills/prompt-generator/video-prompt/SKILL.md`，按**通用格式**生成提示词：

```
出场人物：@小明、@小红；场景：@咖啡厅。
0-3秒：@咖啡厅，近景固定镜头，@小明低头看手机...
3-6秒：切到门口全景，@小红推门走入...
```

**问题**：Agent 虽然知道模型是 `MiniMax H3 配置 (minimax)`，但**没有针对 MiniMax H3 的专用生成规范**，所以仍然按通用格式生成。

---

## ❌ 当前缺失的部分

### 1. 缺少模型标签映射

**文件不存在**: `backend/src/services/video-model-tags.ts`

**作用**: 根据 `provider` 和 `model` 返回模型标签（如 `minimax-h3`）

**示例**:
```typescript
resolveModelTag('minimax', 'MiniMax-H3')  // 应返回 'minimax-h3'
resolveModelTag('comfyui', 'wan-2.2-14b') // 应返回 'comfyui-default'
```

### 2. Agent 调用时未注入模型标签

**文件**: `backend/src/services/video-prompts.ts` 第 78 行

**当前代码**:
```typescript
content: `请为分镜生成视频提示词。
视频模型: ${videoLabel}  // 只有配置名，没有标签
...`
```

**需要改成**:
```typescript
const modelTag = resolveModelTag(cfg.provider, cfg.model)  // 新增

content: `请为分镜生成视频提示词。
视频模型: ${videoLabel}
模型标签: ${modelTag}  // ← 新增，告诉 Agent 用哪个格式
...`
```

### 3. 缺少 MiniMax H3 专用 SKILL 文件

**文件不存在**: `backend/workspace/skills/prompt-generator/video-prompt/minimax-h3.md`

**作用**: 详细说明 MiniMax H3 的提示词格式（6 个字段、英文、`<Picture N>` 标签等）

### 4. Agent 主指令未说明模型选择逻辑

**文件**: `backend/workspace/prompts/prompt_generator.md` 第 22-30 行

**当前内容**:
```markdown
## 视频提示词

用户请求会告知要为哪个分镜生成视频提示词。

工作流程：
1. 调用 read_storyboard_context 读取分镜信息
2. 据此生成 video_prompt
...
```

**需要改成**:
```markdown
## 视频提示词

用户请求会告知：分镜 ID + **模型标签**（如 minimax-h3）

工作流程：
1. 调用 read_storyboard_context 读取分镜信息
2. **根据模型标签选择生成规范**：
   - 模型标签为 `minimax-h3` → 使用 `video-prompt/minimax-h3.md`
   - 模型标签为 `default` → 使用 `video-prompt/SKILL.md`
3. 按对应规范生成 video_prompt
...
```

---

## ✅ 方案实施后的工作流程（v1.2.0）

### 步骤 1-2：同上（创建配置 + 创建剧集）

### 步骤 3：生成视频提示词

点击「**批量生成提示词**」

### 步骤 4：后端读取配置 + 解析模型标签（新增）

```typescript
// video-prompts.ts
const [cfg] = await db.select()...
const videoLabel = `${cfg.name} (${cfg.provider})`
const modelTag = resolveModelTag(cfg.provider, cfg.model)  // ← 新增
// modelTag = 'minimax-h3'
```

### 步骤 5：Agent 调用时注入模型标签（修改）

```typescript
await agent.generate([{
  role: 'user',
  content: `请为分镜生成视频提示词。
视频模型: ${videoLabel}
模型标签: ${modelTag}  // ← 新增

请根据该模型的特性生成。
如果有该模型的专用规范（skill），优先使用；否则使用通用规范。
...`
}])
```

### 步骤 6：Agent 识别模型标签并选择规范（新增）

Agent 内部逻辑：

```
1. 识别 modelTag = 'minimax-h3'
2. 查找 workspace/skills/prompt-generator/video-prompt/minimax-h3.md
3. 找到了！加载该 skill
4. 按 minimax-h3.md 的格式生成提示词：
   - 英文（台词保留中文在 <d> 标签）
   - 6 个字段（Ref2VA）或 3 个字段（I2VA）
   - <Picture 1>, <Subject 1> 标签
   - [Shot 1] At 00:03.500 时间戳
   - overall_soundscape / non_diegetic_music 分离
5. 调用 update_storyboard 保存
```

### 步骤 7：生成的提示词示例

```
subject_definitions:
<Subject 1> A young man in a gray coat, from <Picture 4>.
<Subject 2> A woman in a red scarf, from <Picture 5>.
<Subject 3> The cafe interior, from <Picture 3>.
<Picture 1> The first frame showing <Subject 1> sitting alone.

summary:
[reference generation] Generate a 5-second video...

retention_analysis:
<Picture 1>: fully_preserved
<Picture 3>: partially_preserved
<Picture 4>: attribute_transfer
<Picture 5>: attribute_transfer

detailed_description:
[Shot 1] From <Picture 1>, live-action, cinematic style.
<Subject 3> The cafe interior with warm lighting.
<Subject 1> sits at a corner table, nervously tapping.
The camera slowly pushes in.

[Shot 2] At 00:03.000, the camera cuts to the entrance.
<Subject 2> walks in. She says: <d>[Chinese] 不好意思，来晚了。</d> <cutoff>

overall_soundscape:
Soft ambient cafe chatter. Coffee machine hissing.
The door creaks. Footsteps on wooden floor.

non_diegetic_music:
A gentle piano melody with slow tempo.
```

---

## 📊 对比表格

| 步骤 | 当前系统（v1.1.7）| 方案实施后（v1.2.0）|
|------|-----------------|-------------------|
| **1. 创建配置** | ✅ 设置页添加 MiniMax H3 | ✅ 相同 |
| **2. 创建剧集** | ✅ 自动绑定配置 | ✅ 相同 |
| **3. 前端操作** | ✅ 批量生成提示词 | ✅ 相同 |
| **4. 后端读取** | ✅ 读取 video_config_id | ✅ + 解析模型标签 |
| **5. Agent 调用** | ⚠️ 只传配置名 | ✅ + 传模型标签 |
| **6. 格式选择** | ❌ 统一用通用格式 | ✅ 按标签选格式 |
| **7. 生成结果** | 中文时间分段格式 | H3 英文结构化格式 |

---

## 🎯 用户操作总结

### 当前系统（v1.1.7）

你**已经在操作层面正确绑定了 MiniMax H3 配置**，但系统**还没有 H3 专用的提示词生成规范**，所以即使绑定了 H3，生成的仍是通用格式。

### 方案实施后（v1.2.0）

**操作完全相同**，但系统会**自动识别 H3 配置并按官方格式生成提示词**。

---

## 💡 关键点总结

### 绑定机制的层级

```
1. 设置页创建配置
   ↓ (配置保存到 ai_service_configs 表)
2. 创建剧集时自动/手动绑定
   ↓ (episodes.video_config_id 指向配置)
3. 生成提示词时读取配置
   ↓ (video-prompts.ts 读 episodes.video_config_id)
4. 解析模型标签
   ↓ (resolveModelTag(provider, model) → 'minimax-h3')
5. Agent 根据标签选择格式
   ↓ (加载 minimax-h3.md 或 SKILL.md)
6. 生成对应格式的提示词
   ↓ (保存到 storyboards.video_prompt)
7. 生成视频时使用该提示词
   ↓ (generation.ts → minimax-video.ts)
```

### 你当前需要做的

**前端操作**：已经正确 ✅

**缺失的部分**：后端需要实施方案（4 个文件的修改/新建）

---

## ❓ 常见问题

### Q1: 我怎么知道当前剧集绑定的是哪个配置？

**A**: 在剧集制作页顶部工具栏，「**视频模型**」下拉框会显示当前生效的配置名称。

如果该集锁定了配置，显示为「**MiniMax H3 配置**」；
如果没锁定，显示为「**默认（Grok 1.5）**」等。

### Q2: 我能手动切换视频配置吗?

**A**: 当前系统（v1.1.7）**剧集创建后不能修改 `video_config_id`**（字段存在但没有 PUT 路由）。

如果要换配置，需要：
1. 在设置页停用旧配置，启用新配置
2. 或者删除该集，重新创建

**改进建议**: 可以在剧集制作页添加「**切换视频配置**」按钮。

### Q3: 如果我同时有多个视频配置怎么办？

**A**: 新建剧集时会自动选择**优先级最高**的启用配置。

优先级在配置表 `ai_service_configs.priority` 字段（数字越大优先级越高）。

### Q4: ComfyUI 的 MiniMax H3 工作流怎么识别？

**A**: 方案中 `resolveModelTag()` 可以通过两种方式识别：

1. 检查配置的 `settings.comfyui_template` 是否包含 `minimax-h3`
2. 解析工作流 JSON，看是否包含 `MiniMaxH3` 相关节点

---

## 📝 小结

你现在的操作流程**完全正确**，唯一缺的是**系统还没有实现针对不同模型的差异化提示词生成**。

实施方案后，你**不需要改变任何操作习惯**，系统会自动根据绑定的配置生成对应格式的提示词。
