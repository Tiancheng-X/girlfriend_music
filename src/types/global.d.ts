// 移植自 my-blog:src/global.d.ts（只保留 window.__fireflyMusic 的类型声明，去掉 Swup / 搜索 / 可视化相关条目）

export {};

declare global {
	interface Window {
		/**
		 * MusicManager.astro 挂载的播放引擎单例。
		 * 引擎脚本与视图控制器脚本的执行先后不定，因此这里是可选的。
		 */
		__fireflyMusic?: {
			init: () => Promise<void>;
			getState: () => {
				playlist: Array<{
					name: string;
					artist: string;
					url: string;
					pic: string;
					lrc?: string;
				}>;
				currentIndex: number;
				track: {
					name: string;
					artist: string;
					url: string;
					pic: string;
					lrc?: string;
				} | null;
				isPlaying: boolean;
				playMode: number;
				volume: number;
				isMuted: boolean;
				currentTime: number;
				duration: number;
				progress: number;
				currentTimeStr: string;
				durationStr: string;
				lyrics: Array<{ time: number; text: string }>;
				lyricsStatus?: "loading" | "loaded" | "none" | "failed";
				currentLrcIndex: number;
				initialized: boolean;
				error: string | null;
				config: Record<string, unknown>;
			};
			togglePlay: () => void;
			playNext: () => void;
			playPrev: () => void;
			cyclePlayMode: () => void;
			setVolume: (val: number) => void;
			toggleMute: () => void;
			seek: (percent: number) => void;
			seekToTime: (time: number) => void;
			playTrackByIndex: (index: number) => void;
			loadTrack: (index: number, autoPlay: boolean) => void;
			resync: () => void;
		};
	}
}
