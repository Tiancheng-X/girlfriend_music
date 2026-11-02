// 新写：封面切换的统一入口（大播放器 / mini-player / 队列缩略图三处共用）。
// 为什么不能直接换 src：浏览器在 src 变更的那一帧就丢弃旧像素，于是看到
// 「旧图消失 → 空底 → 新图突然出现」的跳动。持久封面（大播放器 / mini）因此改成
// 把旧图作为底层留一个 aria-hidden 的覆盖层，新图 decode 完成后淡入覆盖它；
// 队列缩略图每行只加载一次、没有旧图，走纯淡入，不为它造交叉淡层。
// 减弱动效（系统偏好或设置页开关，见 gesture.prefersReducedMotion）时一律瞬时切换。
import { prefersReducedMotion } from "./gesture";

/** 内容淡入时长，必须与 player.css 里 .cover-fade 的 transition 一致 */
const FADE_MS = 240;
/** 兜底撤层：元素不可见时 transitionend 不会来，底层旧图不能永久挂着 */
const FADE_BACKSTOP_MS = FADE_MS + 160;
/** decode 既不 resolve 也不 reject 时（网络一直挂着）也要把封面还原回可见 */
const DECODE_GUARD_MS = 6000;

export interface CoverFadeOptions {
	/** 承载封面的定位容器（.bp-cover / .mini-cover）；缩略图没有旧图，传 null 走纯淡入 */
	container: HTMLElement | null;
	img: HTMLImageElement | null;
	/** 封面地址；空值清空 src，交给调用方的空态（如 .bp-cover.is-empty）兜底 */
	url?: string;
	alt?: string;
	/** 只有真的加载失败（error 事件）才清空 src；调用方据此切回自己的空态（无空态时可省略） */
	onDecodeFail?: () => void;
}

/** 每个目标 img 的代数：异步回调回来时代数已变，说明又切歌了，直接丢弃 */
const generations = new WeakMap<HTMLImageElement, number>();
/** 已经成功显示过封面的 img —— 首次赋值没有「旧图」，不做交叉淡层 */
const rendered = new WeakSet<HTMLImageElement>();
/** 每个容器当前挂着的覆盖层；新建前先清掉，同一容器同一时刻只允许一层 */
const layers = new WeakMap<HTMLElement, HTMLImageElement>();
/** 上一次真正下发过的 url；不用 img.src 比较，避免浏览器把相对路径规整成绝对 URL 后永不相等 */
const appliedUrls = new WeakMap<HTMLImageElement, string>();

/** 撤掉覆盖层并从容器登记表注销，避免下一次切歌把过期旧图当底层 */
function dropLayer(container: HTMLElement | null, layer: HTMLImageElement | null): void {
	if (!layer) return;
	layer.remove();
	if (container && layers.get(container) === layer) layers.delete(container);
}

/** 覆盖层只是旧图的一层静态拷贝，不参与交互也不进无障碍树 */
function createLayer(src: string): HTMLImageElement {
	const layer = document.createElement("img");
	layer.src = src;
	layer.alt = "";
	layer.setAttribute("aria-hidden", "true");
	layer.className = "cover-fade-layer";
	return layer;
}

/** 先把目标压到透明并吃掉这一帧的过渡，保证等会儿是从 0 起的一次淡入 */
function snapToHidden(img: HTMLImageElement): void {
	img.style.transition = "none";
	img.style.opacity = "0";
	void img.offsetWidth;
	img.style.transition = "";
}

/** 监听挂上时图可能早就 load 完了（load 不会再发），这一档之后自己复查一次 */
const READY_RECHECK_MS = 500;

// 先等 load、再 decode：decode() 的 reject 不等于图不可用。
// 旧实现拿 decode() 当唯一判据，而 loading="lazy" 且还没进 DOM/视口的图在 Firefox 会让
// decode() 直接 reject（EncodingError: Invalid image request.，Chrome 不 reject，见
// mdn/content#38034）——于是队列每一行缩略图都被判成「图坏了」、src 被清空，列表整片空白。
// 现在只有 error 事件算失败；decode 失败只意味着首次绘制可能掉一帧，图本身照样可渲染。
function whenDecoded(img: HTMLImageElement, done: (ok: boolean) => void): void {
	// 同一张 img 会被反复换 src，监听器必须一次用完就摘掉，不能越积越多
	const ac = new AbortController();
	let guard = 0;
	let settled = false;
	const settle = (ok: boolean): void => {
		if (settled) return;
		settled = true;
		window.clearTimeout(guard);
		ac.abort();
		done(ok);
	};
	const onLoad = (): void => {
		if (typeof img.decode !== "function") {
			settle(true);
			return;
		}
		// 两条分支都算可用：decoded 只是「已解完，可以直接画」
		img.decode().then(
			() => settle(true),
			() => settle(true),
		);
	};
	img.addEventListener("load", onLoad, { signal: ac.signal });
	img.addEventListener("error", () => settle(false), { signal: ac.signal });
	guard = window.setTimeout(() => {
		if (img.complete && img.naturalWidth > 0) onLoad();
	}, READY_RECHECK_MS);
}

