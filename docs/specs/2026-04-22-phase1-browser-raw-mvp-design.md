# LumaForge 第一阶段浏览器 RAW 风格化工具设计稿

- 日期：2026-04-22
- 仓库：`LumaForge`
- 状态：`Approved for planning`
- 文档类型：第一阶段产品与技术共识文档
- 范围：仅覆盖第一阶段 MVP 的产品边界、架构分层、状态模型、流程、错误恢复、验收约束；不包含代码实现细节

## 1. 背景与目标

LumaForge 第一阶段的目标，不是做一个浏览器版 Lightroom 专业能力完整搬进 Web 前端，而是验证一个更聚焦的产品命题：

`浏览器本地 RAW 风格化工具`

第一阶段对用户承诺的核心价值是：

- 无需安装软件
- 默认本地处理
- 上传单张 RAW 后尽快看到图
- 能快速套内置风格或自定义 `.cube` LUT
- 能导出可分享的 JPEG

第一阶段对产品的核心验证是：

- `浏览器即开即用` 的心智能否成立
- `RAW + 风格化 + 导出分享图` 是否能形成比传统修图更轻的使用路径
- 在不进入桌面级 RAW 显影器竞争维度的前提下，能否建立差异化定位

本设计稿建立在以下上下文之上：

- 当前 `LumaForge` 仓库已存在 `lib/raw`、`lib/lut`、`lib/gl`、`lib/color`、`raw-processor` 等底层能力雏形
- 已验证“标准化输入色彩管线”对 LUT 准确性的价值
- 第一阶段不做代码实现，只沉淀产品与技术共识文档，为后续长自主性开发提供稳定输入

## 2. 第一阶段产品边界

### 2.1 产品定义

第一阶段将 LumaForge 定义为：

`一个运行在现代桌面浏览器中的本地 RAW 风格化工具`

其唯一主流程为：

`上传单张 RAW -> 快速预览 -> 选择内置预设或上传自定义 LUT -> 调整风格强度 -> 原图/效果图对比 -> 导出 JPEG`

### 2.2 第一阶段必须支持

- 单张 RAW 上传
- 拖拽上传与点击文件选择
- 快速预览
- bounded HQ 预览
- 至少 8 个内置预设
- 自定义 `.cube` 3D LUT 上传
- 风格强度调节
- 原图 / 效果图对比
- 基础视图交互：fit、缩放、平移、重置视图
- JPEG 导出
- 导出质量选择
- 导出精细度配置与失败重试
- 本地处理与隐私说明

### 2.3 第一阶段明确不做

- 专业级 RAW 显影参数体系
- 批量处理
- 项目保存
- 账号体系
- 云端处理
- AI LUT / AI 调色
- 相机风格写回
- TIFF / PNG / WebP 作为产品级导出选项
- 视频支持
- 局部调色与蒙版
- LUT 输入 Log 空间手动选择界面

### 2.4 兼容性边界

- 第一阶段正式支持桌面现代浏览器，前提是支持 `WebGL2`
- `WebGL2` 为硬门槛，不做 CPU 软降级主路径
- Firefox、iPad 浏览器、移动端浏览器仅做 best effort
- 正式体验承诺以桌面浏览器为主，移动端不作为第一阶段核心 KPI

## 3. 总体架构

### 3.1 架构目标

第一阶段采用：

`分层会话架构 + 双轨渲染语义`

目标不是构建两套引擎，而是在保持产品极简的前提下，为后续专业化扩展预留明确接口。

### 3.2 总体分层

1. `Capability Gate`
   负责浏览器能力探测与 WebGL2 硬门槛判断。

2. `Image Session`
   负责单图会话生命周期、状态聚合、导出资格派生规则。

3. `Decode & Preview`
   负责 `embedded preview -> quick preview -> bounded HQ preview` 三段式图像资产产出。

4. `Style Asset Layer`
   负责内置预设与自定义 LUT 的统一建模与语义区分。

5. `Render Core`
   负责共享 WebGL2 渲染路径：
   `normalized input -> optional calibrated prep -> LUT -> intensity blend -> display/output`

6. `Export Pipeline`
   负责原始分辨率 JPEG 导出、精细度档位、失败后的降级重试。

