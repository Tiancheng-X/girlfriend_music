# 执行：底部 mini-player + 全屏 sheet

Type: task
Status: resolved
Blocked by: 03, 04

## Question

（执行票据）按「原型：mini-player + 全屏 sheet 的手势手感」的定稿结论新建组件，并删除悬浮胶囊：

- **mini-player**：常驻视口底部的半透明窄条（材质、当前曲名、播放/暂停、展开入口），点击/上拉展开 sheet
- **正在播放 sheet**：全屏播放页——大封面、传输控制、进度、歌词、歌单；下拉关闭，含橡皮筋与动量投影
- 双端同一组件：触屏与鼠标手势并行识别，桌面端不需要拖拽定位
- 退役：`MusicPlayer.astro`、`music-player-controller.ts`、`music-player.css` 的三态形态机与拖拽逻辑全部移除；`Base.astro` / `index.astro` 挂载点更新；localStorage 遗留键（`music-player-pos`、`music-pill-lyrics`）清理
- 完成标准：`pnpm check` 通过，胶囊相关代码在仓库中无残留

## Answer

2026-10-24 完成。新增 `MiniPlayer.astro`（氛围背景双层 + mini-player + 正在播放 sheet + 歌单条目模板）与 `sheet-controller.ts`：motion `motionValue` 驱动 sheet 位移——拖拽期 `y.set()` 1:1 跟手，释放按动量投影（d=0.998）取最近吸附点后 `animate(y, target, { type:"spring", stiffness:440, damping:34, velocity })` 物理弹簧交接；橡皮筋 c=0.55；进行中可抓取反向（set 自动抢占动画）。歌单分批渲染（30/批+滚动加载）、歌词高亮自动滚动（用户滚动暂停 3s）、歌词/列表双 tab、音量条、mini 进度发丝线与 EQ。胶囊三件套（MusicPlayer.astro / music-player-controller.ts / music-player.css）已 `git rm`；`music-player-pos`、`music-pill-lyrics` 遗留键启动时清理。
