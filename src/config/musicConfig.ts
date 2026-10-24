// 新写：播放器配置（精简自 my-blog:src/config/musicConfig.ts，去掉可视化器与本地歌单无关项）

export interface LocalSong {
	name: string;
	artist: string;
	url: string;
	cover?: string;
	lrc?: string;
}

export interface MetingConfig {
	api: string;
	server: string;
	type: string;
	id: string;
	auth?: string;
	fallbackApis?: string[];
}

export type PlayMode = "list" | "one" | "random";

export interface MusicPlayerConfig {
	mode: "meting" | "local";
	volume: number;
	playMode: PlayMode;
	showLyrics: boolean;
	meting: MetingConfig;
	local?: {
		playlist: LocalSong[];
	};
}

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 使用方式："meting" 走 Meting API，"local" 用下面的本地列表
	mode: "meting",

	// 默认音量 (0-1)
	volume: 0.6,

	// 播放模式：list=列表循环, one=单曲循环, random=随机
	playMode: "list",

	// 是否启用歌词
	showLyrics: true,

	meting: {
		// 主接口：qijieya，实测歌单 / 音频 / 封面 / 歌词全链路可用
		api: "https://api.qijieya.cn/meting/?server=:server&type=:type&id=:id",
		// netease=网易云, tencent=QQ音乐, kugou=酷狗
		server: "netease",
		// song=单曲, playlist=歌单, album=专辑, search=搜索
		type: "playlist",
		// 歌单 ID
		id: "8759683642",
		auth: "",
		// 备用接口：主接口失败时按顺序重试
		fallbackApis: [
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		],
	},

	// 本地音乐（mode 为 "local" 时生效，当前留空）
	local: {
		playlist: [],
	},
};
