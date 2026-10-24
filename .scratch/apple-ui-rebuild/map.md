# Map: 按 apple-design-zh 重构全站界面（Apple Music 风 · 双端适配）

Labels: wayfinder:map
Effort: apple-ui-rebuild

## Destination

全站界面按 apple-design-zh 规范重构为 Apple Music 风格：两端统一为「底部半透明 mini-player + 全屏正在播放 sheet」（悬浮胶囊删除），手势动效全量迁移到 Motion 弹簧（可中断、速度交接、动量投影），PC 与移动端适配完毕，`pnpm check` 与 `pnpm build` 通过、可直接部署到 Cloudflare Workers。

## Notes

- 域：Astro 7 单页静态站，只做「听歌」一件事；域词汇表见仓库根目录 `CONTEXT.md`
- 技能：本地图的每个会话先读 apple-design-zh（界面与动效规范，`C:\Users\Tiancheng_Huang\.agents\skills\apple-design-zh\SKILL.md`）；prototype 票据用 prototype skill；grilling 票据按 grilling skill 进行
- 技术基准：MusicManager 播放引擎的公开 API（`window.__fireflyMusic`、`fm:*` 事件）不动，重构只覆盖 UI 层（组件 / 样式 / 控制器）
- 工具链：pnpm；`astro build` → `dist/` → Cloudflare Workers 静态托管
- 范围覆盖（用户已选）：本图带执行票据，推进到「重构完成、构建通过」为止，不是纯规划图
- issue tracker：local-markdown，约定见 `docs/agents/issue-tracker.md`

## Decisions so far

- [设计定调：主题 / 移动端形态 / 动效 / 范围](issues/01-design-direction.md): Apple Music 风 + 两端统一 mini-player 与全屏 sheet（删除胶囊）+ Motion 库动效 + 地图覆盖执行
- [研究：Motion 库落法与苹果手法映射](issues/02-research-motion.md): 用 hybrid `motion@14.6.0`（≈24kB gzip，非 mini）+ 物理弹簧基线（ζ=1−bounce；交接速度必须 stiffness/damping，bounce/duration 弹簧会丢 velocity），材质用 `-webkit-` 前缀 + @supports/reduced-transparency/contrast 三层降级，reduced-motion 用 scopeMotion matchMedia 分支
- [设计系统 tokens 定稿](issues/03-design-tokens.md): 纯 Apple Music 配色（无彩深灰底 + #fa2d48 强调，青蓝退役）+ 做封面氛围背景 + 重玻璃三档分层 + 系统字体栈；全套 tokens、字阶表与弹簧基线已落稿在票据 Answer
- [原型：mini-player + 全屏 sheet 的手势手感](issues/04-proto-sheet-gestures.md): 标准档物理弹簧 {440,34} + 1:1 跟手 + 橡皮筋 0.55 + 动量投影 d=0.998 + 可中断续动，全部实测通过；sheet 内歌词/列表双 tab（歌词默认）——雾区「sheet 歌单呈现」定案；原型 capture 至 `prototype/apple-ui-rebuild` 分支
- [原型：首页大播放器的 Apple Music 布局](issues/05-proto-big-player.md): A 布局「沉浸」胜出——桌面垂直居中沉浸列，移动端封面贴顶 78% + 控制区沉底左对齐；氛围背景用封面图 blur(90px) 双层交叉淡入
- [执行：重构首页大播放器](issues/06-exec-big-player.md): BigPlayer 布局 A 落地 + 控制器重写（1:1 进度拖拽、音量、模式、歌词行预览、press 反馈）
- [执行：底部 mini-player + 全屏 sheet](issues/07-exec-mini-player-sheet.md): MiniPlayer + sheet-controller 落地（motion MotionValue 拖拽、物理弹簧速度交接、动量投影、橡皮筋、歌单分批、歌词）；胶囊三件套退役并清理遗留键
- [执行：响应式与无障碍降级](issues/08-exec-responsive-a11y.md): 680px 双档 + safe-area + reduced-motion/transparency/contrast 三层降级 + 44px 触控目标
- [验收：构建与双端体验](issues/09-acceptance.md): check/build 通过；手势五用例、真实播放链路、双端截图全部通过，零控制台错误；JS gzip ≈29.7KB。**地图收口：目的地达成**

## Not yet specified

- 封面加载占位与淡入的过渡细节（当前为即时显示，可再做淡入打磨）

## Out of scope

- MusicManager 引擎与 `fm:*` 事件协议的改动（接口保持稳定，UI 层全部可换）
- 歌单数据源切换（继续用 Meting 网易云歌单）
- 部署流程与 wrangler 配置改动
- 多语言（维持中文）
