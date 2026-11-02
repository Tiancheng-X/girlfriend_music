# AGENTS.md — girlfriend_music

> 给任何要改这个仓库的 Agent / 人：先读完本文再动手。域词汇表见 `CONTEXT.md`，
> 用户侧说明见 `README.md`，历史决策见 `.scratch/` 下的三张 wayfinder 地图。

## 这个项目是什么

单页静态音乐站（Astro 7 + TypeScript，零框架）：Apple Music 风沉浸式播放页 +
底部 mini-player + 队列 sheet + 设置面板。歌单来自 Meting API（网易云歌单
`8759683642`）。部署目标 Cloudflare Workers（`wrangler.jsonc` 已就绪）。

## 硬性约束

- **禁止擅自 `git commit` / `push`**——除非用户明确要求
- **禁止新增 npm 依赖**——现有依赖（astro / motion / @applemusic-like-lyrics/core / @pixi/* 七件）各有用途，见 `package.json`
- **MusicManager 的 `fm:*` 事件协议与 `window.__fireflyMusic` 形状是冻结契约**（`src/types/global.d.ts`）；唯一允许的例外是新增方法（照 `setPlayMode` 的先例：引擎实现 + global.d.ts 声明 + 记录原因）
- 改完必跑 `pnpm check`（0 错误才算过）与 `pnpm build`；UI 改动再开 preview 用浏览器实测（含移动视口）
- 文案一律走 `src/i18n/zh.ts` 的 `t()`；图标一律加进 `src/components/icon-paths.ts`（不引图标库）

## 架构分层（谁负责什么）

| 层 | 文件 | 职责 |
|---|---|---|
| 引擎 | `components/MusicManager.astro`（is:inline） | 音频状态机，`window.__fireflyMusic` 单例，`fm:*` 广播。**UI 不得绕过它直接操作 audio**（只读 `currentTime` 除外，见 amll.ts） |
| 全局外壳 | `components/MiniPlayer.astro` + `utils/sheet-controller.ts` | 流体背景挂载点、mini-player、队列 sheet 的手势与渲染 |
| 主播放区 | `components/BigPlayer.astro` + `utils/big-player-controller.ts` | 封面/控制/进度/音量/歌词面板 |
| 设置 | `utils/settings-controller.ts` | 设置面板（第二张 sheet），表单即存即用 |
| 桥接 | `utils/amll.ts` | AMLL BackgroundRender（流体背景）生命周期 |
| 手势/弹簧 | `utils/gesture.ts` + `utils/bouncing-slider.ts` | 弹簧参数、橡皮筋、动量投影、BouncingSlider、按钮弹跳 |
| 存储 | `utils/settings.ts` | `amll-settings-v1` 单键 JSON（引擎与面板两边的契约） |

样式：`styles/player.css`（背景/mini/队列/设置）与 `styles/big-player.css`（沉浸播放页）；
tokens 在 `layouts/Base.astro` 的 `:root`。

## 关键契约与坑（踩过的，别再踩）

1. **弹簧必须用物理参数**（`gesture.ts` 的 `SPRING_GESTURE`/`SPRING_REPOSITION`）。
   Motion 的 `bounce/duration` 弹簧会整体丢弃 velocity——需要速度交接的动画一律
   `stiffness/damping`（源码级结论，见 `.scratch/apple-ui-rebuild/research/02-motion.md`）。
2. **AMLL 的 LyricPlayer 有渲染缺陷**（0.5.2 / 0.6.0 均复现，隔离页证实）：数据管线健康但
   行元素不挂载。歌词因此是自研面板（`big-player-controller`）；**不要升级 AMLL 后
   假设歌词会自己好**——先跑隔离页验证。流体背景（BackgroundRender/MeshGradientRenderer）
   是好的，正在使用。
3. **收窄不跨函数声明传播**（TS）：守卫后取到的非空值要在函数声明里用，必须
   `const mgr = engine` 这种别名烘焙（仓库内多处此模式，照抄）。
4. **第二张/隐藏挂载的 sheet**：开/关必须是显式逻辑态（`app.open`），尺寸变化时把
   弹簧重映射回逻辑位置——否则隐藏时量到 0 高度、显示后 sheet 误开。
5. **`.bp-side { overflow: hidden }` 会裁掉溢出的传输行**：改传输行任何尺寸后，必须以
   `.bp-side` 的边界（而非视口）验证每个按钮完整在内（见 `.scratch/amll-rebuild/map.md`
   的教训）。极窄屏（≤350px）播放模式键收进设置页。
6. **玻璃材质不嵌套**（backdrop root）；全部带 `-webkit-backdrop-filter` 前缀；
   降级三层：`@supports not` → `prefers-reduced-transparency` → `prefers-contrast`。
7. **设置键 `amll-settings-v1` 是引擎与设置面板的双边契约**：结构改动要同步
   MusicManager 的内联读取与 `settings.ts`。
8. 封面占位 fallback 默认 `display:none`、`.is-empty` 才显示——别改回常显。
9. **sheet 的拖拽处理器会抢占指针捕获**：`pointerdown` 冒泡到 sheet 后 `sheet.setPointerCapture`
   会覆盖子控件自己的捕获，子滑杆从此收不到 move/up。凡在 sheet 内新增可拖拽控件，
   必须把它的宿主选择器加进 sheet 拖拽的排除列表（`closest("…")`）。
10. **设置项的 CSS 变量必须真有消费者**：`applySettings` 写的每个根变量，都要在
    样式表里以 `var()` 引用并写进组件的 font-size/颜色——只写不读是静默无效（歌词字号曾踩）。

## 设置键结构（`amll-settings-v1`）

```json
{ "playMode": 0, "lyricScale": 1, "bgEnabled": true, "motionReduced": false }
```

引擎读 `playMode`（init 覆盖构建配置，`setPlayMode` 写回）；其余由
`settings.ts` 的 `applySettings` 应用（歌词字号根变量、动效根类）；
背景开关由 `amll.ts` 订阅 `settings:changed` 运行时销毁/重建 canvas。

## 验证流程

```bash
pnpm check && pnpm build
pnpm preview   # 浏览器实测：桌面 1280 + 移动 390/320，手势（上拉/下甩/反向抓取）、设置逐项
```

## 历史与决策

- `.scratch/apple-ui-rebuild/`：第一轮全站重构（9 票，含 AMLL/Motion 调研与原型）
- `.scratch/amll-rebuild/`：AMLL 轮（流体背景 + 沉浸式页面 + 缺陷判定）
- `.scratch/settings-page/`：设置页（4 票）
- 原型存档分支：`prototype/apple-ui-rebuild`
- 面向人的长期说明在 `README.md`；本文只写 Agent 需要的约束与坑。