### 3.3 核心原则

- 产品层只暴露 MVP 能力，不暴露现有代码中超出 MVP 的专业参数
- 预览链路与导出链路分离
- 内置预设与自定义 LUT 共享一套渲染内核，但语义不同
- 标准化输入色彩管线思想

## 4. 状态模型与核心数据对象

### 4.1 建模原则

- 不使用单一全局巨型状态枚举
- 按职责拆分状态域：能力、会话、预览、风格、渲染、导出
- `canExport` 等资格类状态作为派生规则，不作为人工维护字段
- `viewState` 与图像处理参数分离

### 4.2 核心对象

#### RuntimeCapability

```ts
type RuntimeCapability = {
  webgl2Supported: boolean
  maxTextureSize: number
  max3DTextureSize: number
  memoryTier: 'low' | 'normal' | 'high'
  supportStatus: 'supported' | 'unsupported'
}
```

#### SourceRawFile

```ts
type SourceRawFile = {
  name: string
  extension: string
  sizeBytes: number
  rawFormat?: string
  cameraBrand?: string
  cameraModel?: string
  width?: number
  height?: number
  supportLevel: 'official' | 'experimental' | 'unsupported'
}
```

#### PreviewAsset

```ts
type PreviewAsset = {
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'skipped'
  width?: number
  height?: number
  handle?: string
  errorCode?: string
}
```

#### PreviewBundle

```ts
type PreviewBundle = {
  embeddedPreview: PreviewAsset
  quickDecodePreview: PreviewAsset
  boundedHqPreview: PreviewAsset
  displaySource: 'embedded' | 'quick' | 'bounded-hq' | 'none'
  boundedHqRequiredForExport: false
}
```

#### StyleAsset

```ts
type StyleAsset = {
  kind: 'builtin' | 'custom'
  name: string
  defaultIntensityLevel: 'light' | 'standard' | 'strong'
  currentIntensityLevel: 'off' | 'light' | 'standard' | 'strong'
  warning?: string
  lutAsset?: {
    format: 'cube'
    dimension: 17 | 33 | 65
    title?: string
  }
  inputPrepProfile?: {
    profileId: string
    description: string
  }
}
```

#### ViewState

```ts
type ViewState = {
  mode: 'processed' | 'original'
  zoom: number
  panX: number
  panY: number
  fitMode: 'screen' | 'custom'
}
```

#### RenderState

```ts
type RenderState = {
  status: 'idle' | 'preparing' | 'rendering' | 'ready' | 'failed'
  lastRenderSource?: 'embedded' | 'quick' | 'bounded-hq'
  lastErrorCode?: string
}
```

#### ExportState

```ts
type ExportState = {
  status: 'idle' | 'preparing' | 'exporting' | 'done' | 'failed'
  qualityPreset: 'standard' | 'high'
  fidelityLevel: 'safe' | 'balanced' | 'max'
  recommendedRetryLevel?: 'safe' | 'balanced'
  lastSuccessfulSize?: { width: number; height: number }
  lastErrorCode?: string
  retryRecommended: boolean
}
```

#### ImageSession

```ts
type ImageSession = {
  id: string
  createdAt: number
  sourceFile: SourceRawFile
  previewBundle: PreviewBundle
  activeStyle: StyleAsset | null
  viewState: ViewState
  renderState: RenderState
  exportState: ExportState
}
```

### 4.3 派生规则

- `canEdit`：任一可显示预览资产 ready
- `canExport`：`quickDecodePreview.ready` 且当前风格合法且无进行中的导出任务且渲染状态未失败；原始分辨率导出还必须满足 runtime export capability
- `supportBadge`：基于 `sourceFile.supportLevel` 派生为 `official` 或 `experimental`

## 5. 预览 / 解码 / 渲染主流程

### 5.1 会话建立

上传文件后先完成轻量同步检查：

- 能力门禁
- 文件格式检查
- 替换当前会话确认
- 支持级别初判

通过后立即创建新的 `ImageSession`，并使旧会话的异步任务全部失效。

硬规则：

`先创建新会话，再启动异步任务`

### 5.2 三段式预览链路

第一阶段的预览资产生成链路为：

