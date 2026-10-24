# 执行：重构首页大播放器

Type: task
Status: resolved
Blocked by: 03, 05

## Question

（执行票据，依据 map Notes 的范围覆盖）按「设计系统 tokens 定稿」与「原型：首页大播放器」的结论重构 BigPlayer：

- `BigPlayer.astro` 结构与 `big-player.css` 按 tokens 重写；布局对齐原型定稿
- `big-player-controller.ts` 的运动动效迁移到 Motion（进度 / 音量拖拽保留 1:1 与提交语义）
- 保留全部既有能力：播放 / 暂停 / 上下首 / 播放模式 / seek / 音量 / 歌词面板 / 歌单面板 / `fm:*` 订阅
- 完成标准：`pnpm check` 通过，界面对齐原型结论

## Answer

2026-10-24 完成。`BigPlayer.astro` 按布局 A 重构（桌面垂直居中沉浸列 / 移动端封面贴顶+控制沉底），`big-player.css` 全量重写（tokens 化），`big-player-controller.ts` 重写：进度 1:1 拖拽（bindScrub，松手才 seek）、音量条+静音、播放模式三态图标、歌词当前行预览（fm:lrc-index）、错误态文本、`fm:*` 全订阅、Motion press() 按压反馈。保留全部既有能力。`pnpm check` 0 错误。
