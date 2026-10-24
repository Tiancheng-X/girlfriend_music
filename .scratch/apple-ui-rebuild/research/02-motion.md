# 调研：Motion 库落法与苹果手法映射

- 票据：[issues/02-research-motion.md](../issues/02-research-motion.md)
- 日期：2026-10-24
- 方法：motion.dev 官方文档 + motion@14.6.0 实际源码（npm tarball 逐行核对）+ 本机 esbuild 实测打包体积 + MDN browser-compat-data 8.1.7 / caniuse 数据。所有 API 断言均标注来源；「源码」指从 npm 拉取的 `motion@14.6.0` / `framer-motion@14.6.0` / `motion-dom@14.6.0` 的 ESM 产物。
- 消费方：票据 03（设计 tokens 定稿）、04/05（手势原型）、06/07（执行）。

## TL;DR（可执行结论）

| 项 | 结论 |
| --- | --- |
| 包/版本 | `motion@14.6.0`（npm 当前最新稳定版），`pnpm add motion` |
| import | `.astro` 组件的 `<script>`（Astro 默认处理：自动打包、TS、按页去重）里 `import { animate, press, drag, scopeMotion } from "motion"`；**不用 `motion/mini`**（无 x/y 独立变换、无速度继承、无中断续动语义，做 sheet 手势必须 hybrid） |
| 体积量级 | hybrid `animate`+spring 实测 **gzip ≈ 24 kB**（官方口径 22 kb）；`motion/mini` 纯 WAAPI ≈ 3.4 kB gzip（官方口径 3.2 kb） |
| 默认弹簧 | 非手势 UI：`{ type: "spring", bounce: 0, duration: 0.4 }`（临界阻尼） |
| 手势释放弹簧 | **物理参数** `{ type: "spring", stiffness: 440, damping: 34 }`（≈Apple ζ0.8/r0.3）或临界阻尼 `{ stiffness: 250, damping: 31 }`（≈ζ1.0/r0.4） |
| 关键坑 | **带 `bounce`/`duration` 的弹簧会整体丢弃 velocity（含显式传入）**——速度交接必须用 stiffness/damping 物理弹簧（源码+实测证实） |
| 动量投影 | `type: "inertia"` 内置投影（`ideal = origin + power·velocity`，`modifyTarget` 吸附）；要 Apple 精确公式则自算投影点后交给物理弹簧 |
| 玻璃材质 | `backdrop-filter` 全站可用（97%+），Safari ≤17 仍需 `-webkit-` 前缀；`prefers-reduced-transparency` Safari 不支持（仅作增强）；`prefers-contrast: more` 全线可用 |
| reduced-motion | vanilla 包**不会**自动读设备偏好；用官方 `scopeMotion(setup, { matchMedia: { reduce: "reducedMotion" } })` + `scope.media.reduce` 分支 |

---

## 1. motion 在 Astro 静态站的集成

### 1.1 包与版本

- npm registry：`motion` 当前 latest 为 **14.6.0**（2026-10 查证），依赖 `framer-motion@14.6.0`、`tslib`；运行时核心在 `motion-dom`/`motion-utils` 同版本包里。
- 包结构：`motion` 入口 `dist/es/index.mjs` 只有 `export * from 'framer-motion/dom'`；`motion/mini` 入口 `export * from 'framer-motion/dom/mini'`。`package.json` 声明 `"sideEffects": false` → ESM 可摇树，只 import 用到的函数即可。
- `framer-motion/dom`（hybrid）导出：`animate`、`createScopedAnimate`、`scroll`、`scrollInfo`、`inView`，再 `export * from 'motion-dom'`（其中含 `spring`、`inertia`、`drag`、`press`、`hover`、`scopeMotion`、`stagger`、`delay`、`springValue` 等约 300 个导出，摇树后只保留引用到的）。
- `framer-motion/dom/mini` 只导出：`animateMini as animate`、`animateSequence`。

