// 新写（v2 精简）：AMLL 流体背景桥接层。
// 结论记录（2026-10-25 验收）：@applemusic-like-lyrics/core 的 BackgroundRender
// (MeshGradientRenderer) 在本站工作良好；但同包的 LyricPlayer 在 0.5.2 与 0.6.0
// 两个版本、含官方最小示例的隔离页中均无法渲染行元素（组件级缺陷，作者自述
// 「勿用于生产」）——歌词改用自研实现（见 big-player-controller），故本层只保留背景。
// 设置页的「流体背景」开关可运行时创建/销毁背景（settings:changed 事件驱动）。
import {
	BackgroundRender,
	MeshGradientRenderer,
} from "@applemusic-like-lyrics/core";
import "@applemusic-like-lyrics/core/style.css";
import { loadSettings, SETTINGS_EVENT } from "./settings";

let background: BackgroundRender<MeshGradientRenderer> | null = null;
let bgHost: HTMLElement | null = null;
let lastCover: string | undefined;

export interface AmllBgRefs {
	/** 流体背景 canvas 挂载区域；缺省或 WebGL 失败时回退 CSS 氛围光晕 */
	bgHost?: HTMLElement | null;
}

function createBackground(): void {
	if (background || !bgHost) return;
	try {
		background = BackgroundRender.new(MeshGradientRenderer);
		background.setFPS(30);
		bgHost.appendChild(background.getElement());
		if (lastCover) background.setAlbum(lastCover).catch(() => {});
	} catch {
		background = null;
	}
	document.documentElement.classList.toggle("amll-bg-live", background !== null);
}

function destroyBackground(): void {
	if (!background) return;
	background.dispose();
	background = null;
	document.documentElement.classList.toggle("amll-bg-live", false);
}

function syncBackground(): void {
	if (loadSettings().bgEnabled === false) destroyBackground();
	else createBackground();
}

export function initAmllBackground(refs: AmllBgRefs): void {
	if (bgHost) return;
	bgHost = refs.bgHost ?? null;
	lastCover = undefined;
	if (loadSettings().bgEnabled !== false) createBackground();

	document.addEventListener(
		"visibilitychange",
		() => {
			if (!background) return;
			if (document.hidden) background.pause();
			else background.resume();
		},
		{ passive: true },
	);

	window.addEventListener(SETTINGS_EVENT, syncBackground);
}

/** fm:track：把封面喂给流体渐变（异步内部消化） */
export function setAmllBackgroundCover(coverUrl?: string): void {
	lastCover = coverUrl;
	if (background && coverUrl) background.setAlbum(coverUrl).catch(() => {});
}