/** 新图淡入结束（或超时兜底）后撤掉底层旧图 */
function finishLayer(
	container: HTMLElement | null,
	img: HTMLImageElement,
	layer: HTMLImageElement | null,
): void {
	if (!layer) return;
	let timer = 0;
	const finish = (): void => {
		img.removeEventListener("transitionend", onEnd);
		window.clearTimeout(timer);
		dropLayer(container, layer);
	};
	const onEnd = (event: TransitionEvent): void => {
		if (event.target === img && event.propertyName === "opacity") finish();
	};
	timer = window.setTimeout(finish, FADE_BACKSTOP_MS);
	img.addEventListener("transitionend", onEnd);
}

export function showCover({
	container,
	img,
	url,
	alt,
	onDecodeFail,
}: CoverFadeOptions): void {
	if (!img) return;
	const next = url ?? "";
	if (alt !== undefined) img.alt = alt;

	// 同一地址重复下发（初始化后的全量同步会重放当前曲目）：保持现状，别再淡一遍。
	// 必须先于代数自增返回，否则会把上一次还在 decode 的等待作废，把封面锁在透明态。
	if (next !== "" && appliedUrls.get(img) === next) return;

	const gen = (generations.get(img) ?? 0) + 1;
	generations.set(img, gen);

	// 该容器上残留的覆盖层：既是要清的旧层，也是「此刻肉眼可见的旧图」
	const stale = container ? layers.get(container) ?? null : null;

	// 空 url：清空 src、撤层、播放器的既有空态照常显示，不做任何动画
	if (next === "") {
		dropLayer(container, stale);
		img.removeAttribute("src");
		img.classList.remove("cover-fade");
		img.style.opacity = "";
		rendered.delete(img);
		appliedUrls.delete(img);
		return;
	}

	// 减弱动效：瞬时换图，无覆盖层、无过渡
	if (prefersReducedMotion()) {
		dropLayer(container, stale);
		img.classList.remove("cover-fade");
		img.style.opacity = "";
		img.src = next;
		appliedUrls.set(img, next);
		rendered.add(img);
		return;
	}

	// 旧图来源优先取覆盖层；没有覆盖层时用上一次下发的 url（首次赋值没有旧图 → null）
	const shown = stale?.getAttribute("src") ?? (rendered.has(img) ? appliedUrls.get(img) ?? null : null);
	img.classList.add("cover-fade");

	// 有容器且有已显示的旧图才做交叉淡；缩略图（container 为 null）走纯淡入。
	// 每次都用新元素拷贝旧图而不复用旧覆盖层：层的身份唯一，过期回调撤层时
	// 不会误伤下一代正在用作底层的同一节点；A→B→A 也照样有底层，不闪空底。
	const layer = container && shown ? createLayer(shown) : null;
	if (layer && container) {
		container.insertBefore(layer, img);
		layers.set(container, layer);
	}
	dropLayer(container, stale);
	snapToHidden(img);

	let guard = 0;
	let settled = false;
	const settle = (ok: boolean): void => {
		if (settled) return;
		settled = true;
		window.clearTimeout(guard);
		if (generations.get(img) !== gen) return; // 过期回调：新的切歌已经接管这张图
		if (!ok) {
			// 真加载失败（error 事件）：还原并清空，交给调用方空态兜底，不留残影也不留隐形封面
			dropLayer(container, layer);
			img.removeAttribute("src");
			img.classList.remove("cover-fade");
			img.style.opacity = "";
			rendered.delete(img);
			appliedUrls.delete(img);
			onDecodeFail?.();
			return;
		}
		rendered.add(img);
		img.style.opacity = "1";
		finishLayer(container, img, layer);
	};

	// 网络一直挂着时 decode 可能永不作答——兜底把封面还原成可见，绝不留在 opacity:0
	guard = window.setTimeout(() => settle(true), DECODE_GUARD_MS);

	appliedUrls.set(img, next);
	img.src = next;
	whenDecoded(img, settle);
}