### 1.2 `motion` vs `motion/mini` 取舍

官方文档（motion.dev/docs/animate）口径：mini "can animate HTML and SVG styles using native browser APIs"（WAAPI），3.2 kb；hybrid 22 kb，额外提供 independent transforms（x/y/scale 独立值）、更多样式、CSS 变量、SVG path、sequences、颜色/字符串插值、JS 对象。

**本站必须用 hybrid，理由（皆源码级）：**

1. **mini 没有 x/y 独立变换**：mini 只能动画 `transform` 字符串；sheet 的 `translateY`、胶囊的 `x` 独立值需要 hybrid 的 `x`/`y`（motion-dom 把独立变换组合成单条 WAAPI transform）。
2. **mini 没有速度继承**：mini 走 WAAPI 固定曲线，手势释放的速度交接、中断续动都无从谈起（WAAPI 没有内建中断能力，hybrid 用 `NativeAnimationExtended.updateMotionValue` 采样回填 `setWithVelocity` 解决）。
3. **mini 没有 `inView`/`scroll`**（在 hybrid 入口才导出）。
4. mini 用弹簧需另行 `import { spring }` 并以工厂函数传 `type: spring`（hybrid 用字符串 `"spring"` 即可）。

### 1.3 实测体积（esbuild bundle --minify，gzip，motion@14.6.0，2026-10-24 本机）

| 场景 | minified | gzip |
| --- | --- | --- |
| `motion/mini` 纯 WAAPI tween | 8.5 kB | **3.4 kB**（≈官方 3.2 kb 口径） |
| `motion/mini` + `spring` 工厂 | 12.8 kB | 5.2 kB |
| `motion` hybrid：`animate` x/opacity + spring | 65.3 kB | **24.4 kB**（≈官方 22 kb 口径） |
| `motion` hybrid + `scroll` + `inView` 全引 | 72.5 kB | 27.3 kB |

量级结论：全量 hybrid ≈ **24 kB gzip**（未压缩 65 kB）。对 Cloudflare Workers 静态托管 + gzip 的移动端首屏可接受；Astro 对小脚本自动内联、这个体量会以独立 module 文件发出（Astro 官方：脚本"bundled and only included once per page"，小于阈值才内联）。

### 1.4 Astro 集成姿势（官方文档：docs.astro.build/guides/client-side-scripts）

- Astro 默认"enhances the HTML standard `<script>` tag with bundling, TypeScript, and more"：**所有脚本默认按 TS 处理、import 会被打包**、同页组件复用时去重、产物为 `type="module"`。
- 只要不加 `is:inline`（它会让脚本原样输出、不处理 import），直接写：

```astro
<script>
  import { animate, press, drag, scopeMotion } from "motion";
  // ...UI 层逻辑，pnpm add motion 后即可，无需任何 vite/astro 配置
</script>
```

- 无框架集成不需要 `motion/react`；React 相关入口（`motion/react` 等）完全不引。

---

## 2. 苹果三件套在 motion 的落法

### 2.1 可中断弹簧 + 从呈现值续动：默认行为，无需额外处理

源码链路（motion-dom@14.6.0）：

1. `animation/animate/effects.mjs`：*"Motion values are created on first animation and bound to the subject through the effect for the rest of its life"* —— 每个 element+key 的 MotionValue 常驻；再次 `animate()` 同一元素时 `value.get()` 就是**当前呈现值**。
2. `animation/interfaces/motion-value.mjs`：`animateMotionValue` 构造 options 时固定带 `velocity: value.getVelocity()`，keyframes 解析为 `[null, target]`（null = 当前值）；且 MotionValue 文档注明 *"Only one animation can drive a MotionValue at one time"* —— 新动画自动接管并停掉旧动画。
3. WAAPI 侧（`NativeAnimationExtended`）：*"WAAPI doesn't natively have any interruption capabilities… we can sample a renderless JS animation twice… to calculate velocity for any subsequent animation"* —— 中断时把当前值+速度回写 MotionValue。

