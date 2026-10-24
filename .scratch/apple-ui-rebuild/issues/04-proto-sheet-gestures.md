# 原型：mini-player + 全屏 sheet 的手势手感

Type: prototype
Status: resolved
Blocked by: 02, 03

## Question

用 prototype skill 做一张可交互原型（临时 HTML 或站点内临时页皆可），验证并定稿：

- sheet 上拉展开 / 下拉关闭：1:1 跟手、橡皮筋、动量投影、速度交接（Motion 弹簧实现）
- mini-player 点击展开的空间锚点（从触发元素长出，`transform-origin` 指向触发者）
- 展开进行中再次抓取的反向中断手感（从当前呈现值续动）
- mini-player 自身的按压即时反馈（pointer-down 高亮，非 click 后）

把定稿的手感参数（spring 参数、投影衰减率、阈值）记进 Answer，执行票据直接抄。

## Comments

- 2026-10-24 用户在手机形态 + 「标准」弹簧档位下评审，未对手感本身提出异议。原型期间修复两处实现 bug：① 隐藏挂载的变体（B/C）切回时 sheet 误开——开/关改为显式逻辑态 `app.open`，尺寸变化时重映射弹簧位置；② `force-mobile` CSS 选择器写错（要求类在后代上，实际挂在根容器），导致手机形态从未真正启用。已在真实浏览器回归：播放走表、上拉展开、快甩关闭（动量投影）、Esc 关闭、歌词高亮，全程零报错。待用户最终确认弹簧档位。

## Answer

2026-10-24 用户定稿（原型实测 + 评审通过）：

- **弹簧手感：标准档**。sheet 开合释放用物理弹簧 `{ type: "spring", stiffness: 440, damping: 34 }`（≈ζ0.8/r0.3）+ 显式/继承 velocity（px/s）；普通回位 `{ stiffness: 250, damping: 31 }`。
- **手势清单（全部实测通过）**：mini-player 轻点或上拖 ≥6px 直通 sheet 拖拽（1:1 跟手）；sheet 头部/封面/空白区下拖关闭；橡皮筋 c=0.55；动量投影 `y + (v/1000)·d/(1−d)`（d=0.998）取最近吸附点后交物理弹簧；动画进行中可随时抓住反向，从呈现值续动（motion 默认语义）；Esc 与收起按钮关闭。
- **sheet 内歌单呈现（雾区定案）**：歌词 / 列表 双 tab 内嵌于 sheet，歌词为默认 tab，列表点击即播。
- 原型 capture：分支 `prototype/apple-ui-rebuild`（prototypes/apple-music-rebuild-proto.html），勿合并 main。
- 执行票据 [07](07-exec-mini-player-sheet.md) 直接照本节与原型代码实现。
