// 大播放器控制器：订阅 window.__fireflyMusic 的 fm:* 事件，把引擎状态渲染到 BigPlayer.astro 的结构上。
import { t } from "@/i18n/zh";

interface LyricLine {
	time: number;
	text: string;
}

interface TrackInfo {
	name: string;
	artist: string;
	url: string;
	pic?: string;
	lrc?: string;
}

interface InitDetail {
	playlist: TrackInfo[];
	playMode: number;
	volume: number;
	isMuted: boolean;
}

interface TrackDetail {
	index: number;
	track: TrackInfo;
}

interface PlayStateDetail {
	isPlaying: boolean;
}

interface ModeDetail {
	playMode: number;
}

interface VolumeDetail {
	volume: number;
	isMuted: boolean;
}

interface TimeDetail {
	progress: number;
	currentTimeStr: string;
	durationStr: string;
}

interface LyricsDetail {
	lyrics: LyricLine[];
	status: string;
}

interface LrcIndexDetail {
	index: number;
}

interface ErrorDetail {
	message?: string;
}

/** 用户手动滚动歌词后，暂停自动跟随的时长（ms） */
const LYRICS_SCROLL_RESUME_MS = 3000;

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
	const min = Math.floor(seconds / 60);
	const sec = Math.floor(seconds % 60);
	return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

/**
 * 挂载大播放器。引擎单例缺失（脚本未执行）或结构不完整时直接返回，
 * 不创建任何 <audio>：播放始终经由 window.__fireflyMusic。
 */
