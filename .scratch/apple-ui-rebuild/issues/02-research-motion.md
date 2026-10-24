# 研究：Motion 库落法与苹果手法映射

Type: research
Status: resolved

## Question

为「全用 Motion 库」的决策铺路，回答四件事并写进 Answer：

1. motion（motion.dev）在 Astro 静态站（无框架、原生 TS 客户端脚本）里的集成方式与按需引入：`motion` vs `motion/mini` 的取舍、体积量级、pnpm 安装与打包注意点；
2. apple-design-zh 三件套在 motion 的对应 API：可中断弹簧（`type: "spring"` 的 `bounce`/`duration` 与 damping/response 的映射）、速度交接（`velocity` 选项）、动量投影（自行计算 projected target 后交给弹簧）；
3. 玻璃材质（`backdrop-filter`）在 iOS Safari 与低端安卓的现实约束、降级策略（`prefers-reduced-transparency`、`prefers-contrast` 的配合）；
4. motion 对 `prefers-reduced-motion` 的内置支持与推荐用法。

产出推荐结论（版本、import 方式、spring 参数基线、材质降级策略、reduced-motion 用法），供「设计系统 tokens 定稿」与两张原型票据直接引用。调研细节可另存 markdown 文件并在 Answer 里链接。

## Answer

调研全文（含源码逐行核对、实测体积、逐条来源）：[research/02-motion.md](../research/02-motion.md)。结论：

1. **版本与集成**：`motion@14.6.0`（当前最新稳定版），`pnpm add motion`。在 .astro 组件的 `<script>` 里直接 `import { animate, press, drag, scopeMotion } from "motion"` —— Astro 默认对脚本做打包 + TS + 按页去重，无需任何配置。**不用 `motion/mini`**：mini 是纯 WAAPI（≈3.4 kB gzip），没有 x/y 独立变换、没有速度继承、没有中断续动语义；sheet 手势必须用 hybrid（≈24 kB gzip，官方口径 22 kb，实测 esbuild min+gzip 65.3 kB / 24.4 kB）。
2. **可中断弹簧**：motion 默认就从当前呈现值续动（MotionValue 按 element+key 常驻、keyframes 解析为 `[null, target]`、新动画自动停旧动画并回填值+速度），无需手写「读 on-screen transform」。Apple 阻尼比映射：**`bounce = 1 − ζ`**（源码 `bounceToDampingRatio`，与 SwiftUI 同式）；`response` ≈ `duration`（量纲不同，手感互换够用）。
3. **spring 参数基线（写进 tokens）**：
   - 非手势 UI：`{ type: "spring", bounce: 0, duration: 0.4 }`（≈ζ1.0/r0.4，临界阻尼）
   - sheet 开合（无交接）：`{ type: "spring", bounce: 0.2, duration: 0.3 }`（≈ζ0.8/r0.3）
   - **速度交接场景必须用物理参数**：`{ type: "spring", stiffness: 440, damping: 34 }`（≈ζ0.8/r0.3）、`{ stiffness: 250, damping: 31 }`（≈ζ1.0/r0.4）、`{ stiffness: 250, damping: 25 }`（≈ζ0.8/r0.4）。换算：`ω₀=2π/response`，`stiffness=ω₀²`，`damping=2ζω₀`。
4. **最大坑（源码+实测证实）**：凡设置了 `bounce` 或 `duration` 的弹簧会**整体丢弃 velocity——连显式传入的也丢**（"Time-defined springs ignore inherited velocity"）。速度交接一律物理弹簧 + `velocity`（单位 units/s）；拖拽期 `set()` 直写时释放的新动画会自动继承 `getVelocity()`。
5. **动量投影**：motion 内置 `type: "inertia"`（`ideal = origin + power·velocity`，power 0.8 / timeConstant 325ms，`modifyTarget` 吸附，min/max 出界回弹），`drag()` 默认 momentum 就是它；Apple 精确公式 `v/1000·d/(1−d)`（d=0.998）不内置，sheet 原型自算投影点 + 最近吸附 + 物理弹簧交接速度。
6. **材质降级**：`backdrop-filter` 支持 97%+，但 **Safari ≤17 仍需 `-webkit-` 前缀**（无前缀自 Safari 18）。三层降级（CSS 全文见调研 §3.4）：`@supports not` → 实底；`prefers-reduced-transparency: reduce` → 提高不透明度、去 blur（**Safari 全系不支持该查询，只能当 Chromium 增强，不能当主开关**）；`prefers-contrast: more` → 近实底 + 描边（Safari 14.1+/iOS 14.5+ 起全线可用）。玻璃层 DOM 不得嵌套（backdrop root 机制会令子层 blur 失效），半径 ≤20–24px。
7. **reduced-motion**：vanilla 包不自动读设备偏好（`useReducedMotion`/`MotionConfig` 是 React 专属）。官方 vanilla 模式：`scopeMotion(setup, { matchMedia: { reduce: "reducedMotion" } })`，分支内 `media.reduce` 时位移换淡入、去弹簧；单次调用也可传 `transition.reduceMotion`（只跳过 transform/位置键，opacity 照常动画，正好符合规范「保留交叉淡入」）。
