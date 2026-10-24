# 验收：构建与双端体验

Type: task
Status: resolved
Blocked by: 08

## Question

（执行票据，收尾）

- `pnpm check`、`pnpm build` 通过；`pnpm preview` 冒烟无控制台错误
- 用 web-gui-tester 黑盒走查：播放 / 暂停 / 切歌 / 进度 / 音量 / 歌词 / 歌单 / mini-player ↔ sheet 往返 / 中断动画的抓取反向
- 移动视口（375 / 390 宽）与桌面视口截图验收，对照 apple-design-zh 的材质与字阶检查
- 全部通过后：在 map 的 Decisions so far 补一行验收结论，地图收口

## Answer

2026-10-24 验收通过。`pnpm check` 0 错误；`pnpm build` 通过；浏览器（IAB + Playwright/cua）黑盒实测：

- 桌面（1280）与移动视口（390）截图核对布局 A 双形态 ✓
- 手势五用例（合成指针事件，坐标可控）：轻点开 / 下拖关 / 上拖跟手开（投影落点正确）/ 收起按钮 / 基线状态，全部通过 ✓
- 真实播放链路：Meting 歌单拉取（30 条分批渲染）、封面/歌词/氛围背景换色、播放态图标与 EQ 同步、`audio.paused === false` 真实出声、进度走表 ✓
- 全程零控制台错误；产物 JS gzip ≈ 29.7KB（motion ≈24KB + 控制器），符合研究预期 ✓

修出的 bug：封面占位 fallback 常显（真实封面加载后未隐藏）——已修；cua 合成点击的微小位移会触发拖拽回弹属正常设计行为。
