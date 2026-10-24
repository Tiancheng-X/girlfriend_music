# girlfriend_music

只有「听歌」一件事的极简 Astro 站点。界面按 apple-design-zh 规范重构为
Apple Music 风：大播放器（布局 A「沉浸」）+ 底部 mini-player + 全屏正在播放
sheet，手势动效由 Motion 弹簧驱动（可中断、速度交接、动量投影）。

- 播放引擎：`src/components/MusicManager.astro`，挂载后暴露 `window.__fireflyMusic` 单例
- 全局外壳：`src/components/MiniPlayer.astro`（氛围背景 + mini + sheet），
  控制器 `src/utils/sheet-controller.ts`
- 首页主播放区：`src/components/BigPlayer.astro` + `src/utils/big-player-controller.ts`
- 手势/弹簧工具：`src/utils/gesture.ts`（弹簧参数、橡皮筋、动量投影、press 反馈）
- 歌单来源：Meting API（默认网易云歌单，见 `src/config/musicConfig.ts`）

2026-10 重构的决策与验收记录在 `.scratch/apple-ui-rebuild/`（wayfinder 地图），
域词汇表见 `CONTEXT.md`；旧版悬浮三态胶囊已退役（原型存档于
`prototype/apple-ui-rebuild` 分支）。

## 本地开发

```bash
pnpm install
pnpm dev      # 开发服务器 http://localhost:4321
pnpm build    # 输出静态站点到 dist/
pnpm preview  # 预览构建结果
pnpm check    # TypeScript / Astro 类型检查
```

> Windows 下 MSYS bash 若报 `'node' 不是内部或外部命令`，先执行
> `export PATH="/c/Program Files/nodejs:$PATH"`。

## 部署到 Cloudflare Workers（静态资源托管）

1. 本地先确认 `pnpm build` 通过，`dist/index.html` 存在。
2. Workers 构建配置：
   - **Build command**: `pnpm build`
   - **Deploy command**: `npx wrangler deploy`
3. `wrangler.jsonc` 已指定 `assets.directory = "./dist"`、
   `html_handling = "force-trailing-slash"`、`not_found_handling = "404-page"`，
   与 `astro.config.mjs` 的 `trailingSlash: "always"` 对齐。
4. 首次部署需要 `npx wrangler login`（或在 CI 中配置 `CLOUDFLARE_API_TOKEN`）。

## 目录结构

```
src/
├── components/    MusicManager.astro / BigPlayer.astro / MiniPlayer.astro / Icon.astro
├── config/        musicConfig.ts（歌单、音量、播放模式）
├── i18n/          zh.ts（中文文案常量 + t()）
├── layouts/       Base.astro（Apple Music 暗色 tokens，挂载引擎与播放器外壳）
├── pages/         index.astro
├── styles/        player.css（氛围/mini/sheet）、big-player.css（大播放器）
├── types/         global.d.ts（__fireflyMusic 类型）
└── utils/         sheet-controller.ts、big-player-controller.ts、gesture.ts、url.ts
```