→ **「永远从当前呈现值续动」motion 默认就是对的**；apple-design-zh §3 的要求直接满足，不要用手写「读取 on-screen transform」那套。

### 2.2 bounce/duration ↔ damping/response 映射

- `type: "spring"` + `bounce`/`duration` 是 duration-based 弹簧。`bounce` 默认 **0.25**、范围 **[-1, 1]**：0 = 临界阻尼（无过冲）、1 = 极弹、负值 = 过阻尼（起步更快、缓收尾、无过冲）。`duration` 默认 **0.3s**（弹簧需与 bounce 同时给出）。
- **换算公式（源码 `motion-dom/dist/es/animation/generators/spring.mjs`，注释原文 "Maps bounce to a damping ratio as SwiftUI does"）**：

  ```js
  const bounceToDampingRatio = (bounce) => bounce < 0
      ? 1 / Math.max(1 + bounce, 0.05)
      : Math.max(1 - bounce, 0.05);   // → ζ = 1 − bounce
  ```

  即 **Apple 阻尼比 ζ → `bounce = 1 − ζ`**：ζ1.0 → bounce 0；ζ0.8 → bounce 0.2。
- **Apple `response` ≠ motion `duration`**：Apple response 是无阻尼周期（ω₀ = 2π/response）；motion duration 是整段弹簧的沉降时间（findSpring 反解 stiffness，0.4s 即 0.4s 收敛到 0.1% 残差，实测 settle≈400ms）。作为设计师手感基线二者可直接互换（apple-design-zh 自己的示例也是 response 0.4 → duration 0.4），但不要指望逐帧一致。
- 物理参数 `stiffness`/`damping`/`mass` 亦可直接给，一旦设置会**覆盖** bounce/duration（官方与源码一致）。源码默认值 `stiffness: 100, damping: 10, mass: 1`（→ 默认弹簧 ζ=0.5，偏弹）。注：motion.dev/docs 页面写 stiffness 默认 "1" 与源码不符，以源码为准；我们始终显式传值，不受影响。

**基线参数（写入 tokens）：**

| 场景（Apple 参数） | time-defined 写法 | 物理（可交接速度）写法 |
| --- | --- | --- |
| 移位/重定位（ζ1.0，r0.4） | `{ type: "spring", bounce: 0, duration: 0.4 }` | `{ type: "spring", stiffness: 250, damping: 31 }` |
| 抽屉/sheet（ζ0.8，r0.3） | `{ type: "spring", bounce: 0.2, duration: 0.3 }` | `{ type: "spring", stiffness: 440, damping: 34 }` |
| 旋转（ζ0.8，r0.4） | `{ type: "spring", bounce: 0.2, duration: 0.4 }` | `{ type: "spring", stiffness: 250, damping: 25 }` |

物理换算公式（mass=1，来源：GetStream/swiftui-spring-animations 与 philz.blog 的 SwiftUI 官方公式移植；与 Apple SwiftUI `Spring` 协议定义一致）：

```
ω₀ = 2π / response
stiffness = ω₀²
damping   = 2 · ζ · ω₀   (= 4π·ζ / response)
```

验证：ζ1.0/r0.4 → stiffness 246.7、damping 31.4（实测 from rest 沉降 ≈568ms，ζ = 31.4/(2√246.7) = 1.0）；ζ0.8/r0.3 → stiffness 438.7、damping 33.5（ζ = 0.8，实测 ≈432ms）。

### 2.3 速度交接：单位、自动继承、以及本调研最大的坑

