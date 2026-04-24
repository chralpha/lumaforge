# LumaForge 专用 RAW Runtime 迁移设计

> 2026-04-24 correction: This document is superseded for native runtime readiness by `docs/specs/2026-04-24-luma-raw-runtime-independent-build-design.md` and `docs/plans/2026-04-24-luma-raw-runtime-independent-build-implementation-plan.md`. The V2 measurements remain historical prototype evidence, but they do not prove an independent Luma runtime because the native build linked against local `LibRaw-Wasm` artifacts and CI did not rebuild wasm from pinned sources.

- 日期：2026-04-23
- 状态：Superseded for independent native runtime readiness
- 类型：Phase 1 后续迁移设计
- 目标包：`packages/luma-raw-runtime`
- 依赖文档：
  - `docs/specs/2026-04-22-phase1-browser-raw-mvp-design.md`
  - `docs/plans/2026-04-22-phase1-browser-raw-mvp-implementation-plan.md`
  - `ACCEPTANCE.md`

> 2026-04-24 update: The app integration and V2 performance validation are historical migration evidence. They are not sufficient release evidence for the self-owned runtime until the independent source-build and CI gates pass.

## 1. 定位

本设计不替换 Phase 1 MVP 设计，也不阻塞当前 Phase 1 实施计划。

Phase 1 仍按现有文档先完成浏览器本地 RAW 风格化闭环：

`single RAW upload -> fast preview -> HQ preview -> builtin/custom LUT -> compare -> JPEG export`

本设计定义 Phase 1 验收之后的 runtime migration，目标是把当前 app 对 `libraw-wasm` 的直接依赖迁移到 LumaForge 自己维护的性能优先 RAW runtime。

迁移后的 app 仍通过 `src/lib/raw` facade 消费 RAW 能力。UI、session、style-system、render-core、export-system 不直接依赖 wasm、LibRaw 或 worker 协议。

## 2. 迁移目标

### 2.1 产品目标

LumaForge 的核心产品定位是：

`浏览器级便捷照片风格化处理`

runtime 优先服务这个目标，而不是复刻完整专业 RAW 显影器。

第一优先级是让用户尽快看到可风格化图像，并在 HQ 结果完成后无感升级。

### 2.2 技术目标

专用 runtime 负责：

- 从不同品牌 RAW 中提取首屏 embedded preview
- 将 RAW 解码并标准化为统一中间空间
- 输出 performance-friendly 的图像 buffer
- 把 wasm、LibRaw、worker、pthread、内存策略隔离在包内
- 提供可 benchmark、可切换、可回滚的 app adapter

专用 runtime 不负责：

- React 状态
- UI 展示
- LUT 选择
- style plan 生成
- target Log 空间选择
- WebGL shader 渲染
- JPEG 导出 UI 语义

## 3. 核心决策

### 3.1 优先级

选择：`便捷体验优先`

性能预算：

- embedded preview：目标小于 1 秒
- quick preview：目标 2 到 4 秒
- 24MP HQ：目标 5 到 8 秒
- 风格切换：不重新解码，走 GPU 即时反馈

### 3.2 线程模型

主路径接受 COOP/COEP，使用 pthread / SharedArrayBuffer 版 wasm。

部署必须满足：

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- wasm asset 使用正确 MIME：`application/wasm`

runtime 初始化时检查 `crossOriginIsolated`。如果不满足，返回稳定错误码：

`RAW_CROSS_ORIGIN_ISOLATION_REQUIRED`

第一版迁移不要求单线程 fallback，但包结构必须保留未来 fallback 插槽。

### 3.3 标准中间空间

统一中间空间选择：

`Linear ProPhoto RGB`

原因：

- 与现有 `src/lib/color` 思路一致
- 色域足够大，适合作为不同品牌 RAW 的中间空间
- 能保持 runtime 与目标 LUT Log 空间解耦
- 落地成本低于 ACEScg 或 scene-linear XYZ

### 3.4 runtime 输出格式

quick/HQ 解码统一输出：

`RGB16 Linear ProPhoto`

不再输出 `Float32Array RGBA`。

目标是消除当前 JS 侧 `RGB -> Float32 RGBA` 全图扩容，并降低 worker transfer 与 GPU upload 的压力。

## 4. 架构

### 4.1 Monorepo 包边界

新增 workspace package：

`packages/luma-raw-runtime`

建议结构：

```text
packages/luma-raw-runtime/
  package.json
  tsconfig.json
  src/
    index.ts
    runtime.ts
    types.ts
    errors.ts
    worker-client.ts
    worker-protocol.ts
  worker/
    runtime.worker.ts
  native/
    libraw_wrapper.cpp
    build-libraw.sh
    emcc-flags.sh
  benchmarks/
    bench-runtime.ts
  fixtures/
    README.md
  dist/
```

