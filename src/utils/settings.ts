// 新写：站点设置存储（localStorage 单键 JSON）+ 即时应用。
// 引擎（MusicManager，is:inline）直接读写同一键，不经过本模块——键名与结构是两边的契约。
export interface SiteSettings {
	/** 播放模式覆盖：0 列表 / 1 单曲 / 2 随机；缺省走构建配置 */
	playMode?: 0 | 1 | 2;
	/** 歌词字号系数（作用于 .bp-lyrics 的 font-size） */
	lyricScale?: number;
	/** 流体背景开关（关闭回退 CSS 氛围光晕） */
	bgEnabled?: boolean;
	/** 动效减弱（手动覆盖系统 prefers-reduced-motion） */
	motionReduced?: boolean;
}

export const SETTINGS_KEY = "amll-settings-v1";
export const SETTINGS_EVENT = "settings:changed";

const DEFAULTS: Required<Omit<SiteSettings, "playMode">> = {
	lyricScale: 1,
	bgEnabled: true,
	motionReduced: false,
};

export function loadSettings(): SiteSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw) as SiteSettings;
		return { ...DEFAULTS, ...parsed };
	} catch {
		return { ...DEFAULTS };
	}
}

export function saveSettings(patch: Partial<SiteSettings>): SiteSettings {
	const next = { ...loadSettings(), ...patch };
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
	} catch {
		/* 隐私模式写不进去，仅本次会话生效 */
	}
	window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
	applySettings(next);
	return next;
}

/** 把设置作用到文档：歌词字号变量 + 动效减弱根类（背景开关由 amll.ts 自行订阅） */
export function applySettings(s: SiteSettings): void {
	document.documentElement.style.setProperty(
		"--bp-lyrics-scale",
		String(s.lyricScale ?? 1),
	);
	document.documentElement.classList.toggle(
		"force-reduced-motion",
		s.motionReduced === true,
	);
}

// 模块加载即应用已保存设置（刷新页面后状态恢复）
applySettings(loadSettings());
