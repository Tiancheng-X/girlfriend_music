// 新写：AMLL 官方 BouncingSlider 的 vanilla 复刻（参照 react-full/src/components/BouncingSlider）。
// 特性：白色 40% 填充 scaleX；轨道粗细 8↔20px 随 hover/拖拽弹性变化（clip-path inset 弹簧）；
// 越界 tanh 弹跳 ±12px（springValue d12/st300）；播放中 rAF 自走；tap 直接 seek；拖拽 1:1。
import { animate, motionValue, springValue } from "motion";

const MAX_HEIGHT = 20;
const MIN_HEIGHT = 8;
const INITIAL_INSET = (MAX_HEIGHT - MIN_HEIGHT) / 2;
const MAX_BOUNCE_DISTANCE = 12;
const DRAG_THRESHOLD = 4;

export interface BouncingSliderOpts {
	/** 进度上限（毫秒或 1，与 value 同单位） */
	max: number;
	/** 可选：实时读取上限（音频时长只有元数据加载后才已知，暂停时拿不到 timeupdate） */
	getMax?: () => number;
	/** 播放中？为 true 时进度按帧自走 */
	isPlaying: () => boolean;
	/** 拖拽/点击产生的值；commit=false 为拖拽中的实时回调，true 为松手提交 */
	onSeek: (value: number, commit: boolean) => void;
	onSeeking?: (seeking: boolean) => void;
	/** 两端图标（可选，opacity .5） */
	beforeIcon?: Element;
	afterIcon?: Element;
	/** 拖拽中是否实时回调（音量条用 true，进度条用 false + 松手提交） */
	changeOnDrag?: boolean;
}

export interface BouncingSliderHandle {
	el: HTMLElement;
	setMax: (max: number) => void;
	/** 外部状态回写（拖拽中自动忽略） */
	setValue: (v: number) => void;
	/** 播放状态：为 true 且未拖拽时进度按帧自走 */
	setPlaying: (v: boolean) => void;
	destroy: () => void;
}

