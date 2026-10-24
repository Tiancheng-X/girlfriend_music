# Spike：AMLL 可行性判定

Type: research
Status: resolved

## Answer

**可用部分**
- `@applemusic-like-lyrics/core@0.5.2` 的 `BackgroundRender.new(MeshGradientRenderer)` 流体渐变背景：**工作良好**，`setAlbum(封面URL)` 换色，`setFPS(30)` 节能，页面隐藏 pause/resume。gzip 增量约 100KB（含 Pixi 子集），总 JS gzip 128KB < 250KB 预算。

**缺陷判定（隔离页实测，双版本复现）**
- 同包 `LyricPlayer`（DomLyricPlayer）在 0.6.0 与 0.5.2 上、连同官方最小示例的独立测试页（/amll-test，已删）中均**无法渲染行元素**：数据管线健康（101 行进 dataManager、processedLines 正常、currentLyricGroups 已建、size 由 ResizeObserver 正确上报 624×556），但组元素的 `show()`/插入逻辑从未执行，DOM 恒为「间奏点 + 空行」。作者自述 0.x「勿用于生产」，属组件级缺陷。
- Meting 协议无歌曲 id 字段，但 url 参数携带（`type=url&id=287398`）→ AMLL TTML 库（独立仓库 amll-dev/amll-ttml-db，索引 metadata/raw-lyrics-index.jsonl，3349 首，ncmMusicId→rawLyricFile）可按 id 渐进查词；本次《我不难过》未被收录。数据链路已验证，待官方修复渲染缺陷即可接逐字 karaoke。

**落地决策**
- 保留：AMLL 流体背景（amll.ts 桥接层，WebGL 失败回退 CSS 光晕）。
- 回退：歌词用自研逐行高亮面板（v2 已验证代码移植至大播放器页），AMLL 修复后可低成本换回。