root workspace 后续增加 `pnpm-workspace.yaml`：

```yaml
packages:
  - "packages/*"
```

workspace root app 继续保留现有 `package.json` app 包身份；如果后续需要根级 orchestration，再单独抽 root package。

app 依赖：

```json
{
  "dependencies": {
    "@lumaforge/luma-raw-runtime": "workspace:*"
  }
}
```

### 4.2 依赖方向

依赖方向必须单向：

`LumaForge app -> src/lib/raw adapter -> @lumaforge/luma-raw-runtime`

`@lumaforge/luma-raw-runtime` 不得依赖：

- app components
- Jotai atoms
- React
- route 模块
- style-system
- render-core
- export-system

runtime 可以定义自己的类型、错误码、worker protocol 和 benchmark 工具。

### 4.3 运行时层次

runtime 内部分为四层。

#### Runtime Loader

负责：

- 加载 wasm 和 worker
- 检查 `crossOriginIsolated`
- 初始化 pthread worker pool
- 预热 runtime
- 暴露 runtime capability

#### Worker Client

负责：

- main thread 到 runtime worker 的消息协议
- `AbortSignal` 到 cancel job 的转换
- transferable buffer 管理
- job timeout 与错误归一化

#### Runtime Worker

负责：

- 持有 wasm module 与 LibRaw wrapper
- 管理 job queue
- 串行化或池化 LibRaw 实例访问
- 确保 cancel 后不再交付大 buffer
- 返回 timings

#### Native Wrapper

C++/wasm 只暴露 LumaForge 需要的最小 API：

- `openBuffer`
- `readMetadata`
- `extractThumbnail`
- `decodePreview`
- `decodeHq`
- `disposeJob`

不要暴露完整 LibRaw 对象，也不要把 maker note 大对象无差别搬到 JS。

## 5. API 设计

### 5.1 Public Facade

```ts
export type LumaRawRuntime = {
  init(): Promise<LumaRawRuntimeInfo>
  probe(file: File, signal?: AbortSignal): Promise<LumaRawProbe>
  extractEmbeddedPreview(
    file: File,
    signal?: AbortSignal,
  ): Promise<LumaEmbeddedPreview | null>
  decodeQuick(file: File, signal?: AbortSignal): Promise<LumaRawFrame>
  decodeHq(file: File, signal?: AbortSignal): Promise<LumaRawFrame>
  dispose(): void
}
```

### 5.2 Frame 输出

```ts
export type LumaRawFrame = {
  jobId: string
  sessionId?: string
  source: 'quick' | 'hq'
  width: number
  height: number
  data: Uint16Array
  layout: 'rgb'
  bitDepth: 16
  colorSpace: 'linear-prophoto-rgb'
  orientation: number
  blackLevel?: number
  whiteLevel?: number
  metadata: LumaRawMetadata
  timings: LumaRawTimings
}
```

### 5.3 Embedded Preview 输出

```ts
export type LumaEmbeddedPreview = {
  jobId: string
  sessionId?: string
  source: 'embedded'
  width: number
  height: number
  data: Uint8Array
  mimeType: 'image/jpeg' | 'image/png' | 'application/octet-stream'
  colorSpace: 'display-srgb-preview'
  orientation: number
  timings: LumaRawTimings
}
```

embedded preview 只用于首屏显示，不作为 HQ 导出源，也不声明为 Linear ProPhoto。

### 5.4 Probe 输出

```ts
export type LumaRawProbe = {
  jobId: string
  width?: number
  height?: number
  rawWidth?: number
  rawHeight?: number
  make?: string
  model?: string
  lens?: string
  iso?: number
  aperture?: number
  focalLength?: number
  shutter?: number
  timestamp?: number
  orientation?: number
  thumbnail?: {
    width: number
    height: number
    format: 'jpeg' | 'bitmap' | 'unknown'
  }
  supportLevel: 'official' | 'experimental' | 'unsupported'
  timings: LumaRawTimings
}
```

### 5.5 错误码

```ts
export type LumaRawErrorCode =
  | 'RAW_RUNTIME_UNAVAILABLE'
  | 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED'
  | 'RAW_UNSUPPORTED_FORMAT'
  | 'RAW_OPEN_FAILED'
  | 'RAW_METADATA_FAILED'
  | 'RAW_THUMBNAIL_UNAVAILABLE'
  | 'RAW_QUICK_DECODE_FAILED'
  | 'RAW_HQ_DECODE_FAILED'
  | 'RAW_MEMORY_LIMIT'
  | 'RAW_JOB_CANCELLED'
  | 'RAW_WORKER_PROTOCOL_ERROR'
```

`extractEmbeddedPreview` 对不可用缩略图返回 `null`，不抛致命错误。

## 6. 色彩管线

### 6.1 总管线

迁移后总管线为：