- `velocity` 选项 = 弹簧初速度，**单位为 units/second**（对位移就是 px/s；默认取「当前值速度」）。MotionValue 内部 `getVelocity()` 用 `velocityPerSecond` 按帧差折算，也是 units/s。
- **自动继承**：hybrid `animate()` 每次都传 `velocity: value.getVelocity()`（源码 §2.1 第 2 条）。若拖拽期用 `value.set()`/`el.style` 直写（1:1 跟手），释放时新动画**自动拿到手指速度**——物理弹簧下无需手动传。
- **坑（源码 + 实测双重证实）**：`spring.mjs` 生成器内：

  ```js
  // Time-defined springs ignore inherited velocity. Velocity from
  // interrupted animations causes massive oscillation on small-range animations.
  const inheritVelocity = (velocity) => isTimeDefined ? 0 : -millisecondsToSeconds(velocity);
  ```

  只要 `duration` 或 `bounce` 之一被设置（且未设 stiffness/damping/mass），**无论继承的还是显式传入的 velocity 都被清零**。实测（motion-dom 14.6.0 生成器直跑）：`{ keyframes:[0,100], duration:400, bounce:0 }` 下 velocity=0 / 1000 / −2000 三条曲线逐帧完全相同；物理参数弹簧 velocity=0 vs 1000 差异显著（首 8 帧位移 5→32.8 起步）。

  **→ 规范落法：所有需要速度交接的动画（sheet 释放、胶囊甩动、大卡片回位）一律用物理弹簧 `stiffness/damping`，禁止与 `bounce/duration` 混写；非手势 UI（淡入、按钮缩放反馈）用 time-defined 即可。** 手动保险写法（显式 velocity，确定性更强）：

  ```js
  import { animate } from "motion";

  // 拖拽期 1:1 直写（Pointer Events + setPointerCapture，见 apple-design-zh §2），
  // 释放时：projected target 先算好（§2.4），再交弹簧——velocity 自动继承或显式传
  animate(sheet, { y: target }, { type: "spring", stiffness: 440, damping: 34, velocity: releaseVelY });
  ```

  判定 commit/reverse 用速度**符号**而非位置（apple-design-zh Quick Reference），`drag()` 的 `onEnd` 回调 `info.velocity.y` 可直接用（官方 sheet 示例：`if (info.offset.y > 100 || info.velocity.y > 800) close()`）。

### 2.4 动量投影：内置 `inertia` 与 Apple 精确公式的取舍

- **motion 有内置投影**：`type: "inertia"`。源码语义：`ideal = origin + power · velocity`（默认 `power: 0.8`、`timeConstant: 325ms`），随后指数减速 `Δ(t) = −amplitude·e^(−t/timeConstant)`；可选 `min`/`max`（出界用 `bounceStiffness: 500`、`bounceDamping: 10` 弹回，即内建 rubber-band 回弹）与 **`modifyTarget(ideal)` 回调做吸附点选择**。`drag()` 的 `momentum: true`（默认）用的就是它，transition 可调 `power/timeConstant/bounceStiffness/bounceDamping/restDelta/restSpeed`。
- **Apple 的精确投影公式**（`current + (v/1000)·d/(1−d)`，d≈0.998）motion **没有**内建——`inertia` 的投影是线性 `power·velocity`、衰减是时间常数型，与 UIScrollView 的离散衰减率公式不同形。若票据要求逐一对齐 Apple 手感，自己算投影点再交物理弹簧：

  ```js
  function project(v /* px/s */, d = 0.998) { return (v / 1000) * d / (1 - d); }
  const target = nearestSnap(sheetY + project(releaseVelY));   // 最近吸附点
  animate(sheet, { y: target }, { type: "spring", stiffness: 440, damping: 34, velocity: releaseVelY });
  ```

- **推荐**：sheet 原型票据（04）用「自算投影 + 物理弹簧」对齐规范；一般小元素甩动直接 `drag()` 默认 momentum 即可，不必手搓。

### 2.5 配套手势 API 速览（原型票据直接可用）