1. `embedded preview extraction`
2. `quick decode preview`（不超过 `2.5MP`）
3. `bounded HQ decode`（默认目标约 `8MP` 到 `12MP`）

生成优先级：

`embedded first impression -> quick interactive asset -> bounded HQ background upgrade`

显示优先级：

`bounded-hq > quick > embedded > none`

硬规则：

- preview 永远不生成原始分辨率 RGB 资产
- quick ready 后即解除阻塞，允许 LUT、对比、视图操作和导出资格计算
- bounded HQ 只作为后台静默升级；成功则替换显示资产，失败、跳过或取消则保留 quick
- quick 与 bounded HQ 的缩图必须发生在返回应用层 JavaScript、上传 WebGL texture、转 display sRGB 之前

### 5.3 预览状态规则

- 如果 embedded preview ready，应尽快显示首个可见图像
- 如果 embedded preview 不可用或失败，应自动回退到 quick preview
- bounded HQ decode 始终作为后台机会升级路径
- 快速预览 ready 后即可进入编辑态
- bounded HQ ready 不作为编辑态或可导出态前置条件

### 5.4 渲染链路

统一渲染链路定义为：

`display asset -> normalize -> optional input prep -> LUT -> intensity blend -> view transform`

其中：

- `normalize` 为共享步骤
- `optional input prep` 主要服务内置预设
- `custom LUT` 默认走通用路径
- `view transform` 只负责显示层，不改变导出链路源数据

### 5.5 原图 / 效果图对比

对比模式只切换 render path 是否经过风格阶段，不重新解码、不重置视图。

必须保证：

- 不重置缩放和平移
- 不改变 active style
- bounded HQ 升级时保留当前对比模式

### 5.6 bounded HQ 升级

当 bounded HQ ready 后，系统执行“输入资产升级”，但不重建编辑页。

必须保留：

- 当前 active style
- 当前强度档位
- 当前 viewState
- 当前对比模式
- 当前错误和 warning 上下文

## 6. 风格资产模型与双轨语义

### 6.1 设计目标

第一阶段需要同时成立以下语义：

- 内置预设不是简单内置 `.cube`
- 自定义 LUT 是合法能力，但属于 best effort
- 两者共享渲染内核
- UI 保持极简，不暴露专业控制面板

### 6.2 内置预设

内置预设定义为：

`第一方风格包`

每个内置预设应至少包含：

- `id`
- `name`
- `kind: builtin`
- `description`
- `defaultIntensityLevel`
- `inputPrepProfile`
- `lutAsset`
- `warnings`
- `supportNotes`

内置预设允许声明：

- 标准化输入配方
- 内部颜色准备步骤
- 默认强度档位
- 轻量提示文案

### 6.3 自定义 LUT

自定义 LUT 定义为：

`用户上传的通用 3D .cube 资产`

第一阶段支持约束：

- 仅支持 `.cube`
- 仅支持 3D LUT
- 至少支持 `17 / 33 / 65`
- 同一时刻仅允许一个激活的自定义 LUT
- 刷新页面后默认不保留

### 6.4 双轨语义

第一阶段使用一套共享 `Render Core`，但接受两类 style plan：

- `BuiltinStylePlan`
  `normalized input -> builtin input prep -> builtin LUT -> intensity blend`

- `CustomStylePlan`
  `normalized input -> generic path -> custom LUT -> intensity blend`

差异只在 `input prep` 与产品语义，不在 GPU 执行模型本身。

### 6.5 风格强度

第一阶段保留风格强度能力，但不追求专业级连续精密调节。

产品语义定义为：

`final = mix(originalNormalizedOutput, styledOutput, intensityLevel)`

第一阶段默认采用有限档位，而不是连续滑杆。建议档位为：

- `off`
- `light`
- `standard`
- `strong`

要求：

- `off` 等于原图
- `standard` 为默认档
- builtin 与 custom 共享同一套强度语义

### 6.6 风格切换规则

- 同一时刻只允许一个激活风格来源：内置预设或自定义 LUT
- 风格切换不触发重新解码
- 风格切换不重置视图状态
- bounded HQ 未 ready 时，先对当前可见预览资产应用风格
- bounded HQ ready 后自动升级显示资产，但不改变当前风格状态

