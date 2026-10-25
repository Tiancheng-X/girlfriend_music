# 设置面板 UI

Type: task
Status: resolved
Blocked by: 02

## Question

（执行票据）新建设置面板组件与样式：

- **入口**：大播放器控制区队列按钮旁新增设置图标（`data-open-settings`），MiniPlayer 挂载面板
- **面板**：与队列 sheet 同机制的第二张 sheet（底部滑入 + 下拉关闭 + Esc + body 锁滚动），玻璃拟态材质；桌面与移动端同构
- **内容分组**（按 01 定稿）：「播放」（播放模式三选）、「显示」（歌词字号三选段、流体背景开关、动效减弱开关）、「数据」（清除本地数据，需确认步骤）、「关于」（版本号 + 说明）
- **控件**：开关用自研 switch（无依赖）、三选项用分段选择（segmented）、清除数据二次确认
- 完成标准：`pnpm check` 通过；面板手势与队列一致；设置项即时生效

## Answer

（待执行）

## Answer

2026-10-25 完成。`settings-controller.ts` + MiniPlayer.astro 第二张 sheet：与队列同机制（spring 滑入/下拉关闭/Esc/锁滚动），分组表单——播放模式分段选择（引擎 setPlayMode 同步传输按钮图标）、歌词字号三选、流体背景与动效减弱 switch（自研，无依赖）、清除数据两步确认、关于区。入口为大播放器控制区齿轮（data-open-settings）。样式见 player.css `.set-*`。
