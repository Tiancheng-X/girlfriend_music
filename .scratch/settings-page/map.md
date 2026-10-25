# Map: 设置页（音乐网站）

Labels: wayfinder:map
Effort: settings-page

## Destination

上线设置面板：玻璃拟态 sheet 形态，入口在播放页控制区；设置项四组——记住播放模式、歌词字号、背景与动效开关、清除数据与关于——即存即用（localStorage），`pnpm check` / `pnpm build` 通过、双端验收。

## Notes

- 域：Astro 7 单页音乐站；域词汇表 `CONTEXT.md`（执行时补充「设置面板 / 设置存储」术语）
- 技能：执行会话先读 apple-design-zh；本图 UI 复用既有体系（BouncingSlider/Motion 弹簧/玻璃材质），无需原型票据——设置面板是低风险表单类 UI，设计系统已定型
- 技术基准：MusicManager 引擎公开 API 原则上不动；唯一例外是播放模式持久化（init 读取 localStorage 覆盖 + cyclePlayMode 写回），属小步 bug 级增强，记录在执行票据
- 工具链：pnpm；astro build → dist → Cloudflare Workers

## Decisions so far

- [定调：形态 / 设置项 / 入口 / 范围](issues/01-direction.md): sheet 面板 + 四组设置项全选 + 播放页控制区入口 + 地图覆盖执行
- [设置存储与引擎接线](issues/02-settings-store.md): amll-settings-v1 单键存储 + 即时应用；引擎播放模式记忆（init 读取 / setPlayMode 写回，公开 API 新增 setPlayMode）；歌词字号根变量；背景与动效开关联动
- [设置面板 UI](issues/03-settings-panel.md): 第二张 sheet（同机制）+ 分组表单 + 自研 switch/segmented + 两步确认清除；入口齿轮在播放页控制区
- [设置项落地与验收](issues/04-verify.md): 逐项+持久化+清除数据全部实测通过；顺手修复移动端传输行 5 键溢出。**地图收口：目的地达成**

## Not yet specified

- 歌单 ID 运行时配置（用户倾向不放设置页；若未来要「换歌单不重新部署」，另行立项）
- 音质/音源切换（Meting 多源 fallback 的手动选择）

## Out of scope

- MusicManager 的 fm:* 事件协议改动（播放模式持久化只加读写点，不改协议）
- 多语言设置（站内维持中文）
