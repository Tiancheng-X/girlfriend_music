// 重写（v3，AMLL 沉浸式）：mini-player + 队列 sheet 的视图控制器。
// 手势定稿见 .scratch/apple-ui-rebuild/issues/04：轻点/上拖展开、1:1 跟手、
// 橡皮筋、动量投影、物理弹簧速度交接、进行中可反向抓取。
// 流体背景由 src/utils/amll.ts 桥接 AMLL；歌词在主页面（big-player-controller）。
import { animate, motionValue } from "motion";
import { initAmllBackground, setAmllBackgroundCover } from "@/utils/amll";
import { t } from "@/i18n/zh";
import {
	bindMediaButtonBounce,
	createBouncingSlider,
} from "./bouncing-slider";
import {
	clampRubberband,
	createVelocityTracker,
	projectMomentum,
	springForGesture,
} from "./gesture";

interface TrackInfo {
	name: string;
	artist: string;
	url: string;
	pic?: string;
	lrc?: string;
}

const PLAYLIST_BATCH = 30;
const DRAG_THRESHOLD = 6;

function formatTime(seconds: number): string {
	if (!seconds || Number.isNaN(seconds)) return "0:00";
	const min = Math.floor(seconds / 60);
	const sec = Math.floor(seconds % 60);
	return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}


