// 重写：首页大播放器（布局 A）的视图控制器。
// 氛围背景与 mini/sheet 由 sheet-controller 负责；本模块只同步大播放器自身 UI：
// 封面/曲名/当前歌词行预览、进度 1:1 拖拽、音量、播放模式，以及 fm:* 事件消费。
import { t } from "@/i18n/zh";
import { bindPressFeedback, bindScrub } from "./gesture";

function formatTime(seconds: number): string {
	if (!seconds || Number.isNaN(seconds)) return "0:00";
	const min = Math.floor(seconds / 60);
	const sec = Math.floor(seconds % 60);
	return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

export function setupBigPlayer(): void {
	const root = document.querySelector<HTMLElement>("[data-big-player]");
	const engine = window.__fireflyMusic;
	if (!root || !engine) return;
	const mgr = engine;

	const abort = new AbortController();
	const signal = abort.signal;

	const $ = <T extends HTMLElement = HTMLElement>(selector: string): T | null =>
		root.querySelector<T>(selector);

	const els = {
		cover: $(".bp-cover"),
		coverImg: $<HTMLImageElement>("[data-img]"),
		title: $(".bp-title"),
		artist: $(".bp-artist"),
		lyric: $(".bp-lyric"),
		timeCur: $("[data-time-current]"),
		timeTotal: $("[data-time-total]"),
		progress: $(".bp-progress"),
		bar: $("[data-bar]"),
		thumb: $("[data-thumb]"),
		mode: $<HTMLButtonElement>("[data-mode]"),
		iconModeList: $(".icon-mode-list"),
		iconModeOne: $(".icon-mode-one"),
		iconModeShuffle: $(".icon-mode-shuffle"),
		prev: $<HTMLButtonElement>("[data-prev]"),
		play: $<HTMLButtonElement>("[data-play]"),
		iconPlay: $(".icon-play"),
		iconPause: $(".icon-pause"),
		next: $<HTMLButtonElement>("[data-next]"),
		mute: $<HTMLButtonElement>("[data-mute]"),
		iconVolOn: $(".icon-vol-on"),
		iconVolOff: $(".icon-vol-off"),
		volume: $<HTMLInputElement>("[data-volume]"),
		error: $("[data-error]"),
	};

	const critical: (Element | null)[] = [
		els.cover, els.coverImg, els.title, els.artist, els.lyric, els.timeCur, els.timeTotal,
		els.progress, els.bar, els.thumb, els.mode, els.iconModeList, els.iconModeOne,
		els.iconModeShuffle, els.prev, els.play, els.iconPlay, els.iconPause, els.next,
		els.mute, els.iconVolOn, els.iconVolOff, els.volume, els.error,
	];
	if (critical.some((el) => el === null)) return;

	let seeking = false;

	function ensureInit(): void {
		if (mgr.getState().initialized) return;
		void mgr.init();
	}

	function updatePlayIcons(playing: boolean): void {
		els.iconPlay?.classList.toggle("is-hidden", playing);
		els.iconPause?.classList.toggle("is-hidden", !playing);
		const label = playing ? t("musicPause") : t("musicPlay");
		els.play?.setAttribute("aria-label", label);
	}

	function updateModeUI(playMode: number): void {
		const isList = playMode === 0;
		const isOne = playMode === 1;
		els.iconModeList?.classList.toggle("is-hidden", !isList);
		els.iconModeOne?.classList.toggle("is-hidden", !isOne);
		els.iconModeShuffle?.classList.toggle("is-hidden", isList || isOne);
		els.mode?.classList.toggle("is-alt", !isList);
		const label = isList ? t("playModeList") : isOne ? t("playModeSingle") : t("playModeShuffle");
		els.mode?.setAttribute("aria-label", label);
	}

	function updateVolumeUI(volume: number, isMuted: boolean): void {
		const pct = isMuted ? 0 : volume * 100;
		if (els.volume && document.activeElement !== els.volume) {
			els.volume.value = String(Math.round(pct));
		}
		const muted = isMuted || volume === 0;
		els.iconVolOn?.classList.toggle("is-hidden", muted);
		els.iconVolOff?.classList.toggle("is-hidden", !muted);
		els.mute?.setAttribute("aria-pressed", String(muted));
	}

	function updateProgressUI(progress: number, currentStr: string, durationStr: string): void {
		if (els.bar) els.bar.style.width = `${progress}%`;
		if (els.thumb) els.thumb.style.left = `${progress}%`;
		els.progress?.setAttribute("aria-valuenow", Math.round(progress).toString());
		if (els.timeCur) els.timeCur.textContent = currentStr;
		if (els.timeTotal) els.timeTotal.textContent = durationStr;
	}

	function updateTrackUI(track: { name: string; artist: string; pic?: string } | null): void {
		if (!track) return;
		if (els.title) {
			els.title.textContent = track.name;
			els.title.title = track.name;
		}
		if (els.artist) {
			els.artist.textContent = track.artist;
			els.artist.title = track.artist;
		}
		if (els.coverImg) {
			els.coverImg.src = track.pic || "";
			els.coverImg.alt = `${track.name} - ${track.artist}`;
			els.cover?.classList.toggle("is-empty", !track.pic);
		}
		if (els.lyric) els.lyric.textContent = "";
		updateProgressUI(0, "0:00", "0:00");
	}

	function updateLyricPreview(lyrics: Array<{ time: number; text: string }>, index: number): void {
		if (!els.lyric) return;
		const line = index >= 0 && index < lyrics.length ? lyrics[index] : undefined;
		els.lyric.textContent = line ? line.text : "";
	}

	function showError(message: string): void {
		if (!els.error) return;
		els.error.textContent = message;
		els.error.classList.remove("is-hidden");
	}

	function hideError(): void {
		els.error?.classList.add("is-hidden");
	}

	// ── 拖拽（进度 1:1，提交才 seek）与音量 ──────────────────
	bindScrub(
		els.progress!,
		(ratio) => {
			seeking = true;
			const duration = mgr.getState().duration || 0;
			updateProgressUI(ratio * 100, formatTime(ratio * duration), els.timeTotal?.textContent ?? "0:00");
		},
		(ratio) => {
			seeking = false;
			mgr.seek(ratio);
		},
		signal,
	);

	els.volume?.addEventListener(
		"input",
		() => {
			mgr.setVolume(Number.parseInt(els.volume?.value ?? "60", 10) / 100);
		},
		{ signal },
	);

	els.play?.addEventListener(
		"click",
		() => {
			if (!mgr.getState().initialized) {
				ensureInit();
				return;
			}
			mgr.togglePlay();
		},
		{ signal },
	);
	els.prev?.addEventListener("click", () => mgr.playPrev(), { signal });
	els.next?.addEventListener("click", () => mgr.playNext(), { signal });
	els.mode?.addEventListener("click", () => mgr.cyclePlayMode(), { signal });
	els.mute?.addEventListener("click", () => mgr.toggleMute(), { signal });

	// ── fm:* 事件订阅 ────────────────────────────────────────
	function on<T>(name: string, handler: (detail: T) => void): void {
		window.addEventListener(name, (event) => {
			handler((event as CustomEvent<T>).detail);
		}, { signal });
	}

	interface TrackInfo {
		name: string;
		artist: string;
		url: string;
		pic?: string;
		lrc?: string;
	}
	interface LyricLine {
		time: number;
		text: string;
	}

	on<{ playlist: TrackInfo[]; playMode: number; volume: number; isMuted: boolean }>("fm:init", (d) => {
		hideError();
		if (d.playlist.length > 0) {
			updateModeUI(d.playMode);
			updateVolumeUI(d.volume, d.isMuted);
		} else if (els.title) {
			els.title.textContent = t("musicNoSongs");
		}
	});

	on<{ index: number; track: TrackInfo }>("fm:track", (d) => {
		hideError();
		updateTrackUI(d.track);
	});

	on<{ isPlaying: boolean }>("fm:play-state", (d) => {
		updatePlayIcons(d.isPlaying);
	});

	on<{ progress: number; currentTimeStr: string; durationStr: string }>("fm:time", (d) => {
		if (seeking) return;
		updateProgressUI(d.progress, d.currentTimeStr, d.durationStr);
	});

	on<{ volume: number; isMuted: boolean }>("fm:volume", (d) => {
		updateVolumeUI(d.volume, d.isMuted);
	});

	on<{ playMode: number }>("fm:mode", (d) => {
		updateModeUI(d.playMode);
	});

	on<{ index: number }>("fm:lrc-index", (d) => {
		updateLyricPreview(mgr.getState().lyrics as LyricLine[], d.index);
	});

	on<{ message: string }>("fm:error", (d) => {
		showError(d.message || t("musicError"));
	});

	// ── 全量同步（脚本晚于引擎初始化时） ─────────────────────
	function syncAll(): void {
		const s = mgr.getState();
		if (!s.initialized) return;
		hideError();
		if (s.playlist.length === 0) {
			if (els.title) els.title.textContent = s.error || t("musicNoSongs");
			return;
		}
		updateTrackUI((s.track as TrackInfo | null) ?? null);
		updatePlayIcons(s.isPlaying);
		updateModeUI(s.playMode);
		updateVolumeUI(s.volume, s.isMuted);
		if (s.duration > 0) updateProgressUI(s.progress, s.currentTimeStr, s.durationStr);
		updateLyricPreview(s.lyrics as LyricLine[], s.currentLrcIndex);
	}

	bindPressFeedback(root);

	if (mgr.getState().initialized) syncAll();
}
