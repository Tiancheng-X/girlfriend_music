// 新写（v2 精简）：AMLL 流体背景桥接层。
// 结论记录（2026-10-25 验收）：@applemusic-like-lyrics/core 的 BackgroundRender
// (MeshGradientRenderer) 在本站工作良好；但同包的 LyricPlayer 在 0.5.2 与 0.6.0
// 两个版本、含官方最小示例的隔离页中均无法渲染行元素（组件级缺陷，作者自述
// 「勿用于生产」）——歌词改用自研实现（见 big-player-controller），故本层只保留背景。
import {
	BackgroundRender,
	MeshGradientRenderer,
} from "@applemusic-like-lyrics/core";
import "@applemusic-like-lyrics/core/style.css";

let background: BackgroundRender<MeshGradientRenderer> | null = null;

export interface AmllBgRefs {
	/** 流体背景 canvas 挂载区域；缺省或 WebGL 失败时回退 CSS 氛围光晕 */
	bgHost?: HTMLElement | null;
}

export function initAmllBackground(refs: AmllBgRefs): void {
	if (background || !refs.bgHost) return;
	try {
		background = BackgroundRender.new(MeshGradientRenderer);
		background.setFPS(30);
		refs.bgHost.appendChild(background.getElement());
	} catch {
		background = null;
	}
	// 背景激活与否决定 CSS 氛围光晕是否退场
	document.documentElement.classList.toggle("amll-bg-live", background !== null);

	document.addEventListener(
		"visibilitychange",
		() => {
			if (!background) return;
			if (document.hidden) background.pause();
			else background.resume();
		},
		{ passive: true },
	);
}

/** fm:track：把封面喂给流体渐变（异步内部消化） */
export function setAmllBackgroundCover(coverUrl?: string): void {
	if (background && coverUrl) background.setAlbum(coverUrl).catch(() => {});
}
