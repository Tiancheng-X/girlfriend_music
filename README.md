# girlfriend_music

只有「听歌」一件事的极简 Astro 站点。悬浮胶囊播放器移植自 my-blog 博客
（`MusicManager` 播放引擎 + `MusicPlayer` 三态胶囊 UI），去掉了 i18n、Swup、Tailwind、
内容集合、three.js 可视化等一切与听歌无关的依赖。

- 播放引擎：`src/components/MusicManager.astro`，挂载后暴露 `window.__fireflyMusic` 单例
- 胶囊 UI：`src/components/MusicPlayer.astro` + `src/utils/music-player-controller.ts`
- 歌单来源：Meting API（默认网易云歌单，见 `src/config/musicConfig.ts`）

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
├── components/    MusicManager.astro / MusicPlayer.astro / Icon.astro
├── config/        musicConfig.ts（歌单、音量、播放模式）
├── i18n/          zh.ts（中文文案常量 + t()）
├── layouts/       Base.astro（暗色主题根布局，挂载播放引擎）
├── pages/         index.astro
├── styles/        music-player.css
└── utils/         music-player-controller.ts、url.ts
```