`RAW -> LibRaw demosaic/process -> RGB16 Linear ProPhoto -> WebGL -> target gamut -> target Log -> LUT -> sRGB display/export`

runtime 只负责前半段：

`RAW -> RGB16 Linear ProPhoto`

render-core 继续负责：

`Linear ProPhoto -> target gamut -> target Log -> LUT`

### 6.2 LibRaw 参数建议

quick decode：

- `useCameraWb: true`
- `outputColor: ProPhoto`
- `outputBps: 16`
- `noAutoBright: true`
- `halfSize: true`
- `userQual`: 中等质量，避免极慢算法

HQ decode：

- `useCameraWb: true`
- `outputColor: ProPhoto`
- `outputBps: 16`
- `noAutoBright: true`
- `halfSize: false`
- `userQual`: 高质量但不使用明显超出浏览器预算的算法

### 6.3 风格切换原则

runtime 不知道 target Log 或 LUT。

因此：

- 切换 LUT 不触发重新解码
- 切换目标 Log 不触发重新解码
- compare 模式不触发重新解码
- HQ 升级只替换输入 frame，不改变 active style

## 7. 性能策略

### 7.1 三段式资产

#### Embedded

优先调用 LibRaw thumbnail 路径：

`unpack_thumb -> dcraw_make_mem_thumb`

成功时直接返回 JPEG/bitmap bytes。失败时返回 `null`，preview-pipeline 自动等待 quick/HQ。

#### Quick

使用 half-size decode，输出 `RGB16 Linear ProPhoto`。

quick 是第一个真实进入统一色彩管线的资产。

#### HQ

后台全尺寸 decode，输出与 quick 相同协议。

HQ ready 后执行 source upgrade，不重置：

- active style
- intensity
- compare mode
- zoom/pan
- warning/error context

### 7.2 Copy 策略

不可避免的复制：

- `File -> ArrayBuffer`
- `ArrayBuffer -> wasm memory`
- `wasm result -> JS transferable result`

必须消除的复制：

- JS 侧 `RGB -> Float32 RGBA` 全图转换
- 为了 UI 状态重复 clone 大 typed array
- preview/HQ 间无意义的双份长期驻留

runtime 输出 `Uint16Array RGB` 后，app adapter 和 WebGL upload 层需要支持 RGB16 输入。

### 7.3 内存档位

runtime 初始化后提供 memory tier：

```ts
export type LumaRawMemoryTier = 'low' | 'normal' | 'high'
```

建议策略：

- `low`：embedded + quick；HQ 需要降级或显式提示
- `normal`：embedded + quick + HQ
- `high`：允许更高像素 HQ 与导出压力测试

内存估算至少考虑：

- RAW file size
- decoded quick frame size
- decoded HQ frame size
- wasm heap
- GPU texture copy
- export hidden canvas

### 7.4 Timings

每个 job 返回分段耗时：

```ts
export type LumaRawTimings = {
  readFile?: number
  openBuffer?: number
  metadata?: number
  thumbnail?: number
  unpack?: number
  process?: number
  makeMemImage?: number
  transfer?: number
  total: number
}
```

app 层可以额外记录：

- `gpuUpload`
- `firstVisiblePreview`
- `hqReady`
- `exportRender`

## 8. 迁移计划

### 8.1 阶段边界

迁移开始条件：

Phase 1 MVP 按 `ACCEPTANCE.md` 验收完成。

本 migration 不修改当前 Phase 1 MVP 的产品范围。

### 8.2 迁移步骤

1. 新增 `packages/luma-raw-runtime`，独立 build/test/bench。
2. 基于本地 `/workspaces/LumaForge/LibRaw/LibRaw-Wasm` 创建 LumaForge 专用 native wrapper。
3. 实现 runtime facade，不接入 UI。
4. 添加 fixture benchmark，对比 npm `libraw-wasm@1.1.2`。
5. 在 app 的 `src/lib/raw` 增加 adapter 层。
6. 用 feature flag 切换：
   - `libraw-wasm adapter`
   - `luma-raw-runtime adapter`
7. 对 Phase 1 test matrix 重新跑完整手动验证。
8. 达到性能与稳定性门槛后默认切到自研 runtime。
9. 保留旧 adapter 一段稳定期，之后再决定移除。

### 8.3 Feature Flag

建议使用环境变量：

```ts
VITE_RAW_RUNTIME=libraw-wasm | luma
```

默认策略：

- migration 开发期：默认 `libraw-wasm`
- benchmark 通过后：preview/staging 默认 `luma`
- 稳定后：production 默认 `luma`

## 9. 构建与部署

### 9.1 Native build

保留并收束现有 emcc 优化方向：

