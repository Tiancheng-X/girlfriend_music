// 新写：中文文案常量表（替换 my-blog 的 I18nKey + i18n() 体系，只保留播放器用到的 key）
// key 清单由移植代码里的 i18n(I18nKey.*) 调用点 grep 得出，取值沿用 my-blog 的 zh_CN 文案。

export const ZH = {
	music: "音乐",
	musicNoPlaying: "暂未播放",
	musicLyrics: "歌词",
	musicVolume: "音量",
	musicPlayMode: "切换播放模式",
	musicPrev: "上一首",
	musicNext: "下一首",
	musicPlaylist: "列表",
	musicNoLyrics: "暂无歌词",
	musicLoadingLyrics: "正在加载歌词...",
	musicFailedLyrics: "歌词加载失败",
	musicNoSongs: "暂无歌曲",
	musicError: "播放器错误",
	musicPlay: "播放",
	musicPause: "暂停",
	musicProgress: "播放进度",
	musicNoCover: "暂无封面",
	playModeList: "列表循环",
	playModeSingle: "单曲循环",
	playModeShuffle: "随机播放",
	npNowPlaying: "正在播放",
	npCollapse: "收起",
	musicQueue: "播放队列",
} as const;

export type I18nKey = keyof typeof ZH;

export function t(key: I18nKey): string {
	return ZH[key];
}

export default ZH;
