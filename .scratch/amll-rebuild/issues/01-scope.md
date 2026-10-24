# 范围：AMLL 接入程度与页面形态

Type: grilling
Status: resolved

## Question
AMLL 接到什么程度？页面是否整体重做？

## Answer
2026-10-25 用户选定：**歌词+逐字+流体背景（全套）**；随后追加「再次重构，重新做页面设计，不只是歌词区，播放器页也运用 AMLL」→ 落地为沉浸式整页：
- AMLL 流体渐变背景（MeshGradientRenderer）铺满全页（z0），封面驱动
- 主页面 = 播放页：桌面双栏（左封面控制 / 右歌词主舞台），移动端上下堆叠
- 队列收纳进 mini-player 的 sheet（歌词归主页面）
- 弹簧基线/手势沿用 apple-ui-rebuild 地图的定稿，MusicManager 引擎不动
