# 播放控件与进度条按 AMLL 官方复刻

Type: task
Status: resolved

## Answer

2026-10-25 完成。参照 `amll-dev/amll-player` 的 NowPlayingBar 与 `@applemusic-like-lyrics/react-full` 官方组件源码，vanilla 复刻为 `src/utils/bouncing-slider.ts`：

- **BouncingSlider**：轨道粗细 8↔20px 随 hover/拖拽弹性变化（motion clip-path inset 弹簧，官方参数 tween easeOut .28 / spring st200 d12）；越界 tanh 弹跳 ±12px（springValue st300 d12）；白色 40% 填充 scaleX；播放中 rAF 按帧自走（isPlaying 注入）；tap 直接 seek、拖拽 1:1、暂停态经 getMax() 实时读时长（修复 timeupdate 不触达时 seek 失效）；可选两端图标。
- **MediaButton**：全白圆形按钮 + hover 白色半透明底 + 官方 pressed-animation（scale 1→0.85→1.1→1，animation-composition: accumulate）——替代原 Motion press 方案；红色强调播放钮按官方设计退役。
- **剩余时间**：右侧时间显示改为 Apple 式负号剩余（如 -2:39）。
- 大播放器与队列 sheet 的进度条、音量条、按钮组全部换用；拖拽中标签实时跟随。
