# 原型：首页大播放器的 Apple Music 布局

Type: prototype
Status: resolved
Blocked by: 03

## Question

用 prototype skill 出首页主播放区的布局原型并定稿：

- 大封面沉浸布局：封面主导（大图 + 环境氛围）在 PC 宽屏与窄窗口的两档形态；歌词 / 歌单面板在新层次下的位置
- 控件即时反馈：pointer-down 高亮、进度条 / 音量条 1:1 拖拽（沿用手写拖拽思路但迁移到 Motion）
- 标题区字阶与「宝宝的歌单」页头的层级关系

定稿结论（布局骨架、断点行为、动效点）写进 Answer，执行票据照做。

## Comments

- 2026-10-24 用户反馈：A 布局「播放组件位置很奇怪」。根因：原型手机形态从未真正启用（force-mobile 选择器失效），用户看到的是桌面布局的垂直居中内容——封面悬空、控制区与 mini-player 脱节。修复：① 选择器改为 `#am-proto.force-mobile .device`；② A 移动端重构为 Apple Music iOS 式——封面贴顶（宽 78%），标题/歌词/进度/传输区沉底左对齐，传输区铺满（播放模式左 / 播控居中 / 队列入口右）；sheet 封面在移动端同步放大。默认设置按用户提交固定为：手机形态 + 标准弹簧 + 氛围背景开。布局终选（A/B/C 或组合）仍待用户确认。

## Answer

2026-10-24 用户定稿：**A 布局「沉浸」胜出**（弹簧手感默认档同 [04](04-proto-sheet-gestures.md)）。

- **桌面（>680px）**：垂直居中沉浸列——大封面（300px）主导 + 氛围光晕背景，曲名/歌手/当前歌词行居中，进度条 min(84%, 440px)，传输控件居中（播放键 58px 强调色圆钮），音量条在传输区内。
- **移动端（≤680px）**：封面贴顶（宽 78%），标题/歌手/当前歌词行/进度/传输区**沉底左对齐**，传输区铺满一行（播放模式左 / 播控居中 / 歌单入口右）。
- 氛围背景：用封面图本体做 blur(90px) saturate(1.25) 光晕层，双图层交叉淡入换歌；`no-ambient` / 降级回退纯色。
- 原型 capture：分支 `prototype/apple-ui-rebuild`（prototypes/apple-music-rebuild-proto.html）。
- 执行票据 [06](06-exec-big-player.md) 照本节与原型代码实现。
