# 设置存储与引擎接线

Type: task
Status: resolved
Blocked by: 01

## Question

（执行票据）建立设置持久化层并接线：

- **SettingsStore**（`src/utils/settings.ts`）：单键 `amll-settings-v1` JSON 读写 `{ playMode?, lyricScale?, bgEnabled?, motionReduced? }`，带默认值与类型；暴露 get/set，写入即派发 `settings:changed` 事件供 UI 即时响应
- **引擎接线（最小改动）**：MusicManager 初始化时播放模式读取 store 覆盖构建配置；`cyclePlayMode` 时写回 store（不改 fm:* 协议）
- **歌词字号**：根元素 CSS 变量（如 `--bp-lyrics-scale`），`.bp-lyrics` 字号乘以该系数
- **背景开关**：`initAmllBackground` 尊重 `bgEnabled=false`（不初始化 canvas，CSS 光晕兜底照旧）
- **动效开关**：`gesture.ts` 的 reduced-motion 判定合并手动覆盖；根元素加 `force-reduced-motion` 类，CSS 降级规则同步覆盖该类
- 完成标准：`pnpm check` 通过；设置写入后刷新页面状态恢复

## Answer

（待执行）

## Answer

2026-10-25 完成。`src/utils/settings.ts`：单键 `amll-settings-v1` JSON（playMode/lyricScale/bgEnabled/motionReduced），save 即广播 `settings:changed` 并 `applySettings`（歌词字号根变量 + 动效减弱根类）。引擎接线：init 读取覆盖构建配置、`setPlayMode` 写回（公开 API 新增 `setPlayMode`，fm:* 协议未动）。amll.ts 背景开关：订阅设置事件运行时 create/dispose canvas（dispose 官方 API）。gesture 的 reduced-motion 判定合并手动覆盖。验收：设置写入→刷新恢复全部通过。
