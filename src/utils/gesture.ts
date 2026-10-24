// 新写：apple-design-zh 手势与动效的共享工具。
// 弹簧参数与投影公式来自研究票据 02（.scratch/apple-ui-rebuild/research/02-motion.md）：
// 速度交接必须用物理参数弹簧（stiffness/damping），bounce/duration 弹簧会整体丢弃 velocity。
import { animate, motionValue, press, type MotionValue } from "motion";

export type SpringParams = { stiffness: number; damping: number };

/** ζ0.8 / response 0.3 —— sheet 等手势释放（Apple Drawer 参数） */
export const SPRING_GESTURE: SpringParams = { stiffness: 440, damping: 34 };
/** ζ1.0 / response 0.4 —— 普通回位、重定位 */
export const SPRING_REPOSITION: SpringParams = { stiffness: 250, damping: 31 };

export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** reduce 时用过阻尼快收敛弹簧近似「位移换瞬时」，避免任何弹跳 */
export function springForGesture(): SpringParams {
	return prefersReducedMotion()
		? { stiffness: 1200, damping: 90 }
		: { ...SPRING_GESTURE };
}

/** apple-design-zh §9：越界阻尼，越拖越紧但永不硬停 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
	return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** 把越界的原始位移折算成带阻尼的呈现位移 */
export function clampRubberband(raw: number, dimension: number): number {
	if (raw < 0) return -rubberband(-raw, dimension);
	if (raw > dimension) return dimension + rubberband(raw - dimension, dimension);
	return raw;
}

/** apple-design-zh §6 动量投影：current + (v/1000)·d/(1−d)，d 为滚动衰减率 */
export function projectMomentum(velocity: number, d = 0.998): number {
	return (velocity / 1000) * (d / (1 - d));
}

export interface VelocitySample {
	t: number;
	v: number;
}

/** 手指速度追踪：保留小窗口样本，释放时取窗口首尾差值（px/s，带限幅） */
export function createVelocityTracker(limit = 4000) {
	let samples: VelocitySample[] = [];
	return {
		push(value: number): void {
			samples.push({ t: performance.now(), v: value });
			if (samples.length > 8) samples.shift();
		},
		reset(value = 0): void {
			samples = [{ t: performance.now(), v: value }];
		},
		release(): number {
			if (samples.length < 2) return 0;
			const a = samples[Math.max(0, samples.length - 4)];
			const b = samples[samples.length - 1];
			const dt = (b.t - a.t) / 1000;
			if (dt < 0.02) return 0;
			const raw = (b.v - a.v) / dt;
			return Math.max(-limit, Math.min(limit, raw));
		},
	};
}

/**
 * progress 类滑块的 1:1 拖拽：surface 接收并捕获指针，ratio 回调全程连续，
 * 松手时给 commit。返回解绑函数。
 */
export function bindScrub(
	surface: HTMLElement,
	onRatio: (ratio: number) => void,
	onCommit?: (ratio: number) => void,
	signal?: AbortSignal,
): void {
	surface.addEventListener(
		"pointerdown",
		(event) => {
			event.preventDefault();
			surface.setPointerCapture(event.pointerId);
			const rect = surface.getBoundingClientRect();
			const apply = (clientX: number): number => {
				const raw = (clientX - rect.left) / (rect.width || 1);
				const ratio = Math.min(1, Math.max(0, raw));
				onRatio(ratio);
				return ratio;
			};
			apply(event.clientX);
			const move = (moveEvent: PointerEvent): void => {
				apply(moveEvent.clientX);
			};
			const up = (upEvent: PointerEvent): void => {
				surface.removeEventListener("pointermove", move);
				surface.removeEventListener("pointerup", up);
				surface.removeEventListener("pointercancel", up);
				if (onCommit) onCommit(apply(upEvent.clientX));
			};
			surface.addEventListener("pointermove", move);
			surface.addEventListener("pointerup", up);
			surface.addEventListener("pointercancel", up);
		},
		{ signal },
	);
}

/**
 * 全部按钮的按压即时反馈（apple-design-zh §1：pointer-down 即响应）。
 * press() 自带键盘可达性（focus + Enter 触发）。
 */
export function bindPressFeedback(root: ParentNode): void {
	root.querySelectorAll<HTMLElement>("button").forEach((el) => {
		press(el, (element) => {
			if (prefersReducedMotion()) return () => undefined;
			animate(element, { scale: 0.94 }, { duration: 0.1, ease: "easeOut" });
			return () => {
				animate(element, { scale: 1 }, { type: "spring", bounce: 0, duration: 0.3 });
			};
		});
	});
}

export type { MotionValue };
export { animate, motionValue };