export function createBouncingSlider(opts: BouncingSliderOpts): BouncingSliderHandle {
	let min = 0;
	let max = Math.max(0, opts.max);
	let playing = false;
	let dragging = false;
	let hovering = false;
	let localValue = 0;

	const currentMax = (): number => {
		const dynamic = opts.getMax?.() ?? max;
		return Math.max(max, dynamic);
	};

	const el = document.createElement("div");
	el.className = "amll-nps";
	const inner = document.createElement("div");
	inner.className = "amll-nps-inner";
	const thumb = document.createElement("div");
	thumb.className = "amll-nps-thumb";
	inner.appendChild(thumb);
	el.appendChild(inner);
	if (opts.beforeIcon) el.appendChild(opts.beforeIcon);
	if (opts.afterIcon) el.appendChild(opts.afterIcon);
	el.style.touchAction = "none";
	el.style.cursor = "pointer";

	// 进度填充：scaleX(0→1)
	const progressMv = motionValue(0);
	progressMv.on("change", (v) => {
		thumb.style.transform = `scaleX(${v})`;
	});
	// 轨道厚度：clip-path inset 弹性变化
	const insetMv = motionValue(INITIAL_INSET);
	insetMv.on("change", (v) => {
		inner.style.clipPath = `inset(${v}px 0px round 100px)`;
	});
	inner.style.clipPath = `inset(${INITIAL_INSET}px 0px round 100px)`;
	// 越界弹跳
	const bounceX = springValue<number>(0, { stiffness: 300, damping: 12 });
	bounceX.on("change", (v) => {
		el.style.transform = `translateX(${v}px)`;
	});

	const setProgress = (v: number): void => {
		progressMv.set(Math.max(0, Math.min(1, max > 0 ? v / max : 0)));
	};

	const expand = (): void => {
		animate(insetMv, 0, { type: "tween", ease: "easeOut", duration: 0.28 });
	};
	const collapse = (): void => {
		animate(insetMv, INITIAL_INSET, { type: "spring", stiffness: 200, damping: 12 });
	};

	// ── 指针交互（tap seek + 1:1 拖拽 + 越界弹跳） ─────────────
	let pointerId = -1;
	let startX = 0;
	let moved = false;
	let rect: DOMRect | null = null;

	el.addEventListener("pointerdown", (event) => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		moved = false;
		rect = inner.getBoundingClientRect();
		el.setPointerCapture(event.pointerId);
		event.preventDefault();
	});
	el.addEventListener(
		"pointermove",
		(event) => {
			if (event.pointerId !== pointerId || !rect) return;
			if (!moved && Math.abs(event.clientX - startX) < DRAG_THRESHOLD) return;
			if (!moved) {
				moved = true;
				dragging = true;
				expand();
				opts.onSeeking?.(true);
			}
			const rel = (event.clientX - rect.left) / (rect.width || 1);
			if (rel < 0) bounceX.set(Math.tanh(rel * 2) * MAX_BOUNCE_DISTANCE);
			else if (rel > 1) bounceX.set(Math.tanh((rel - 1) * 2) * MAX_BOUNCE_DISTANCE);
			else bounceX.set(0);
			const clamped = Math.max(0, Math.min(1, rel));
			localValue = min + clamped * (currentMax() - min);
			progressMv.set(clamped);
			if (opts.changeOnDrag) opts.onSeek(localValue, false);
		},
		{ passive: true },
	);
	function endPointer(event: PointerEvent): void {
		if (event.pointerId !== pointerId || !rect) return;
		pointerId = -1;
		if (!moved) {
			// tap：直接 seek 到点位
			const rel = Math.max(0, Math.min(1, (event.clientX - rect.left) / (rect.width || 1)));
			localValue = min + rel * (currentMax() - min);
			setProgress(localValue);
		} else {
			bounceX.set(0);
			dragging = false;
			opts.onSeeking?.(false);
		}
		moved = false;
		rect = null;
		if (hovering) expand();
		else collapse();
		opts.onSeek(localValue, true);
	}
	el.addEventListener("pointerup", endPointer);
	el.addEventListener("pointercancel", endPointer);

	el.addEventListener("pointerenter", () => {
		hovering = true;
		if (!dragging) expand();
	});
	el.addEventListener("pointerleave", () => {
		hovering = false;
		if (!dragging) collapse();
	});

	// ── 播放中按帧自走 ───────────────────────────────────────
	let rafId = requestAnimationFrame(function loop(time) {
		if (playing && !dragging) {
			const cap = currentMax();
			if (cap > 0) {
				localValue = Math.min(cap, localValue + frameDelta(time));
				setProgress(localValue);
			}
		}
		rafId = requestAnimationFrame(loop);
	});
	let lastFrame = 0;
	function frameDelta(time: number): number {
		const delta = lastFrame ? Math.min(time - lastFrame, 100) : 16;
		lastFrame = time;
		return delta;
	}

	return {
		el,
		setMax(next) {
			max = Math.max(0, next);
			setProgress(localValue);
		},
		setValue(v) {
			if (dragging) return;
			localValue = Math.max(min, Math.min(max, v));
			setProgress(localValue);
		},
		setPlaying(v) {
			playing = v;
		},
		destroy() {
			cancelAnimationFrame(rafId);
			el.remove();
		},
	};
}

/** MediaButton 的点击弹跳动画（官方 pressed-animation，accumulate 合成） */
export function bindMediaButtonBounce(root: ParentNode): void {
	root.querySelectorAll<HTMLElement>("button").forEach((btn) => {
		btn.addEventListener(
			"click",
			() => {
				btn.classList.add("is-bouncing");
			},
		);
		btn.addEventListener(
			"animationend",
			() => {
				btn.classList.remove("is-bouncing");
			},
		);
	});
}