## 7. 导出架构与精细度策略

### 7.1 预览导出分离

第一阶段必须严格区分：

- `预览链路`
- `导出链路`

编辑区显示的是交互预览，不是导出的直接像素来源。

原因：

- 屏幕分辨率不等于原图分辨率
- 屏幕画布受 DPR 与 fit-to-screen 影响
- 大图导出不能与预览交互互相污染

### 7.2 导出规则

导出目标：

- 原始分辨率为目标
- 输出格式固定为 `JPEG`
- 输出色彩固定为 `sRGB`
- 输出位深固定为 `8-bit`

仅在以下条件满足时允许导出：

- quick preview ready
- runtime export capability 满足当前导出路径
- 当前风格合法
- 当前无进行中的导出任务
- 当前渲染状态未处于致命失败

### 7.3 导出参数

第一阶段导出参数分为两类：

#### JPEG 质量

- `standard`
- `high`

#### 导出精细度

- `safe`
- `balanced`
- `max`

规则：

- 默认质量由用户选择
- 默认精细度为 `balanced`
- 失败后系统必须给出降档重试建议
- 精细度是计算档位，不是用户可见的“色彩风格参数”

### 7.4 失败后的降档重试

导出失败后的正式恢复流为：

`export failed -> reason classified -> retry recommendation produced -> user retries with lower fidelity`

建议规则：

- `max` 失败，推荐 `balanced`
- `balanced` 失败，推荐 `safe`
- `safe` 仍失败，提示当前设备无法完成该图导出

### 7.5 导出文件名

导出命名规则：

`{originalFileName}_{styleNameOrCustom}.jpg`

其中：

- 内置预设使用预设名
- 自定义 LUT 使用 `custom`
- 无风格时使用 `original`

### 7.6 导出任务模型

每次导出以 `ExportJob` 形式执行，并冻结：

- 当前 source session 与 export capability snapshot
- 当前 active style
- 当前 view-independent export options

要求：

- 导出失败不破坏当前编辑状态
- 导出期间可继续查看当前图片
- 替换文件或重置会话会使当前导出任务失效

## 8. 错误处理与支持矩阵

### 8.1 错误分层

第一阶段将错误分为四层：

1. `能力层错误`
2. `输入层错误`
3. `处理中错误`
4. `会话污染防护`

### 8.2 能力层错误

适用场景：

- 浏览器不支持 WebGL2
- GPU 初始化失败
- 无法建立基础渲染上下文

策略：

- 直接进入不支持页
- 不进入编辑流程
- 提供更换浏览器或设备建议

### 8.3 输入层错误

适用场景：

- 文件格式不支持
- RAW 文件损坏
- RAW 解码失败
- LUT 文件不合法
- LUT 维度不支持

策略：

- 拒绝当前输入资产
- 不打坏应用整体可用性
- RAW 错误影响会话建立
- LUT 错误只影响当前风格切换

### 8.4 处理中错误

规则：

- embedded fail：静默回退到 quick 或 bounded HQ
- quick fail：若无法得到可编辑预览，当前会话进入可恢复错误；不得等待 full-resolution preview
- bounded HQ fail：保留 quick 预览与当前编辑状态，不禁用已满足条件的导出
- render fail：保留会话，允许清除风格或切回原图
- export fail：保留编辑状态，推荐降档重试

硬原则：

`只丢失失败的那一层，不回滚已经成功的层`

### 8.5 会话污染防护

硬规则：

`任何异步任务结果只有在 sessionId 仍匹配时才允许提交`

适用任务：

- preview extraction
- quick decode
- bounded HQ decode
- LUT parse
- render completion
- export completion

### 8.6 支持矩阵

支持级别定义：

- `official`：可解码且在测试矩阵内
- `experimental`：可解码但未纳入官方验证
- `unsupported`：无法进入有效处理链路

产品行为：

- `official`：正常完整流程
- `experimental`：允许上传、编辑、导出，但显示轻量提示
- `unsupported`：明确拦截或失败提示，不伪装成“处理中”

### 8.7 错误码前缀

建议使用稳定前缀体系：