- `import { press } from "motion"`：`press(el, (element, startEvent) => { animate(element, { scale: 0.97 }, { duration: 0.1 }); return (endEvent, info) => animate(element, { scale: 1 }); })` —— 回调在 **pointerdown** 触发（apple-design-zh §1），返回函数即 press-end；`info.success` 区分点击/取消（拖离取消），且自动做键盘可达性（focus + Enter）。文档未提供 activeScale 之类快捷参数，按下缩放需如上手动 animate。
- `import { drag } from "motion"`：`drag(el, { axis: "y", constraints: { top: 0, bottom: 0 }, elastic: { top: 0.15, bottom: 0.8 }, momentum: true })` —— 内建 rubber-band（`elastic` 默认 0.35，0~1，可逐边设置）、1:1 跟手（x/y transform）、`touch-action` 自动处理、释放惯性。若用 `drag()`，约束与回弹不用自己写；完全自定义手势才走裸 Pointer Events + `animate()`。

---

## 3. backdrop-filter 玻璃材质的现实约束与降级

### 3.1 支持面（MDN browser-compat-data 8.1.7 + caniuse）

- caniuse 全局支持 **97.08%**。
- Chrome/Chrome Android **76+**、Edge **79+**、Firefox **103+**（123 前在未知 GPU 厂商的系统上不生效，bug 1868737）、Samsung Internet 12+。
- **Safari / iOS Safari：`-webkit-` 前缀自 9，无前缀自 Safari 18（2024-09）**。Safari 15–17 仍在服役 → 必须双写前缀：

  ```css
  .toolbar {
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
  }
  ```

### 3.2 性能现实

- `backdrop-filter` 每帧都要把下层内容重采样+模糊：代价随**被模糊表面积×半径**走。全宽 sticky 工具栏 + 20px blur 在低端 Android GPU 上是滚动掉帧大户；blur 半径本身不贵，贵在面积。
- 实操约束：半径控制在 20–24px 内；玻璃层保持小而少（mini-player 胶囊、顶栏、正在播放 sheet 三处封顶）；玻璃层下滚动区域不要每帧改 blur/opacity；避免对玻璃层本身动画 blur 半径（材料化进场动画用 scale+opacity，见 apple-design-zh §12，blur 半径变化只在状态切换瞬间发生）。

### 3.3 嵌套陷阱（backdrop root）

`backdrop-filter`（以及 `filter`、`opacity<1`、`will-change`、`clip-path` 等会创建堆叠上下文的属性）会形成 **Backdrop Root**（CSS Filter Effects Level 2 规范）：**子元素的 backdrop-filter 只能"看到"到该根为止的内容**，穿不透父级玻璃——玻璃里嵌玻璃直接失效（Chromium 按规范行为处理，见 issues.chromium.org/334110494；典型案例 Stack Overflow 60997948）。这从浏览器机制上坐实了 apple-design-zh §12「绝不叠放浅色半透明面」：玻璃层之间保持**兄弟关系**（DOM 上不嵌套，视觉上不重叠）。

### 3.4 降级策略（推荐写法，全部带具体值）

支持面（bcd 8.1.7）：

| 媒体查询 | Chrome | Safari/iOS | Firefox |
| --- | --- | --- | --- |
| `prefers-reduced-transparency` | 118+ | **不支持**（WebKit bug 175497 未决） | 仅 flag |
| `prefers-contrast` | 96+ | **14.1+ / iOS 14.5+** | 101+ |
| `prefers-reduced-motion` | 74+ | 10.1+ / iOS 10.3+ | 63+ |

→ `prefers-reduced-transparency` **不能当主开关**（Safari 全系不认），只能作为 Chromium 侧增强；Safari 侧用 `@supports not` + `prefers-contrast` 兜底。推荐基线：

```css
/* 基线玻璃（apple-design-zh §12 的参数） */
.material {
  --mat-alpha: 0.6;
  background: rgba(255, 255, 255, var(--mat-alpha));
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.4);
}

/* 1) 引擎不支持 backdrop-filter（如旧 Android WebView）：直接给实底 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .material { background: rgb(255, 255, 255); }
}

/* 2) 用户要求少透明（Chromium 系生效；Safari 靠 1/3 兜底）：磨砂化 */
@media (prefers-reduced-transparency: reduce) {
  .material { --mat-alpha: 0.92; -webkit-backdrop-filter: none; backdrop-filter: none; }
}

/* 3) 用户要求高对比：近实底 + 描边 */
@media (prefers-contrast: more) {
  .material { --mat-alpha: 0.95; border-top-color: rgba(0, 0, 0, 0.35); outline: 1px solid rgba(0, 0, 0, 0.15); }
}
```

