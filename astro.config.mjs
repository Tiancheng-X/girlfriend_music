// @ts-check
import { defineConfig } from "astro/config";

// site 只是占位域名：静态站直接由 Cloudflare Workers 托管静态资源，
// 不依赖 Sitemap / RSS / 绝对 URL 生成，部署到自有域名时再改这里。
export default defineConfig({
	site: "https://girlfriend-music.example.com",
	output: "static",
	trailingSlash: "always",
	build: {
		// 与 wrangler.jsonc 的 html_handling: "force-trailing-slash" 对齐
		format: "directory",
	},
	alias: {
		"@": "./src",
	},
});
