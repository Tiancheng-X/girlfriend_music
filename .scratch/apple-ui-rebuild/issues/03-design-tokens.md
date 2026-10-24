# 设计系统 tokens 定稿

Type: grilling
Status: resolved
Blocked by: 02

## Question

与用户定稿设计 tokens（落成 CSS 变量 + Motion 参数基线，写在 Answer 里，执行票据照抄）：

- **色彩**：Apple Music 深色观感与现有青蓝 hue 165 的取舍——背景基色、面板材质透明度分层、主色 / 强调色、文字层级对比
- **字阶**：标题 / 正文 / 歌词的尺寸-字重-行距-字距组合（光学尺寸原则：大字负 tracking，小字微正 tracking）
- **间距与圆角**：节奏体系、卡片 / 胶囊 / 按钮的 radius 分档
- **材质层级**：blur 强度、边光、阴影的分层（大表面更厚；轻材质不叠轻材质）
- **弹簧基线**：默认 critical damped（damping 1.0 / response 0.3–0.4）参数换算成 motion 的 bounce/duration；momentum 场景的 bounce 取值

## Answer

2026-10-24 与用户 grilling 定稿。执行票据直接照抄本节。

### 1. 色彩（决策：纯 Apple Music 复刻）

- 背景基色：近乎无彩的深灰，页面 / sheet / 面板用同色不同透明度分层——页面底 `oklch(0.145 0 0)`，面板底 `oklch(0.21 0 0 / 0.55)`（叠加材质后），浮层底 `oklch(0.26 0 0 / 0.5)`
- 强调色：Apple Music 红粉 `#fa2d48`（≈ `oklch(0.65 0.24 15)`）——播放按钮、进度条填充、激活态、歌词当前行、mini-player 播放指示
- 文字层级：主文字 `oklch(0.98 0 0)`、次级 `oklch(0.70 0 0)`、三级 `oklch(0.55 0 0)`
- 旧青蓝（hue 165）全站退役：`Base.astro` 的 `:root` 变量整体按本节重定义，`--hue` 体系删除

### 2. 氛围背景（决策：做）

- 播放时从封面提取主色（canvas 下采样 + 饱和度加权平均），在大播放器与 sheet 背后铺大半径径向渐变光晕；切歌时颜色用弹簧 / 透明度过渡换色
- 降级：`@supports not (backdrop-filter: blur(1px))` 或 reduced-transparency → 回退固定纯色底

### 3. 材质（决策：重玻璃分层，三档，禁嵌套）

- L1 大表面（mini-player、sheet 顶栏）：`blur(30px) saturate(180%)` + 顶部 1px 边光 + 大表面深阴影
- L2 面板（歌词 / 歌单面板）：`blur(20px) saturate(160%)`
- L3 小型悬浮（按钮、气泡、提示）：`blur(10px)`
- 全部带 `-webkit-backdrop-filter` 前缀（Safari ≤17）；玻璃层不嵌套 DOM（backdrop root 机制，见研究票据）

### 4. 字体（决策：系统字体栈）

`-apple-system, "SF Pro Text", system-ui, "PingFang SC", "MiSans", "Microsoft YaHei", sans-serif`

字阶（光学尺寸：大字负 tracking、松行距反比）：

| 层级 | size | weight | line-height | letter-spacing |
| --- | --- | --- | --- | --- |
| 页头大标题 | clamp(1.75rem, 4vw, 2.5rem) | 700 | 1.1 | -0.02em |
| 曲名（大） | 1.375rem | 600 | 1.25 | -0.01em |
| 歌词当前行 | 1.25rem | 600 | 1.5 | 0 |
| 正文 / 歌词其余行 | 1rem / 1.0625rem | 400 | 1.6 | 0 |
| 辅助 / 时间 | 0.8125rem | 400 | 1.4 | 0.01em |

### 5. 间距与圆角

- 间距基数 4px：4 / 8 / 12 / 16 / 24 / 32 / 48
- 圆角：卡片 / 面板 1rem；胶囊 / 圆钮 full；sheet 顶角 0.75rem

### 6. 弹簧基线（承接研究票据「Motion 库落法」的硬结论）

带 `bounce/duration` 的弹簧会丢弃速度 → **手势一律用物理参数弹簧**：

- 手势释放（sheet 开合、掷出）：`{ stiffness: 440, damping: 34 }`（≈ ζ0.8 / response 0.3）
- 普通回位 / 重定位：`{ stiffness: 250, damping: 31 }`（≈ ζ1.0 / response 0.4）
- 非手势 UI：`{ type: "spring", bounce: 0, duration: 0.4 }`
- 动量投影：`current + (v / 1000) · d / (1 − d)`，`d = 0.998`，自算投影点后交给物理弹簧（motion 的 `inertia` 不含 Apple 公式）
- 换算公式备查：`bounce = 1 − ζ`；`ω₀ = 2π / response` → `stiffness = ω₀²`，`damping = 2ζω₀`

### 7. 无障碍降级基线

- `prefers-reduced-transparency` Safari 全系不支持 → 主降级走 `@supports not (backdrop-filter: …)` + `@media (prefers-contrast: more)`（近实底 + 明确描边）
- reduced-motion：`scopeMotion(setup, { matchMedia: { reduce: "reducedMotion" } })` 分支，reduce 时位移换淡入、保留 opacity