- `CAP_*`
- `RAW_*`
- `LUT_*`
- `RENDER_*`
- `EXPORT_*`

要求：

- UI 文案不直接暴露堆栈信息
- 埋点记录错误码，不记录敏感文件内容

## 9. 页面与交互结构

### 9.1 页面语义

第一阶段页面可收束为三种屏幕：

- `入口态`
- `编辑态`
- `拦截态`

### 9.2 入口态

上传页职责：

- 说明产品是什么
- 接收单张 RAW 输入
- 提前说明本地处理
- 提示支持边界

上传页只保留：

- 一句话价值说明
- 主上传区
- 支持格式简述
- 本地处理说明
- 浏览器支持提示

不在上传前暴露风格、导出或高级参数。

### 9.3 编辑态

编辑页采用单屏工作台结构，分为四区：

#### 顶部操作栏

- 文件名
- 支持级别标识
- 替换文件
- 重置会话
- 导出入口

#### 中央预览区

- 图像显示
- 缩放、平移、fit to screen
- 原图 / 效果图对比
- 状态覆盖层

#### 右侧风格面板

- 内置预设列表
- 自定义 LUT 上传
- 当前风格说明与 warning
- 强度档位控制
- 清除当前风格

#### 底部或浮层状态区

- 当前预览状态
- 当前导出资格
- 当前错误或 warning
- 推荐恢复动作

### 9.4 拦截态

适用于：

- 浏览器不支持
- GPU 初始化失败
- 无法建立主流程

页面需要明确回答：

- 为什么不能继续
- 推荐去哪里继续
- 是否可以重试

### 9.5 文件替换与重置

规则：

- 替换文件需确认
- 替换文件后创建新会话并使旧任务失效
- 替换文件时保留当前激活风格选择
- 替换文件时重置视图状态
- `重置会话` 与 `重置风格` 必须是两个不同动作

### 9.6 强度与对比交互

强度交互：

- 第一阶段默认采用有限档位
- 不暴露专业连续滑杆

对比交互：

- 至少支持原图 / 效果图切换
- 不重置视图
- 不触发重新解码

### 9.7 UI 暴露硬约束

第一阶段编辑页只暴露与“风格化”直接相关的控制。

现有代码中的以下能力不进入第一阶段产品 UI：

- `logSpace`
- `exposure`
- `saturation`
- `contrast`
- `TIFF/PNG` 导出选项

## 10. 模块拆分与代码边界

### 10.1 顶层模块

建议拆分为以下业务模块：

- `capability-gate`
- `image-session`
- `preview-pipeline`
- `style-system`
- `render-core`
- `export-system`

### 10.2 各模块职责边界

#### capability-gate

- 负责浏览器能力探测
- 不参与文件解析
- 不参与风格或导出逻辑

#### image-session

- 负责单图会话生命周期
- 负责状态聚合与资格派生
- 不直接执行解码或渲染

#### preview-pipeline

- 负责 preview 资产生成
- 不负责风格化和导出

#### style-system

- 负责预设注册、LUT 解析、style plan 生成
- 不直接管理会话与页面

#### render-core

- 负责共享 WebGL2 渲染
- 不感知官方支持与实验性支持等产品语义

#### export-system

- 负责导出任务与失败恢复
- 不复用屏幕 canvas 作为最终输出来源

### 10.3 依赖方向

建议保持单向依赖：

- UI 依赖 `image-session` 暴露的产品语义接口
- `image-session` 协调 `preview-pipeline`、`style-system`、`export-system`
- `render-core` 被编辑预览与导出链路共享消费
- 下层模块不得反向依赖页面模块

### 10.4 现有代码处理策略

#### 保留

- `src/lib/raw`
- `src/lib/lut`
- `src/lib/gl`
- `src/lib/color`
- 可复用的导出底层工具

#### 收束

现有超出 MVP 的产品暴露能力降为：

- 内部实现细节
- 调试能力
- 第二阶段候选能力

包括：

- `logSpace`
- `exposure`
- `saturation`
- `contrast`
- `TIFF/PNG` 产品入口

#### 隔离

现有 `raw-processor` 模块应从“全能页面”收束为编辑工作台壳层，不再直接统管所有状态与执行逻辑。

