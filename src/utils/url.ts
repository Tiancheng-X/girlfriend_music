// 移植自 my-blog:src/utils/url-utils.ts 的 url()（只保留这一个函数，去掉文章 / 标签 / 搜索相关工具）

function joinUrl(...parts: string[]): string {
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

/** 把站内路径拼成带 BASE_URL 的地址，支持子目录部署 */
export function url(path: string): string {
	return joinUrl("", import.meta.env.BASE_URL, path);
}
