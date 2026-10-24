// 重写：首页大播放器（布局 A）的视图控制器。
// 氛围背景与 mini/sheet 由 sheet-controller 负责；本模块只同步大播放器自身 UI：
// 封面/曲名、进度条与音量（AMLL BouncingSlider）、播放模式、歌词面板、fm:* 事件消费。
import { t } from "@/i18n/zh";
import { bindMediaButtonBounce, createBouncingSlider } from "./bouncing-slider";

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
		timeCur: $("[data-time-current]"),
		timeTotal: $("[data-time-total]"),
		progressSliderHost: $("[data-progress-slider]"),
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
		volSliderHost: $("[data-volume-slider]"),
		error: $("[data-error]"),
		lyricsList: $("[data-lyrics-list]"),
	};

	const critical: (Element | null)[] = [
		els.cover, els.coverImg, els.title, els.artist, els.timeCur, els.timeTotal,
		els.progressSliderHost, els.mode, els.iconModeList, els.iconModeOne,
		els.iconModeShuffle, els.prev, els.play, els.iconPlay, els.iconPause, els.next,
		els.mute, els.iconVolOn, els.iconVolOff, els.volSliderHost, els.error, els.lyricsList,
	];
	if (critical.some((el) => el === null)) return;

	let seeking = false;
	let lastDurationSec = 0;

	function getAudio(): HTMLAudioElement | null {
		return document.getElementById("firefly-music-audio") as HTMLAudioElement | null;
	}

	function remainingStr(durationSec: number, currentSec: number): string {
		return durationSec > 0 ? `-${formatTime(durationSec - currentSec)}` : "0:00";
	}

	// ── 进度条 / 音量（AMLL BouncingSlider） ─────────────────
	const progressSlider = createBouncingSlider({
		max: 1,
		getMax: () => (mgr.getState().duration || 0) * 1000,
		isPlaying: () => getAudio()?.paused === false,
		onSeek: (ms, commit) => {
			const durationSec = mgr.getState().duration || 0;
			if (durationSec <= 0) return;
			const sec = ms / 1000;
			if (els.timeCur) els.timeCur.textContent = formatTime(sec);
			if (els.timeTotal) els.timeTotal.textContent = remainingStr(durationSec, sec);
			if (commit) mgr.seekToTime(sec);
		},
		onSeeking: (s) => {
			seeking = s;
		},
	});
	els.progressSliderHost!.appendChild(progressSlider.el);

	const volumeSlider = createBouncingSlider({
		max: 1,
		isPlaying: () => false,
		changeOnDrag: true,
		onSeek: (v) => {
			mgr.setVolume(v);
		},
	});
	els.volSliderHost!.appendChild(volumeSlider.el);

	let currentLrcIndex = -1;
	let isUserScrollingLyrics = false;
	let lyricsScrollTimer: number | null = null;
	const LYRICS_SCROLL_RESUME_MS = 3000;

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
		const muted = isMuted || volume === 0;
		volumeSlider.setValue(volume);
		els.iconVolOn?.classList.toggle("is-hidden", muted);
		els.iconVolOff?.classList.toggle("is-hidden", !muted);
		els.mute?.setAttribute("aria-pressed", String(muted));
	}

	function updateProgressUI(currentStr: string, remaining: string): void {
		if (els.timeCur) els.timeCur.textContent = currentStr;
		if (els.timeTotal) els.timeTotal.textContent = remaining;
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
		updateProgressUI("0:00", "0:00");
	}

	function showError(message: string): void {
		if (!els.error) return;
		els.error.textContent = message;
		els.error.classList.remove("is-hidden");
	}

	function hideError(): void {
		els.error?.classList.add("is-hidden");
	}

	// ── 按钮与音量静音 ────────────────────────────────────────
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

	// ── 歌词列表（自研逐行高亮；AMLL LyricPlayer 存在渲染缺陷，见 amll.ts 注释） ──
	function renderLyricsUI(lyrics: LyricLine[], status: string): void {
		const list = els.lyricsList;
		if (!list) return;
		list.innerHTML = "";
		const placeholder = (text: string): void => {
			const el = document.createElement("p");
			el.className = "np-hint";
			el.textContent = text;
			list.appendChild(el);
		};
		if (status === "loading") {
			placeholder(t("musicLoadingLyrics"));
			return;
		}
		if (status === "failed") {
			placeholder(t("musicFailedLyrics"));
			return;
		}
		if (lyrics.length === 0) {
			placeholder(t("musicNoLyrics"));
			return;
		}
		lyrics.forEach((line, index) => {
			const lineEl = document.createElement("button");
			lineEl.type = "button";
			lineEl.className = "bp-lrc";
			lineEl.textContent = line.text;
			lineEl.dataset.index = index.toString();
			lineEl.setAttribute("role", "option");
			lineEl.addEventListener(
				"click",
				() => {
					mgr.seekToTime(line.time);
				},
				{ signal },
			);
			list.appendChild(lineEl);
		});
		currentLrcIndex = -1;
		updateLrcHighlight(mgr.getState().currentLrcIndex, true);
	}

	function updateLrcHighlight(index: number, force = false): void {
		if (index === currentLrcIndex && !force) return;
		currentLrcIndex = index;
		const list = els.lyricsList;
		if (!list) return;
		list.querySelectorAll<HTMLElement>(".bp-lrc").forEach((line, i) => {
			line.classList.toggle("is-active", i === index);
		});
		if (index !== -1 && !isUserScrollingLyrics) {
			const line = list.querySelector<HTMLElement>(`.bp-lrc[data-index="${index}"]`);
			if (line) {
				list.scrollTo({
					top: line.offsetTop - list.clientHeight / 2 + line.offsetHeight / 2,
					behavior: "smooth",
				});
			}
		}
	}

	function resumeLyricsAutoScroll(): void {
		if (lyricsScrollTimer !== null) window.clearTimeout(lyricsScrollTimer);
		lyricsScrollTimer = window.setTimeout(() => {
			lyricsScrollTimer = null;
			isUserScrollingLyrics = false;
			updateLrcHighlight(mgr.getState().currentLrcIndex, true);
		}, LYRICS_SCROLL_RESUME_MS);
	}

	els.lyricsList?.addEventListener(
		"wheel",
		() => {
			isUserScrollingLyrics = true;
			resumeLyricsAutoScroll();
		},
		{ passive: true, signal },
	);
	els.lyricsList?.addEventListener(
		"touchstart",
		() => {
			isUserScrollingLyrics = true;
			resumeLyricsAutoScroll();
		},
		{ passive: true, signal },
	);

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
		lastDurationSec = 0;
		progressSlider.setMax(1);
		progressSlider.setValue(0);
		updateTrackUI(d.track);
	});

	on<{ isPlaying: boolean }>("fm:play-state", (d) => {
		updatePlayIcons(d.isPlaying);
		progressSlider.setPlaying(d.isPlaying);
	});

	on<{ currentTime: number; duration: number; currentTimeStr: string }>("fm:time", (d) => {
		if (seeking) return;
		lastDurationSec = d.duration || 0;
		progressSlider.setMax(lastDurationSec * 1000);
		progressSlider.setValue(d.currentTime * 1000);
		updateProgressUI(d.currentTimeStr, remainingStr(lastDurationSec, d.currentTime));
	});

	on<{ volume: number; isMuted: boolean }>("fm:volume", (d) => {
		updateVolumeUI(d.volume, d.isMuted);
	});

	on<{ playMode: number }>("fm:mode", (d) => {
		updateModeUI(d.playMode);
	});

	on<{ lyrics: LyricLine[]; status: string }>("fm:lyrics", (d) => {
		renderLyricsUI(d.lyrics, d.status);
	});

	on<{ index: number }>("fm:lrc-index", (d) => {
		updateLrcHighlight(d.index);
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
		if (s.duration > 0) {
			lastDurationSec = s.duration;
			progressSlider.setMax(s.duration * 1000);
			progressSlider.setValue(s.currentTime * 1000);
		}
		updateProgressUI(s.currentTimeStr, remainingStr(s.duration, s.currentTime));
		volumeSlider.setValue(s.volume);
		currentLrcIndex = s.currentLrcIndex;
		renderLyricsUI(s.lyrics as LyricLine[], s.lyrics.length > 0 ? "loaded" : "none");
	}

	bindMediaButtonBounce(root);

	if (mgr.getState().initialized) syncAll();
}