- `-O3`
- `-flto`
- `-msimd128`
- `-DNDEBUG`
- `-s USE_PTHREADS=1`
- `-pthread`
- `-s MODULARIZE=1`
- `-s EXPORT_ES6=1`
- `-s ENVIRONMENT=web,worker`

建议显式设置：

- `PTHREAD_POOL_SIZE`
- `INITIAL_MEMORY`
- 是否允许 `ALLOW_MEMORY_GROWTH`

第一版可以保留 `ALLOW_MEMORY_GROWTH=1` 以提高成功率，但 benchmark 必须记录 growth 对性能的影响。

### 9.2 Vite/Asset

runtime package 输出：

- ESM entry
- worker entry
- wasm asset
- type declarations

app 不直接 import wasm 文件。asset resolution 由 runtime package 封装。

### 9.3 Vercel headers

迁移接入 app 前，Vercel 配置必须支持 cross-origin isolation。

需要检查所有第三方资源，避免 COEP 阻断字体、脚本或远程资源。

## 10. 测试与验收

### 10.1 协议测试

mock worker，不依赖真实 wasm：

- `init` 只执行一次
- `AbortSignal` 取消 job
- cancel 后不交付大 buffer
- 旧 `sessionId/jobId` 不污染新会话
- embedded fail 返回 `null`
- quick fail 不影响 HQ 编排策略
- 错误码稳定

### 10.2 Fixture 集成测试

使用小 RAW fixture 或本地样张：

- `probe` 返回 make/model/width/height/thumb info
- `extractEmbeddedPreview` 返回 JPEG 或稳定 `null`
- `decodeQuick` 输出 `RGB16 Linear ProPhoto`
- `decodeHq` 输出同协议
- quick 尺寸小于 HQ
- 同一 runtime 连续打开两张图不会复用旧状态

### 10.3 Benchmark

至少比较两条路径：

- 当前 npm `libraw-wasm@1.1.2` full decode + JS `Float32 RGBA`
- 新 runtime quick/HQ decode + `RGB16` 输出

报告指标：

- embedded total
- quick total
- HQ total
- open/unpack/process/makeMemImage
- transfer
- adapter conversion
- GPU upload
- peak memory estimate

### 10.4 色彩验收

第一版不追求专业仪器级验证，但必须满足：

- quick/HQ 均声明 `linear-prophoto-rgb`
- 默认 `noAutoBright: true`
- 同一张 RAW 的 quick/HQ 风格趋势一致
- 多品牌样张套同一 LUT 不出现明显爆亮、严重偏色或通道错位
- orientation 与 metadata 正确传递到 app

## 11. 已知风险

### 11.1 pthread 部署风险

COOP/COEP 会影响第三方资源加载。迁移接入前必须在 preview deployment 上验证。

### 11.2 wasm asset path 风险

Vite、worker、wasm asset 的相对路径在 dev/build/preview/Vercel 中可能不同。runtime package 必须封装 locateFile 或等效机制。

### 11.3 LibRaw 实例复用风险

当前本地 wrapper 中 `open()` 后需要确保所有 per-image 状态重置，包括 `isUnpacked`。连续打开多张图必须有 fixture 测试覆盖。

### 11.4 色彩解释风险

LibRaw 的 `outputColor: ProPhoto` 与 LumaForge 的 `Linear ProPhoto RGB` 假设必须通过 fixture 和视觉检查验证。如果发现 LibRaw 输出并非预期线性状态，runtime 需要显式记录并修正转换。

### 11.5 内存风险

24MP 以上 RAW 在 browser + wasm + GPU texture + export canvas 下很容易接近内存上限。memory tier 和 graceful failure 是必须项。

## 12. 非目标

本迁移不做：

- 专业 RAW 参数 UI
- 批量处理
- AI 调色
- 云端解码
- TIFF/PNG/WebP 产品级导出
- 完整 ICC/profile 管理 UI
- 手动选择 LUT 输入色彩空间 UI
- 完整相机品牌色彩科学复刻

## 13. 成功标准

迁移可以默认启用 `luma` runtime 的条件：

- Phase 1 全部自动测试仍通过
- Phase 1 手动测试矩阵仍通过
- 至少 3 个 RAW fixture 完成 embedded/quick/HQ 验证
- 24MP 级样张达到 quick 2 到 4 秒、HQ 5 到 8 秒的稳妥预算，或有明确记录说明超预算原因
- 新 runtime 相比 npm `libraw-wasm@1.1.2` 在首图时间、内存峰值或总交互体验上有明确优势
- feature flag 可快速回滚到旧 adapter

## 14. 后续扩展

迁移完成后可考虑：

- 单线程 fallback build
- wasm memory view / SharedArrayBuffer 更少复制输出
- `packages/luma-color` 抽包
- ACEScg 中间空间实验
- 更严格的色彩 fixture 与参考输出比对
- 按相机品牌建立支持矩阵和调参 profile
