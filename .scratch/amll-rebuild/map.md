# Map: AMLL 沉浸式重构（第二轮 · 流体背景 + 页面重做）

Labels: wayfinder:map
Effort: amll-rebuild
状态：**收口（目的地达成）**——2026-10-25

## Destination

以 applemusic-like-lyrics（AMLL）开源组件为核心重做整页播放体验：流体渐变背景铺满全页、
播放页重组为「封面控制 + 歌词主舞台」双栏/堆叠布局，队列收纳进 sheet。

## Decisions so far

- [范围（用户选）](issues/01-scope.md): 歌词 + 逐字 TTML + 流体背景（全套）；随后升级为「整页重做，播放器页全面运用 AMLL」
- [Spike 结论](issues/02-spike.md): 核心事实与缺陷判定

## Not yet specified

- AMLL 官方修复 LyricPlayer 渲染缺陷后，可重提逐字 karaoke（桥接数据链路已验证）

## Decisions so far（续）

- [播放控件与进度条按 AMLL 官方复刻](issues/03-controls.md): BouncingSlider vanilla 移植（弹性厚度 8↔20px、越界 tanh 弹跳、rAF 自走、tap seek、剩余时间负号显示）+ MediaButton 白色圆形按钮与按压弹跳动画；删除红色强调播放钮（跟随官方全白设计）