### 10.5 治理规则

任何新增能力进入第一阶段主 UI 之前，必须先回答两件事：

- 它归属哪个模块
- 它是否改变第一阶段产品边界

## 11. 非功能需求与验收建议

### 11.1 性能验收节点

第一阶段性能验收按以下节点观察：

- 首个可见图像时间
- quick 可编辑时间
- bounded HQ 静默升级时间
- 风格切换响应
- 导出完成时间

目标语义：

- 带 embedded preview 的常见 RAW，在官方支持桌面环境中应尽量在约 1 秒级出现首个可见图像
- 常见 24MP 级 RAW 的 quick 可编辑目标为约 2 到 4 秒
- bounded HQ 是后台机会升级，失败时应静默保留 quick
- 高像素测试 RAW 不允许因为 full-resolution preview 解码导致页面崩溃
- 风格切换应具备明显即时反馈
- 导出应在数秒级完成；失败时应优先进入降级重试，而不是长时间无反馈

### 11.2 稳定性

第一阶段稳定性要求：

- 常见测试 RAW 不应导致页面崩溃
- 局部失败必须可恢复
- 替换文件后旧状态不污染新会话
- 导出失败不破坏当前编辑状态

### 11.3 隐私与本地处理

产品层要求：

- 上传页与编辑页必须展示本地处理说明

数据层要求：

- 不上传图像像素内容
- 不上传 LUT 文件内容
- 不上传原始文件名
- 仅允许匿名事件、能力摘要、错误码、支持级别、导出参数等非敏感元数据

### 11.4 可观测性

建议埋点事件：

- `page_open`
- `upload_start`
- `upload_success`
- `upload_fail`
- `first_preview_ready`
- `quick_preview_ready`
- `bounded_hq_ready`
- `bounded_hq_fail`
- `style_builtin_select`
- `style_custom_upload_success`
- `style_custom_upload_fail`
- `export_click`
- `export_success`
- `export_fail`
- `error_shown`

建议属性：

- `browser`
- `os`
- `raw_format`
- `support_level`
- `camera_brand`
- `file_size_bucket`
- `style_kind`
- `export_quality`
- `export_fidelity`
- `error_code`

### 11.5 最小验收样本集

建议至少准备以下样本：

- 3 组官方支持机型样张
- 2 组实验性支持样张
- 1 组损坏或不可解码 RAW
- 2 组合法 `.cube`
- 2 组非法 `.cube`
- 1 组高像素压力样张
- 1 组导出降级重试场景

## 12. 不纳入第一阶段的内容

以下能力不进入第一阶段实现：

- 批量导入与批量导出
- 项目保存与恢复
- 账号体系
- 云端处理
- AI LUT 与 AI 推荐
- 专业 RAW 调参面板
- LUT 输入色彩空间手动选择器
- 局部蒙版、曲线、白平衡、降噪、锐化、镜头校正完整体系
- TIFF / PNG / WebP 产品级导出
- 视频支持
- 相机写回

## 13. 后续规划输入约束

### 13.1 本设计稿的地位

本设计稿是第一阶段开发的最高边界文档，用于约束：

- 产品范围
- 状态模型
- 模块边界
- 错误恢复逻辑
- 验收语义

### 13.2 后续实施计划的输入规则

后续 implementation plan 必须遵守：

- 不得扩展第一阶段产品边界
- 必须引用本文档中的模块命名与状态语义
- 若实现中发现设计缺口，应先补文档再继续编码
- 现有仓库中的超纲能力不自动进入第一阶段计划

### 13.3 文档驱动开发规则

后续长自主性开发应遵守：

- 以本文档为第一阶段范围基线
- 任何超出本文档边界的用户可见能力，必须先修改本文档
- 代理执行时必须优先复用本文档中的术语，不得自行创造并行概念
- 设计稿与实施计划分离维护，避免任务清单污染设计边界

### 13.4 下一份文档

在本设计稿确认后，下一份文档应为：

`第一阶段 implementation plan`

该文档只回答：

- 先做什么
- 后做什么
- 哪些任务可并行
- 各模块的验收条件是什么

而不重新讨论本设计稿已经确认的产品边界。