export function setupSheet(): void {
	const sheet = document.querySelector<HTMLElement>("[data-np-sheet]")!;
	const mini = document.querySelector<HTMLElement>("[data-mini-player]")!;
	const engine = window.__fireflyMusic;
	const bgHost = document.querySelector<HTMLElement>("[data-amll-bg]");
	if (!sheet || !mini || !engine) return;
	const mgr = engine; // 类型烘焙：收窄不跨函数声明传播

	const abort = new AbortController();
	const signal = abort.signal;

	const $ = <T extends HTMLElement = HTMLElement>(selector: string): T | null =>
		sheet.querySelector<T>(selector);
	const m$ = <T extends HTMLElement = HTMLElement>(selector: string): T | null =>
		mini.querySelector<T>(selector);

	const scrim = document.querySelector<HTMLElement>("[data-scrim]");
	const ambA = document.querySelector<HTMLElement>("[data-ambient-a]");
	const ambB = document.querySelector<HTMLElement>("[data-ambient-b]");
	const els = {
		close: $<HTMLButtonElement>("[data-sheet-close]"),
		timeCur: $("[data-np-time-current]"),
		timeTotal: $("[data-np-time-total]"),
		progressSliderHost: $("[data-np-progress-slider]"),
		mode: $<HTMLButtonElement>("[data-np-mode]"),
		iconModeList: $(".icon-mode-list"),
		iconModeOne: $(".icon-mode-one"),
		iconModeShuffle: $(".icon-mode-shuffle"),
		prev: $<HTMLButtonElement>("[data-np-prev]"),
		play: $<HTMLButtonElement>("[data-np-play]"),
		iconPlay: $(".np-play .icon-play"),
		iconPause: $(".np-play .icon-pause"),
		next: $<HTMLButtonElement>("[data-np-next]"),
		mute: $<HTMLButtonElement>("[data-np-mute]"),
		iconVolOn: $(".icon-vol-on"),
		iconVolOff: $(".icon-vol-off"),
		volSliderHost: $("[data-np-volume-slider]"),
		playlistList: $("[data-playlist-list]"),
		itemTemplate: document.querySelector<HTMLTemplateElement>("[data-playlist-template]"),
	};
	const miniEls = {
		img: m$<HTMLImageElement>("[data-mini-img]"),
		name: m$(".mini-name"),
		artist: m$(".mini-artist"),
		play: m$<HTMLButtonElement>("[data-mini-play]"),
		iconPlay: m$(".icon-play"),
		iconPause: m$(".icon-pause"),
		eq: m$(".mini-eq"),
	};

	const critical: (Element | null)[] = [
		els.close, els.timeCur, els.timeTotal, els.progressSliderHost, els.mode,
		els.iconModeList, els.iconModeOne, els.iconModeShuffle, els.prev, els.play, els.iconPlay,
		els.iconPause, els.next, els.mute, els.iconVolOn, els.iconVolOff, els.volSliderHost,
		els.playlistList, els.itemTemplate, miniEls.img, miniEls.name, miniEls.play,
		miniEls.iconPlay, miniEls.iconPause,
	];
	if (critical.some((el) => el === null)) return;

	function getAudio(): HTMLAudioElement | null {
		return document.getElementById("firefly-music-audio") as HTMLAudioElement | null;
	}

	function remainingStr(durationSec: number, currentSec: number): string {
		return durationSec > 0 ? `-${formatTime(durationSec - currentSec)}` : "0:00";
	}

	// 旧三态胶囊退役后的 localStorage 遗留键清理
	try {
		localStorage.removeItem("music-player-pos");
		localStorage.removeItem("music-pill-lyrics");
	} catch {
		/* 隐私模式写保护时忽略 */
	}

	// ── AMLL 流体背景 ─────────────────────────────────────────
	initAmllBackground({ bgHost });

	// ── 本地状态 ─────────────────────────────────────────────
	let openState = false;
	let seeking = false;
	let ambientFlip = false;
	let playlistData: TrackInfo[] = [];
	let renderedCount = 0;

	// ── sheet 位移弹簧（motion MotionValue：拖拽期 set()，释放 animate() 接管）──
	const sheetHeight = (): number => window.innerHeight;
	const y = motionValue(sheetHeight());

	function renderSheet(value: number): void {
		const h = sheetHeight();
		const progress = Math.max(0, Math.min(1, 1 - value / h));
		sheet.style.transform = `translateY(${value}px)`;
		if (scrim) scrim.style.opacity = (0.5 * progress).toFixed(3);
		const closed = value >= h - 1;
		sheet.toggleAttribute("data-closed", closed);
		sheet.style.visibility = closed ? "hidden" : "visible";
	}
	y.on("change", renderSheet);
	renderSheet(y.get());

	function lockBody(lock: boolean): void {
		document.body.classList.toggle("np-lock", lock);
	}

	function ensureInit(): void {
		if (mgr.getState().initialized) return;
		void mgr.init();
	}

	function openSheet(): void {
		if (openState) return;
		openState = true;
		ensureInit();
		lockBody(true);
		const sp = springForGesture();
		animate(y, 0, { type: "spring", stiffness: sp.stiffness, damping: sp.damping });
	}

	function closeSheet(): void {
		if (!openState) return;
		openState = false;
		lockBody(false);
		const sp = springForGesture();
		animate(y, sheetHeight(), { type: "spring", stiffness: sp.stiffness, damping: sp.damping });
	}

	const tracker = createVelocityTracker();

	/** 松手：动量投影取最近吸附点，物理弹簧接住手指速度 */
	function releaseDrag(): void {
		const velocity = tracker.release();
		const projected = y.get() + projectMomentum(velocity);
		const target = projected > sheetHeight() / 2 ? sheetHeight() : 0;
		openState = target === 0;
		lockBody(openState);
		const sp = springForGesture();
		animate(y, target, { type: "spring", stiffness: sp.stiffness, damping: sp.damping, velocity });
	}

	// ── mini 手势：轻点展开；上拖过阈值直通 sheet 拖拽 ────────
	interface MiniDrag {
		pointerId: number;
		startY: number;
		mode: "pending" | "sheet";
	}
	let miniDrag: MiniDrag | null = null;

	mini.addEventListener(
		"pointerdown",
		(event) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			if (event.target instanceof Element && event.target.closest("button")) return;
			event.preventDefault();
			mini.setPointerCapture(event.pointerId);
			miniDrag = { pointerId: event.pointerId, startY: event.clientY, mode: "pending" };
		},
		{ signal },
	);

	mini.addEventListener(
		"pointermove",
		(event) => {
			if (!miniDrag || miniDrag.pointerId !== event.pointerId) return;
			const dy = event.clientY - miniDrag.startY;
			if (miniDrag.mode === "pending" && dy < -DRAG_THRESHOLD) {
				miniDrag.mode = "sheet";
				openState = true;
				ensureInit();
				lockBody(true);
				tracker.reset(sheetHeight());
			}
			if (miniDrag.mode === "sheet") {
				const next = clampRubberband(sheetHeight() + dy, sheetHeight());
				y.set(next);
				tracker.push(next);
			}
		},
		{ signal },
	);

	function endMiniDrag(event: PointerEvent): void {
		if (!miniDrag || miniDrag.pointerId !== event.pointerId) return;
		if (miniDrag.mode === "sheet") releaseDrag();
		else openSheet();
		miniDrag = null;
	}
	mini.addEventListener("pointerup", endMiniDrag, { signal });
	mini.addEventListener("pointercancel", endMiniDrag, { signal });

	// ── sheet 手势：非交互区下拖关闭（列表区域留给原生滚动） ──
	interface SheetDrag {
		pointerId: number;
		startY: number;
		originY: number;
	}
	let sheetDrag: SheetDrag | null = null;

	sheet.addEventListener(
		"pointerdown",
		(event) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			const target = event.target;
			if (target instanceof Element && target.closest("button, input, [data-playlist-list], [data-np-progress-slider], [data-np-volume-slider]")) return;
			event.preventDefault();
			sheet.setPointerCapture(event.pointerId);
			sheetDrag = { pointerId: event.pointerId, startY: event.clientY, originY: y.get() };
			tracker.reset(y.get());
		},
		{ signal },
	);

	sheet.addEventListener(
		"pointermove",
		(event) => {
			if (!sheetDrag || sheetDrag.pointerId !== event.pointerId) return;
			const next = clampRubberband(sheetDrag.originY + (event.clientY - sheetDrag.startY), sheetHeight());
			y.set(next);
			tracker.push(next);
		},
		{ signal },
	);

	function endSheetDrag(event: PointerEvent): void {
		if (!sheetDrag || sheetDrag.pointerId !== event.pointerId) return;
		releaseDrag();
		sheetDrag = null;
	}
	sheet.addEventListener("pointerup", endSheetDrag, { signal });
	sheet.addEventListener("pointercancel", endSheetDrag, { signal });

	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape" && openState) closeSheet();
		},
		{ signal },
	);

	window.addEventListener(
		"resize",
		() => {
			if (!openState) y.jump(sheetHeight());
		},
		{ passive: true, signal },
	);

	// 大播放器等处的「播放队列」入口
	document.querySelectorAll<HTMLElement>("[data-open-sheet]").forEach((btn) => {
		btn.addEventListener("click", () => openSheet(), { signal });
	});

	// ── UI 更新 ──────────────────────────────────────────────
	function updatePlayIcons(playing: boolean): void {
		els.iconPlay?.classList.toggle("is-hidden", playing);
		els.iconPause?.classList.toggle("is-hidden", !playing);
		miniEls.iconPlay?.classList.toggle("is-hidden", playing);
		miniEls.iconPause?.classList.toggle("is-hidden", !playing);
		miniEls.eq?.classList.toggle("is-on", playing);
		const label = playing ? t("musicPause") : t("musicPlay");
		els.play?.setAttribute("aria-label", label);
		miniEls.play?.setAttribute("aria-label", label);
	}

	function updateModeUI(playMode: number): void {
		const isList = playMode === 0;
		const isOne = playMode === 1;
		els.iconModeList?.classList.toggle("is-hidden", !isList);
		els.iconModeOne?.classList.toggle("is-hidden", !isOne);
		els.iconModeShuffle?.classList.toggle("is-hidden", isList || isOne);
		els.mode?.classList.toggle("is-alt", !isList);
		const label = isList
			? t("playModeList")
			: isOne
				? t("playModeSingle")
				: t("playModeShuffle");
		els.mode?.setAttribute("aria-label", label);
	}

	function updateVolumeUI(volume: number, isMuted: boolean): void {
		volumeSlider.setValue(volume);
		const muted = isMuted || volume === 0;
		els.iconVolOn?.classList.toggle("is-hidden", muted);
		els.iconVolOff?.classList.toggle("is-hidden", !muted);
		els.mute?.setAttribute("aria-pressed", String(muted));
	}

	function updateProgressUI(currentStr: string, remaining: string): void {
		if (els.timeCur) els.timeCur.textContent = currentStr;
		if (els.timeTotal) els.timeTotal.textContent = remaining;
	}

	/** CSS 氛围光晕（AMLL 背景不可用时的降级路径）双层交叉淡入 */
	function updateAmbientFallback(pic?: string): void {
		if (!ambA || !ambB) return;
		ambientFlip = !ambientFlip;
		const show = ambientFlip ? ambA : ambB;
		const hide = ambientFlip ? ambB : ambA;
		if (pic) {
			show.style.backgroundImage = `url("${pic}")`;
			show.classList.remove("is-empty");
		} else {
			show.classList.add("is-empty");
		}
		show.classList.add("is-on");
		hide.classList.remove("is-on");
	}

	function updateTrackUI(track: TrackInfo | null): void {
		if (!track) return;
		setAmllBackgroundCover(track.pic || undefined);
		if (miniEls.name) miniEls.name.textContent = track.name;
		if (miniEls.artist) miniEls.artist.textContent = track.artist;
		if (miniEls.img) {
			miniEls.img.src = track.pic || "";
			miniEls.img.alt = `${track.name} - ${track.artist}`;
		}
		updateAmbientFallback(track.pic || undefined);
		updateProgressUI("0:00", "0:00");
	}

	// ── 歌单分批渲染 ─────────────────────────────────────────
	function appendPlaylistBatch(start: number, end: number): void {
		const list = els.playlistList;
		const template = els.itemTemplate;
		if (!list || !template) return;
		const actualEnd = Math.min(end, playlistData.length);
		for (let idx = start; idx < actualEnd; idx += 1) {
			const track = playlistData[idx];
			const clone = template.content.cloneNode(true) as DocumentFragment;
			const item = clone.querySelector<HTMLElement>(".np-item");
			const img = clone.querySelector<HTMLImageElement>(".np-item-cover");
			const indexEl = clone.querySelector<HTMLElement>(".np-item-index");
			const nameEl = clone.querySelector<HTMLElement>(".np-item-name");
			const artistEl = clone.querySelector<HTMLElement>(".np-item-artist");
			if (!item || !img || !indexEl || !nameEl || !artistEl) continue;
			img.src = track.pic || "";
			img.alt = "";
			indexEl.textContent = String(idx + 1);
			nameEl.textContent = track.name;
			artistEl.textContent = track.artist;
			item.dataset.index = idx.toString();
			item.setAttribute("aria-label", `${track.name} - ${track.artist}`);
			item.addEventListener(
				"click",
				() => {
					mgr.playTrackByIndex(Number.parseInt(item.dataset.index ?? "0", 10));
				},
				{ signal },
			);
			list.appendChild(clone);
		}
		renderedCount = actualEnd;
	}

	function onPlaylistScroll(): void {
		const list = els.playlistList;
		if (!list || renderedCount >= playlistData.length) return;
		if (list.scrollTop + list.clientHeight >= list.scrollHeight - 80) {
			appendPlaylistBatch(renderedCount, renderedCount + PLAYLIST_BATCH);
		}
	}

	function ensurePlaylistItemVisible(index: number): void {
		if (index < renderedCount || !els.playlistList) return;
		appendPlaylistBatch(renderedCount, index + 1);
		els.playlistList
			.querySelector(`[data-index="${index}"]`)
			?.scrollIntoView({ block: "nearest" });
	}

	function renderPlaylist(playlist: TrackInfo[], currentIndex: number): void {
		playlistData = playlist;
		renderedCount = 0;
		if (els.playlistList) els.playlistList.innerHTML = "";
		if (playlist.length > 0) appendPlaylistBatch(0, PLAYLIST_BATCH);
		els.playlistList?.setAttribute("aria-busy", "false");
		updatePlaylistActiveUI(currentIndex);
	}

	function updatePlaylistActiveUI(currentIndex: number): void {
		if (!els.playlistList) return;
		if (currentIndex >= renderedCount && playlistData.length > 0) {
			ensurePlaylistItemVisible(currentIndex);
		}
		els.playlistList.querySelectorAll<HTMLElement>(".np-item").forEach((el) => {
			const idx = Number.parseInt(el.dataset.index ?? "-1", 10);
			const active = idx === currentIndex;
			el.classList.toggle("is-active", active);
			if (active) el.setAttribute("aria-current", "true");
			else el.removeAttribute("aria-current");
		});
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
	miniEls.play?.addEventListener(
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
	els.close?.addEventListener("click", () => closeSheet(), { signal });

	els.playlistList?.addEventListener("scroll", onPlaylistScroll, { passive: true, signal });

	// ── fm:* 事件订阅 ────────────────────────────────────────
	function on<T>(name: string, handler: (detail: T) => void): void {
		window.addEventListener(name, (event) => {
			handler((event as CustomEvent<T>).detail);
		}, { signal });
	}

	on<{ playlist: TrackInfo[]; playMode: number; volume: number; isMuted: boolean }>("fm:init", (d) => {
		if (d.playlist.length > 0) {
			renderPlaylist(d.playlist, 0);
			updateModeUI(d.playMode);
			updateVolumeUI(d.volume, d.isMuted);
		} else if (miniEls.name) {
			miniEls.name.textContent = t("musicNoSongs");
		}
	});

	on<{ index: number; track: TrackInfo }>("fm:track", (d) => {
		updateTrackUI(d.track);
		updatePlaylistActiveUI(d.index);
	});

	on<{ isPlaying: boolean }>("fm:play-state", (d) => {
		updatePlayIcons(d.isPlaying);
		progressSlider.setPlaying(d.isPlaying);
	});

	on<{ currentTime: number; duration: number; currentTimeStr: string; progress: number }>("fm:time", (d) => {
		if (seeking) return;
		progressSlider.setMax((d.duration || 0) * 1000);
		progressSlider.setValue(d.currentTime * 1000);
		updateProgressUI(d.currentTimeStr, remainingStr(d.duration || 0, d.currentTime));
	});

	on<{ volume: number; isMuted: boolean }>("fm:volume", (d) => {
		updateVolumeUI(d.volume, d.isMuted);
	});

	on<{ playMode: number }>("fm:mode", (d) => {
		updateModeUI(d.playMode);
	});


	on<{ message: string }>("fm:error", (d) => {
		if (miniEls.name) miniEls.name.textContent = d.message || t("musicError");
	});

	// ── 初始状态与全量同步 ───────────────────────────────────
	function syncAll(): void {
		const s = mgr.getState();
		if (!s.initialized) return;
		if (s.playlist.length === 0) {
			if (miniEls.name) miniEls.name.textContent = s.error || t("musicNoSongs");
			return;
		}
		renderPlaylist(s.playlist as TrackInfo[], s.currentIndex);
		updateTrackUI((s.track as TrackInfo | null) ?? null);
		updatePlayIcons(s.isPlaying);
		updateModeUI(s.playMode);
		updateVolumeUI(s.volume, s.isMuted);
		if (s.duration > 0) {
			progressSlider.setMax(s.duration * 1000);
			progressSlider.setValue(s.currentTime * 1000);
			updateProgressUI(s.currentTimeStr, remainingStr(s.duration, s.currentTime));
		}
	}

	bindMediaButtonBounce(sheet);
	bindMediaButtonBounce(mini);

	if (mgr.getState().initialized) syncAll();
}