export function setupBigPlayer(): void {
	const rootElement = document.querySelector<HTMLElement>("[data-big-player]");
	const musicManager = window.__fireflyMusic;
	if (!rootElement || !musicManager) return;
	const root = rootElement;
	const mgr = musicManager;

	const $ = <T extends HTMLElement>(selector: string): T | null =>
		root.querySelector<T>(selector);

	const ui = {
		cover: $("[data-big-player-cover]"),
		coverImg: $<HTMLImageElement>(".big-player__cover-img"),
		title: $(".big-player__title"),
		artist: $(".big-player__artist"),
		btnPlay: $("[data-big-player-play]"),
		iconPlay: $(".big-player__icon-play"),
		iconPause: $(".big-player__icon-pause"),
		btnPrev: $("[data-big-player-prev]"),
		btnNext: $("[data-big-player-next]"),
		btnMode: $("[data-big-player-mode]"),
		iconModeList: $(".big-player__icon-mode-list"),
		iconModeOne: $(".big-player__icon-mode-one"),
		iconModeShuffle: $(".big-player__icon-mode-shuffle"),
		modeLabel: $("[data-big-player-mode-label]"),
		btnMute: $("[data-big-player-mute]"),
		iconVolOn: $(".big-player__icon-vol-on"),
		iconVolOff: $(".big-player__icon-vol-off"),
		volumeSlider: $("[data-big-player-volume]"),
		progress: $("[data-big-player-progress]"),
		timeCurrent: $("[data-big-player-time-current]"),
		timeTotal: $("[data-big-player-time-total]"),
		lyricsList: $("[data-big-player-lyrics]"),
		playlistList: $("[data-big-player-playlist]"),
		count: $("[data-big-player-count]"),
		error: $("[data-big-player-error]"),
		itemTemplate: document.querySelector<HTMLTemplateElement>(
			"#big-player-item-template",
		),
	};

	const required: (Element | null)[] = [
		ui.cover,
		ui.coverImg,
		ui.title,
		ui.btnPlay,
		ui.btnPrev,
		ui.btnNext,
		ui.btnMode,
		ui.btnMute,
		ui.volumeSlider,
		ui.progress,
		ui.timeCurrent,
		ui.timeTotal,
		ui.lyricsList,
		ui.playlistList,
		ui.itemTemplate,
	];
	if (required.some((element) => element === null)) return;

	const abort = new AbortController();
	const signal = abort.signal;

	let isSeeking = false;
	let isUserScrollingLyrics = false;
	let lyricsScrollTimer: number | null = null;
	let currentLrcIndex = -1;
	let activeItem: HTMLElement | null = null;

	// ── 通用小工具 ──────────────────────────────────────────
	function setHidden(element: HTMLElement | null, hidden: boolean): void {
		element?.classList.toggle("is-hidden", hidden);
	}

	function setText(element: HTMLElement | null, text: string): void {
		if (element && element.textContent !== text) element.textContent = text;
	}

	function renderPlaceholder(container: HTMLElement, text: string): void {
		const hint = document.createElement("p");
		hint.className = "big-player__hint";
		hint.textContent = text;
		container.replaceChildren(hint);
	}

	// ── 渲染 ────────────────────────────────────────────────
	function applyTrack(track: TrackInfo | null): void {
		const pic = track?.pic ?? "";
		ui.cover?.classList.toggle("is-empty", pic === "");
		if (ui.coverImg) {
			if (pic === "" || !track) {
				ui.coverImg.removeAttribute("src");
				ui.coverImg.alt = "";
			} else {
				ui.coverImg.src = pic;
				ui.coverImg.alt = `${track.name} - ${track.artist}`;
			}
		}
		setText(ui.title, track ? track.name : t("musicNoPlaying"));
		if (ui.title) ui.title.title = track ? track.name : "";
		setText(ui.artist, track ? track.artist : "");
	}

	function applyPlayState(playing: boolean): void {
		root.dataset.playing = playing ? "true" : "false";
		setHidden(ui.iconPlay, playing);
		setHidden(ui.iconPause, !playing);
		const label = playing ? t("musicPause") : t("musicPlay");
		ui.btnPlay?.setAttribute("aria-label", label);
	}

	function applyMode(mode: number): void {
		const isList = mode === 0;
		const isOne = mode === 1;
		setHidden(ui.iconModeList, !isList);
		setHidden(ui.iconModeOne, !isOne);
		setHidden(ui.iconModeShuffle, isList || isOne);
		const label = isList
			? t("playModeList")
			: isOne
				? t("playModeSingle")
				: t("playModeShuffle");
		setText(ui.modeLabel, label);
		ui.btnMode?.setAttribute("aria-label", label);
		ui.btnMode?.classList.toggle("is-active", !isList);
	}

	function applyVolume(volume: number, isMuted: boolean): void {
		const percent = isMuted ? 0 : Math.round(volume * 100);
		ui.volumeSlider?.style.setProperty("--vol", percent.toString());
		ui.volumeSlider?.setAttribute("aria-valuenow", percent.toString());
		const muted = isMuted || volume === 0;
		setHidden(ui.iconVolOn, muted);
		setHidden(ui.iconVolOff, !muted);
		ui.btnMute?.setAttribute("aria-pressed", muted ? "true" : "false");
	}

	function applyTime(
		progress: number,
		currentTimeStr: string,
		durationStr: string,
	): void {
		const clamped = Number.isFinite(progress)
			? Math.min(100, Math.max(0, progress))
			: 0;
		ui.progress?.style.setProperty("--progress", clamped.toFixed(2));
		ui.progress?.setAttribute("aria-valuenow", Math.round(clamped).toString());
		setText(ui.timeCurrent, currentTimeStr);
		setText(ui.timeTotal, durationStr);
	}

	function showError(message: string): void {
		if (!ui.error) return;
		ui.error.textContent = message;
		ui.error.classList.remove("is-hidden");
	}

	function hideError(): void {
		ui.error?.classList.add("is-hidden");
	}

	// ── 歌单 ────────────────────────────────────────────────
	function revealItem(item: HTMLElement): void {
		const list = ui.playlistList;
		if (!list) return;
		const listRect = list.getBoundingClientRect();
		const itemRect = item.getBoundingClientRect();
		if (itemRect.top < listRect.top) {
			list.scrollTop -= listRect.top - itemRect.top;
		} else if (itemRect.bottom > listRect.bottom) {
			list.scrollTop += itemRect.bottom - listRect.bottom;
		}
	}

	function applyActiveIndex(index: number): void {
		const list = ui.playlistList;
		if (!list) return;
		const next = list.querySelector<HTMLElement>(
			`[data-big-player-item][data-index="${index}"]`,
		);
		if (next === activeItem) return;
		if (activeItem) {
			activeItem.classList.remove("is-active");
			activeItem.removeAttribute("aria-current");
			activeItem.setAttribute("aria-selected", "false");
		}
		activeItem = next;
		if (activeItem) {
			activeItem.classList.add("is-active");
			activeItem.setAttribute("aria-current", "true");
			activeItem.setAttribute("aria-selected", "true");
			revealItem(activeItem);
		}
	}

	function renderPlaylist(playlist: TrackInfo[], currentIndex: number): void {
		const list = ui.playlistList;
		const template = ui.itemTemplate;
		if (!list || !template) return;
		activeItem = null;
		setText(ui.count, playlist.length.toString());
		list.setAttribute("aria-busy", "false");
		if (playlist.length === 0) {
			renderPlaceholder(list, t("musicNoSongs"));
			return;
		}
		const fragment = document.createDocumentFragment();
		playlist.forEach((track, index) => {
			const clone = template.content.cloneNode(true) as DocumentFragment;
			const item = clone.querySelector<HTMLElement>("[data-big-player-item]");
			const order = clone.querySelector<HTMLElement>(".big-player__item-index");
			const title = clone.querySelector<HTMLElement>(".big-player__item-title");
			const artist = clone.querySelector<HTMLElement>(".big-player__item-artist");
			if (!item || !order || !title || !artist) return;
			item.dataset.index = index.toString();
			item.setAttribute("aria-selected", "false");
			item.setAttribute("aria-label", `${track.name} - ${track.artist}`);
			order.textContent = (index + 1).toString();
			title.textContent = track.name;
			title.title = track.name;
			artist.textContent = track.artist;
			artist.title = track.artist;
			fragment.appendChild(clone);
		});
		list.replaceChildren(fragment);
		applyActiveIndex(currentIndex);
	}

	// ── 歌词 ────────────────────────────────────────────────
	function scrollLyricIntoView(index: number): void {
		const list = ui.lyricsList;
		if (!list) return;
		const line = list.querySelector<HTMLElement>(`[data-index="${index}"]`);
		if (!line) return;
		const listRect = list.getBoundingClientRect();
		const lineRect = line.getBoundingClientRect();
		const target =
			list.scrollTop +
			(lineRect.top - listRect.top) -
			list.clientHeight / 2 +
			lineRect.height / 2;
		list.scrollTo({
			top: Math.max(0, target),
			behavior: prefersReducedMotion() ? "auto" : "smooth",
		});
	}

	function applyLrcIndex(index: number): void {
		if (index === currentLrcIndex) return;
		currentLrcIndex = index;
		const list = ui.lyricsList;
		if (!list) return;
		list.querySelectorAll<HTMLElement>(".big-player__lrc-line").forEach((line) => {
			const active = Number.parseInt(line.dataset.index ?? "-1", 10) === index;
			line.classList.toggle("is-active", active);
			line.setAttribute("aria-selected", active ? "true" : "false");
		});
		if (index >= 0 && !isUserScrollingLyrics) scrollLyricIntoView(index);
	}

	function renderLyrics(lines: LyricLine[], status: string): void {
		const list = ui.lyricsList;
		if (!list) return;
		currentLrcIndex = -1;
		if (status === "loading") {
			renderPlaceholder(list, t("musicLoadingLyrics"));
			return;
		}
		if (status === "failed") {
			renderPlaceholder(list, t("musicFailedLyrics"));
			return;
		}
		if (lines.length === 0) {
			renderPlaceholder(list, t("musicNoLyrics"));
			return;
		}
		const fragment = document.createDocumentFragment();
		lines.forEach((line, index) => {
			const element = document.createElement("div");
			element.className = "big-player__lrc-line";
			element.dataset.index = index.toString();
			element.setAttribute("role", "option");
			element.setAttribute("aria-selected", "false");
			element.textContent = line.text;
			fragment.appendChild(element);
		});
		list.replaceChildren(fragment);
	}

	function resumeLyricsFollow(): void {
		if (lyricsScrollTimer !== null) window.clearTimeout(lyricsScrollTimer);
		lyricsScrollTimer = window.setTimeout(() => {
			lyricsScrollTimer = null;
			isUserScrollingLyrics = false;
			if (currentLrcIndex >= 0) scrollLyricIntoView(currentLrcIndex);
		}, LYRICS_SCROLL_RESUME_MS);
	}

	// ── 滑块拖拽（进度 / 音量共用） ──────────────────────────
	function bindSlider(
		surface: HTMLElement | null,
		onInput: (ratio: number) => void,
		onCommit?: (ratio: number) => void,
	): void {
		if (!surface) return;
		const rail = surface;
		surface.addEventListener(
			"pointerdown",
			(event: PointerEvent) => {
				if (event.pointerType === "mouse" && event.button !== 0) return;
				event.preventDefault();
				rail.setPointerCapture(event.pointerId);
				rail.classList.add("is-dragging");
				const ratioAt = (clientX: number): number => {
					const rect = rail.getBoundingClientRect();
					return Math.min(
						1,
						Math.max(0, (clientX - rect.left) / (rect.width || 1)),
					);
				};
				onInput(ratioAt(event.clientX));
				const onMove = (moveEvent: PointerEvent): void => {
					onInput(ratioAt(moveEvent.clientX));
				};
				const onUp = (upEvent: PointerEvent): void => {
					rail.removeEventListener("pointermove", onMove);
					rail.removeEventListener("pointerup", onUp);
					rail.removeEventListener("pointercancel", onUp);
					rail.classList.remove("is-dragging");
					onCommit?.(ratioAt(upEvent.clientX));
				};
				rail.addEventListener("pointermove", onMove);
				rail.addEventListener("pointerup", onUp);
				rail.addEventListener("pointercancel", onUp);
			},
			{ signal },
		);
	}

	bindSlider(
		ui.progress,
		(ratio) => {
			isSeeking = true;
			const duration = mgr.getState().duration;
			applyTime(
				ratio * 100,
				formatTime(ratio * duration),
				ui.timeTotal?.textContent ?? "0:00",
			);
		},
		(ratio) => {
			isSeeking = false;
			mgr.seek(ratio);
		},
	);

	bindSlider(ui.volumeSlider, (ratio) => {
		mgr.setVolume(ratio);
	});

	// ── 交互 ────────────────────────────────────────────────
	ui.btnPlay?.addEventListener(
		"click",
		() => {
			if (!mgr.getState().initialized) {
				void mgr.init();
				return;
			}
			mgr.togglePlay();
		},
		{ signal },
	);
	ui.btnPrev?.addEventListener("click", () => mgr.playPrev(), { signal });
	ui.btnNext?.addEventListener("click", () => mgr.playNext(), { signal });
	ui.btnMode?.addEventListener("click", () => mgr.cyclePlayMode(), { signal });
	ui.btnMute?.addEventListener("click", () => mgr.toggleMute(), { signal });

	ui.playlistList?.addEventListener(
		"click",
		(event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const item = target.closest<HTMLElement>("[data-big-player-item]");
			if (!item) return;
			const index = Number.parseInt(item.dataset.index ?? "-1", 10);
			if (index >= 0) mgr.playTrackByIndex(index);
		},
		{ signal },
	);

	ui.lyricsList?.addEventListener(
		"click",
		(event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const line = target.closest<HTMLElement>(".big-player__lrc-line");
			if (!line) return;
			const index = Number.parseInt(line.dataset.index ?? "-1", 10);
			const lyric = mgr.getState().lyrics[index];
			if (lyric) mgr.seekToTime(lyric.time);
		},
		{ signal },
	);

	const markUserScroll = (): void => {
		isUserScrollingLyrics = true;
		resumeLyricsFollow();
	};
	ui.lyricsList?.addEventListener("wheel", markUserScroll, {
		passive: true,
		signal,
	});
	ui.lyricsList?.addEventListener("touchstart", markUserScroll, {
		passive: true,
		signal,
	});

	// ── fm:* 事件订阅 ───────────────────────────────────────
	function on<T>(name: string, handler: (detail: T) => void): void {
		window.addEventListener(
			name,
			(event) => {
				handler((event as CustomEvent<T>).detail);
			},
			{ signal },
		);
	}

	on<InitDetail>("fm:init", (detail) => {
		hideError();
		applyMode(detail.playMode);
		applyVolume(detail.volume, detail.isMuted);
		renderPlaylist(detail.playlist, 0);
	});

	on<TrackDetail>("fm:track", (detail) => {
		applyTrack(detail.track);
		applyActiveIndex(detail.index);
		applyTime(0, "0:00", "0:00");
	});

	on<PlayStateDetail>("fm:play-state", (detail) => {
		applyPlayState(detail.isPlaying);
	});

	on<TimeDetail>("fm:time", (detail) => {
		if (isSeeking) return;
		applyTime(detail.progress, detail.currentTimeStr, detail.durationStr);
	});

	on<ModeDetail>("fm:mode", (detail) => {
		applyMode(detail.playMode);
	});

	on<VolumeDetail>("fm:volume", (detail) => {
		applyVolume(detail.volume, detail.isMuted);
	});

	on<LyricsDetail>("fm:lyrics", (detail) => {
		renderLyrics(detail.lyrics, detail.status);
	});

	on<LrcIndexDetail>("fm:lrc-index", (detail) => {
		applyLrcIndex(detail.index);
	});

	on<ErrorDetail>("fm:error", (detail) => {
		showError(detail.message || t("musicError"));
		// 拉不到歌单时把骨架行换成空态，避免一直转
		const state = mgr.getState();
		if (state.playlist.length === 0) renderPlaylist([], 0);
	});

	// ── 初始状态 ────────────────────────────────────────────
	const initial = mgr.getState();
	if (initial.initialized) {
		applyPlayState(initial.isPlaying);
		applyMode(initial.playMode);
		applyVolume(initial.volume, initial.isMuted);
		renderPlaylist(initial.playlist, initial.currentIndex);
		applyTrack(initial.track);
		applyTime(initial.progress, initial.currentTimeStr, initial.durationStr);
		renderLyrics(
			initial.lyrics,
			initial.lyricsStatus ?? (initial.lyrics.length > 0 ? "loaded" : "none"),
		);
		applyLrcIndex(initial.currentLrcIndex);
	} else {
		// 引擎不自行 init：由首页（大播放器）负责首次拉取歌单，胶囊复用同一份状态
		void mgr.init();
	}
}
