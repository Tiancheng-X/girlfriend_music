// 新写：mini-player + 正在播放 sheet 的视图控制器。
// 交互定稿见 .scratch/apple-ui-rebuild/issues/04（原型在 prototype/apple-ui-rebuild 分支）：
// - mini 轻点或上拖直通 sheet 拖拽（1:1 跟手），sheet 下拖关闭；
// - 橡皮筋越界、动量投影（d=0.998）取最近吸附点、物理弹簧速度交接、进行中可随时抓住反向；
// - 玻璃材质、氛围背景双层交叉淡入、歌词/列表双 tab。
// 播放引擎仍是 MusicManager 暴露的 window.__fireflyMusic 单例（fm:* 事件广播），本模块只消费。
import { animate, motionValue } from "motion";
import { t } from "@/i18n/zh";
import {
	bindPressFeedback,
	bindScrub,
	clampRubberband,
	createVelocityTracker,
	projectMomentum,
	springForGesture,
} from "./gesture";

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

const PLAYLIST_BATCH = 30;
const LYRICS_SCROLL_RESUME_MS = 3000;
const DRAG_THRESHOLD = 6;

export function setupSheet(): void {
	const sheet = document.querySelector<HTMLElement>("[data-np-sheet]")!;
	const mini = document.querySelector<HTMLElement>("[data-mini-player]")!;
	const engine = window.__fireflyMusic;
	if (!sheet || !mini || !engine) return;
	const mgr = engine;

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
		cover: $(".np-cover"),
		coverImg: $<HTMLImageElement>("[data-np-img]"),
		title: $(".np-title"),
		artist: $(".np-artist"),
		timeCur: $("[data-np-time-current]"),
		timeTotal: $("[data-np-time-total]"),
		progress: $(".np-progress"),
		bar: $(".np-bar"),
		thumb: $(".np-thumb"),
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
		volume: $<HTMLInputElement>("[data-np-volume]"),
		lyricsList: $("[data-lyrics-list]"),
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
		progress: m$("[data-mini-progress]"),
	};

	const critical: (Element | null)[] = [
		els.close, els.cover, els.coverImg, els.title, els.artist, els.progress, els.bar,
		els.thumb, els.mode, els.iconModeList, els.iconModeOne, els.iconModeShuffle, els.prev,
		els.play, els.iconPlay, els.iconPause, els.next, els.mute, els.iconVolOn, els.iconVolOff,
		els.volume, els.lyricsList, els.playlistList, els.itemTemplate, miniEls.img, miniEls.name,
		miniEls.play, miniEls.iconPlay, miniEls.iconPause,
	];
	if (critical.some((el) => el === null)) return;

	// 旧三态胶囊退役后的 localStorage 遗留键清理（票据 07）
	try {
		localStorage.removeItem("music-player-pos");
		localStorage.removeItem("music-pill-lyrics");
	} catch {
		/* 隐私模式写保护时忽略 */
	}

	// ── 本地状态 ─────────────────────────────────────────────
	let openState = false;
	let seeking = false;
	let isUserScrollingLyrics = false;
	let currentLrcIndex = -1;
	let ambientFlip = false;
	let playlistData: TrackInfo[] = [];
	let renderedCount = 0;
	let lyricsScrollTimer: number | null = null;

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
			if (target instanceof Element && target.closest("button, input, .np-tabs, [data-lyrics-list], [data-playlist-list]")) return;
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
		const pct = isMuted ? 0 : volume * 100;
		if (els.volume && document.activeElement !== els.volume) els.volume.value = String(Math.round(pct));
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
		if (miniEls.progress) (miniEls.progress as HTMLElement).style.width = `${progress}%`;
	}

	function updateAmbient(pic?: string): void {
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
		if (miniEls.name) miniEls.name.textContent = track.name;
		if (miniEls.artist) miniEls.artist.textContent = track.artist;
		if (miniEls.img) {
			miniEls.img.src = track.pic || "";
			miniEls.img.alt = `${track.name} - ${track.artist}`;
		}
		updateAmbient(track.pic || undefined);
		updateProgressUI(0, "0:00", "0:00");
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

	// ── 歌词渲染与高亮 ───────────────────────────────────────
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
			lineEl.className = "np-lrc";
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
		updateLrcHighlight(currentLrcIndex, true);
	}

	function updateLrcHighlight(index: number, force = false): void {
		if (index === currentLrcIndex && !force) return;
		currentLrcIndex = index;
		const list = els.lyricsList;
		if (!list) return;
		list.querySelectorAll<HTMLElement>(".np-lrc").forEach((line, i) => {
			line.classList.toggle("is-active", i === index);
		});
		if (index !== -1 && !isUserScrollingLyrics) {
			const line = list.querySelector<HTMLElement>(`.np-lrc[data-index="${index}"]`);
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

	// ── 面板 tab ─────────────────────────────────────────────
	function setPanel(tab: string): void {
		sheet.querySelectorAll<HTMLElement>(".np-tab").forEach((b) => {
			const active = b.dataset.tab === tab;
			b.classList.toggle("is-active", active);
			b.setAttribute("aria-selected", String(active));
		});
		sheet.querySelectorAll<HTMLElement>(".np-panel").forEach((p) => {
			p.classList.toggle("is-active", p.dataset.panel === tab);
		});
	}
	sheet.querySelectorAll<HTMLButtonElement>(".np-tab").forEach((btn) => {
		btn.addEventListener("click", () => setPanel(btn.dataset.tab ?? "lyrics"), { signal });
	});

	// ── 拖拽（进度 / 音量）与按钮 ────────────────────────────
	bindScrub(
		els.progress!,
		(ratio) => {
			seeking = true;
			const duration = mgr.getState().duration || 0;
			const minutes = Math.floor((ratio * duration) / 60);
			const seconds = Math.floor((ratio * duration) % 60);
			updateProgressUI(ratio * 100, `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`, els.timeTotal?.textContent ?? "0:00");
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
		} else if (els.title) {
			els.title.textContent = t("musicNoSongs");
			if (miniEls.name) miniEls.name.textContent = t("musicNoSongs");
		}
	});

	on<{ index: number; track: TrackInfo }>("fm:track", (d) => {
		currentLrcIndex = -1;
		updateTrackUI(d.track);
		updatePlaylistActiveUI(d.index);
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

	on<{ lyrics: LyricLine[]; status: string }>("fm:lyrics", (d) => {
		currentLrcIndex = -1;
		renderLyricsUI(d.lyrics, d.status);
	});

	on<{ index: number }>("fm:lrc-index", (d) => {
		updateLrcHighlight(d.index);
	});

	on<{ message: string }>("fm:error", (d) => {
		if (els.title) els.title.textContent = d.message || t("musicError");
		if (miniEls.name) miniEls.name.textContent = d.message || t("musicError");
	});

	// ── 初始状态与全量同步 ───────────────────────────────────
	function syncAll(): void {
		const s = mgr.getState();
		if (!s.initialized) return;
		if (s.playlist.length === 0) {
			if (els.title) els.title.textContent = s.error || t("musicNoSongs");
			return;
		}
		renderPlaylist(s.playlist as TrackInfo[], s.currentIndex);
		updateTrackUI((s.track as TrackInfo | null) ?? null);
		updatePlayIcons(s.isPlaying);
		updateModeUI(s.playMode);
		updateVolumeUI(s.volume, s.isMuted);
		if (s.duration > 0) updateProgressUI(s.progress, s.currentTimeStr, s.durationStr);
		currentLrcIndex = s.currentLrcIndex;
		renderLyricsUI(s.lyrics as LyricLine[], s.lyrics.length > 0 ? "loaded" : "none");
	}

	bindPressFeedback(sheet);
	bindPressFeedback(mini);

	if (mgr.getState().initialized) syncAll();
}