（暗色主题把上面的白基色换 token 化变量即可，机制不变。）

---

## 4. motion 对 prefers-reduced-motion 的内置支持（vanilla）

- React 侧有 `MotionConfig reducedMotion="user"` 与 `useReducedMotion`；**vanilla 包没有自动接线**：源码里 `initPrefersReducedMotion()`（matchMedia 监听）只被 `VisualElement`（React 的 `<motion.*>`）调用，vanilla `animate()` 的 EffectSubject 路径不读设备偏好。
- vanilla 有三种等价物（均源码/文档证实）：

  1. **`scopeMotion()` + `matchMedia`（官方文档推荐模式，motion.dev/docs/scope-motion）**——scope 在媒体查询匹配期内运行 setup，失配时停止全部动画并还原 inline style：

     ```js
     import { scopeMotion, animate } from "motion";

     const scope = scopeMotion(
       ({ media }) => {
         animate(".cover", { scale: 1, opacity: 1 });        // 通用
         if (!media.reduce) {
           animate(".sheet", { y: 0 }, { type: "spring", stiffness: 440, damping: 34 });
         } else {
           animate(".sheet", { opacity: 1 }, { duration: 0.2 }); // reduce：淡入替代位移
         }
       },
       { matchMedia: { reduce: "reducedMotion" } }  // 关键字即 (prefers-reduced-motion: reduce)
     );
     ```

     （`matchMedia` 还接受 `">=800"` 一类断点与 `hover`/`touch` 关键字，可同时做双端适配。）
  2. **单次调用级 `transition.reduceMotion`**：类型定义 `ReduceMotionOption`（"true: Skip transform/layout animations (instant transition); undefined: Use device preference"）。源码行为：只对 **transform/位置键**（x/y/scale/rotate… + width/height/top/left/right/bottom）立即跳到终值，**opacity/颜色照常动画** —— 恰好符合 apple-design-zh §14「保留 opacity 交叉淡入」的语义。适合给位移动画统一带上：`animate(el, { y: 0 }, { type: "spring", bounce: 0, duration: 0.4, reduceMotion: undefined })`（undefined = 遵循设备偏好的路径在 React 存在；vanilla 下要 true/false 显式给，见第 4 点开头——所以 vanilla 推荐还是方案 1 的显式分支）。
  3. **手写 matchMedia 分支**（与方案 1 等价，适合不用 scope 的零散调用）：

     ```js
     const reduce = matchMedia("(prefers-reduced-motion: reduce)");
     const spring = reduce.matches
       ? { opacity: [0, 1], duration: 0.2 }                                   // 淡入
       : { y: [40, 0], opacity: [0, 1], type: "spring", stiffness: 250, damping: 31 };
     animate(el, spring);
     ```

- 全局开关 `MotionGlobalConfig.instantAnimations`（一切动画瞬时完成，适合测试/截图）也存在，不建议产品路径使用。
- **推荐**：每个 .astro 入口脚本的最外层用一个 `scopeMotion(..., { matchMedia: { reduce: "reducedMotion" } })` 包住全部动效注册；`media.reduce` 分支里位移→淡入、去弹簧、去视差，与 CSS `@media (prefers-reduced-motion: reduce)` 的静态兜底（apple-design-zh §14 样式）双保险。注意 scope 回调里**不要**包 `setTimeout`/Promise 的后续动画（不收集），异步续动用 `scope.bind(fn)`。

---

## 5. 推荐落法汇总（给 tokens 与原型票据的直接引用）

