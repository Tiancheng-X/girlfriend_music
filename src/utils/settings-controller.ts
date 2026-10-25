// 新写：设置面板（第二张 sheet）的视图控制器。
// 交互与队列 sheet 同机制（底部滑入 + 下拉关闭 + Esc），内容为分组表单：
// 播放模式（引擎 setPlayMode，写回设置存储）、歌词字号、流体背景与动效开关、清除数据。
// 设置的实际应用在 src/utils/settings.ts（applySettings）与 src/utils/amll.ts（背景开关）。
import { animate, motionValue } from "motion";
import { t } from "@/i18n/zh";
import {
	clampRubberband,
	createVelocityTracker,
	projectMomentum,
	springForGesture,
} from "./gesture";
import {
	loadSettings,
	saveSettings,
	SETTINGS_EVENT,
} from "./settings";

const DRAG_THRESHOLD = 4;

export function setupSettingsSheet(): void {
	const sheet = document.querySelector<HTMLElement>("[data-settings-sheet]")!;
	const scrim = document.querySelector<HTMLElement>("[data-settings-scrim]");
	const engine = window.__fireflyMusic;
	if (!sheet) return;

	const abort = new AbortController();
	const signal = abort.signal;

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

	let openState = false;

	function openSheet(): void {
		if (openState) return;
		openState = true;
		lockBody(true);
		renderState();
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

	// ── 下拖关闭（头部/grab 区域；表单控件除外） ──────────────
	const tracker = createVelocityTracker();
	interface Drag {
		pointerId: number;
		startY: number;
		originY: number;
		active: boolean;
	}
	let drag: Drag | null = null;

	sheet.addEventListener(
		"pointerdown",
		(event) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			const target = event.target;
			if (target instanceof Element && target.closest("button, .set-segmented")) return;
			event.preventDefault();
			sheet.setPointerCapture(event.pointerId);
			drag = { pointerId: event.pointerId, startY: event.clientY, originY: y.get(), active: false };
			tracker.reset(y.get());
		},
		{ signal },
	);
	sheet.addEventListener(
		"pointermove",
		(event) => {
			if (!drag || drag.pointerId !== event.pointerId) return;
			const dy = event.clientY - drag.startY;
			if (!drag.active && Math.abs(dy) < DRAG_THRESHOLD) return;
			drag.active = true;
			const next = clampRubberband(drag.originY + dy, sheetHeight());
			y.set(next);
			tracker.push(next);
		},
		{ signal },
	);
	function endDrag(event: PointerEvent): void {
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (drag.active) {
			const velocity = tracker.release();
			const projected = y.get() + projectMomentum(velocity);
			const target = projected > sheetHeight() / 2 ? sheetHeight() : 0;
			openState = target === 0;
			lockBody(openState);
			const sp = springForGesture();
			animate(y, target, { type: "spring", stiffness: sp.stiffness, damping: sp.damping, velocity });
		}
		drag = null;
	}
	sheet.addEventListener("pointerup", endDrag, { signal });
	sheet.addEventListener("pointercancel", endDrag, { signal });

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

	// ── 入口与关闭 ───────────────────────────────────────────
	document.querySelectorAll<HTMLElement>("[data-open-settings]").forEach((btn) => {
		btn.addEventListener("click", () => openSheet(), { signal });
	});
	sheet.querySelector("[data-settings-close]")?.addEventListener("click", () => closeSheet(), { signal });

	// ── 控件渲染 ─────────────────────────────────────────────
	const segPlayMode = sheet.querySelector<HTMLElement>("[data-set-playmode]");
	const segLyricScale = sheet.querySelector<HTMLElement>("[data-set-lyricscale]");
	const swBg = sheet.querySelector<HTMLButtonElement>("[data-set-bgenabled]");
	const swMotion = sheet.querySelector<HTMLButtonElement>("[data-set-motionreduced]");
	const clearBtn = sheet.querySelector<HTMLButtonElement>("[data-set-clear]");

	function markSegmented(host: HTMLElement | null, value: string): void {
		if (!host) return;
		host.querySelectorAll<HTMLButtonElement>(".set-seg").forEach((b) => {
			const active = b.dataset.value === value;
			b.classList.toggle("is-active", active);
			b.setAttribute("aria-checked", String(active));
		});
	}

	function markSwitch(el: HTMLButtonElement | null, on: boolean): void {
		if (!el) return;
		el.setAttribute("aria-checked", String(on));
		el.classList.toggle("is-on", on);
	}

	function renderState(): void {
		const s = loadSettings();
		const playMode = engine?.getState().playMode ?? s.playMode ?? 0;
		markSegmented(segPlayMode, String(playMode));
		markSegmented(segLyricScale, String(s.lyricScale ?? 1));
		markSwitch(swBg, s.bgEnabled !== false);
		markSwitch(swMotion, s.motionReduced === true);
	}

	// ── 控件交互 ─────────────────────────────────────────────
	segPlayMode?.querySelectorAll<HTMLButtonElement>(".set-seg").forEach((b) => {
		b.addEventListener(
			"click",
			() => {
				const v = Number.parseInt(b.dataset.value ?? "0", 10);
				// 引擎 setPlayMode 内部会写回设置存储，并广播 fm:mode 同步传输按钮
				engine?.setPlayMode(v);
				renderState();
			},
			{ signal },
		);
	});
	segLyricScale?.querySelectorAll<HTMLButtonElement>(".set-seg").forEach((b) => {
		b.addEventListener(
			"click",
			() => {
				saveSettings({ lyricScale: Number.parseFloat(b.dataset.value ?? "1") });
			},
			{ signal },
		);
	});
	swBg?.addEventListener(
		"click",
		() => {
			saveSettings({ bgEnabled: loadSettings().bgEnabled === false });
		},
		{ signal },
	);
	swMotion?.addEventListener(
		"click",
		() => {
			saveSettings({ motionReduced: loadSettings().motionReduced !== true });
		},
		{ signal },
	);

	// 清除本地数据：两步确认，防止误触
	let confirmTimer: number | null = null;
	clearBtn?.addEventListener(
		"click",
		() => {
			if (!clearBtn.classList.contains("is-confirm")) {
				clearBtn.classList.add("is-confirm");
				clearBtn.textContent = t("setClearConfirm");
				if (confirmTimer !== null) window.clearTimeout(confirmTimer);
				confirmTimer = window.setTimeout(() => {
					confirmTimer = null;
					clearBtn.classList.remove("is-confirm");
					clearBtn.textContent = t("setClearAction");
				}, 3000);
				return;
			}
			if (confirmTimer !== null) window.clearTimeout(confirmTimer);
			try {
				localStorage.removeItem("amll-settings-v1");
				localStorage.removeItem("music-player-volume");
				localStorage.removeItem("amll-ttml-index-v1");
			} catch {
				/* 忽略 */
			}
			window.location.reload();
		},
		{ signal },
	);

	// ── 外部同步：引擎播放模式变化（传输按钮循环）与设置变更 ──
	window.addEventListener(
		"fm:mode",
		() => renderState(),
		{ signal },
	);
	window.addEventListener(
		SETTINGS_EVENT,
		() => renderState(),
		{ signal },
	);

	renderState();
}