```js
// 动效 tokens（对应 apple-design-zh §4 数值）
export const springUI    = { type: "spring", bounce: 0,  duration: 0.4 }; // 临界阻尼：非手势移位
export const springSheet = { type: "spring", bounce: 0.2, duration: 0.3 }; // sheet 开合（无速度交接场景）
// —— 速度交接场景必须物理参数（ζ=1−bounce 换算 + ω₀=2π/response）：
export const springGesture   = { type: "spring", stiffness: 440, damping: 34 }; // ≈ζ0.8/r0.3，sheet 释放
export const springReposition= { type: "spring", stiffness: 250, damping: 31 }; // ≈ζ1.0/r0.4，回位
export const springRotation  = { type: "spring", stiffness: 250, damping: 25 }; // ≈ζ0.8/r0.4
```

- 版本/import/体积：见 §1（`motion@14.6.0`，`<script>` 内 `import { animate, press, drag, scopeMotion } from "motion"`，≈24 kB gzip）。
- 中断/续动：默认正确（§2.1），原型里**禁止**在过渡期间锁输入。
- 速度交接：物理弹簧 + `velocity`（px/s）；`bounce/duration` 弹簧丢速度（§2.3，最大坑）。
- 动量投影：Apple 公式自算 + 最近吸附点 + 物理弹簧（§2.4）；小元素可直接 `drag()` 内建 momentum。
- 材质：§3.4 三层降级 CSS；玻璃层不嵌套。
- reduced-motion：§4 方案 1（scopeMotion matchMedia）。

## 参考来源

- motion.dev 官方文档：[quick-start](https://motion.dev/docs/quick-start) · [animate（mini vs hybrid、体积口径）](https://motion.dev/docs/animate) · [spring](https://motion.dev/docs/spring) · [scope-motion（vanilla reduced-motion 模式）](https://motion.dev/docs/scope-motion) · [drag](https://motion.dev/docs/drag) · [press](https://motion.dev/docs/press) · [react-transitions（bounce/duration/inertia 定义）](https://motion.dev/docs/react-transitions)
- npm registry：[motion@14.6.0](https://registry.npmjs.org/motion/latest)（版本、exports、sideEffects:false）；实测源码取自 `motion@14.6.0` / `framer-motion@14.6.0` / `motion-dom@14.6.0` tarball（关键文件：`motion-dom/dist/es/animation/generators/spring.mjs` 的 `bounceToDampingRatio` 与 `inheritVelocity`、`animation/animate/effects.mjs`、`animation/NativeAnimationExtended.mjs`、`scope/index.mjs`、`scope/media.mjs`）
- 体积实测：本机 esbuild 0.28.2 `--bundle --minify` + gzip（见 §1.3 表）
- 浏览器兼容：caniuse [backdrop-filter](https://caniuse.com/backdrop-filter)（97.08%）；MDN browser-compat-data 8.1.7（backdrop-filter Safari 前缀 9+ / 无前缀 18+；prefers-reduced-transparency Safari 不支持；prefers-contrast Safari 14.1+）
- backdrop root 陷阱：[CSS Filter Effects L2 规范](https://drafts.csswg.org/filter-effects-2) · [Chromium issue 334110494](https://issues.chromium.org/issues/334110494) · [Stack Overflow 60997948](https://stackoverflow.com/questions/60997948/backdrop-filter-not-working-for-nested-elements-in-chrome)
- Apple spring 参数换算：[GetStream/swiftui-spring-animations](https://github.com/GetStream/swiftui-spring-animations)（`stiffness = (2π/response)²`、`damping = 4π·ζ/response`）· [philz.blog：Verlet spring](https://philz.blog/verlet-integration-for-fluid-spring-animations-in-swift) · [Apple SwiftUI Spring 文档](https://developer.apple.com/documentation/swiftui/spring)
- Astro 脚本处理：[docs.astro.build/guides/client-side-scripts](https://docs.astro.build/en/guides/client-side-scripts/)
