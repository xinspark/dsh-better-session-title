# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.3] - 2026-10-29

**修复子智能体会话（三级面包屑）在窄顶栏下的显示**：文字会撑出自己那一级、两级分隔符被挤没、末级的箭头被裁掉。三处都是 CSS 约束问题，**层级、图标、下拉与点击行为一律未变**。

### Fixed

- **文字不再画到层级外面。** `.bst-crumb-text` 补 `min-width:0` —— flex 子项默认 `min-width:auto`，不会小于内容宽度，于是 `text-overflow:ellipsis` 一直没生效；父会话标题（如「智能权限模式插件调试与优化」）会以 196px 画进 95px 的格子里，盖住后面的分隔符与下一级图标。实测证据：容器 269px 时三格 `69+5+95+5+72`（含间隙正好塞满），说明不是空间不够，而是文字溢出。
- **分隔符不再被压成 0 宽。** `.bst-sep` 补 `flex:none`；此前容器变窄时两个 `/` 会被挤没。
- **末级箭头不再被裁。** `.bst-crumb` 改为 flex 容器、按钮 `flex:1 1 auto`，按钮永远不会长于所属层级；此前末级格 165px 放不下「图标+文字+箭头」，多出的部分被外层 `overflow:hidden` 切平（表现为半个字 + 箭头消失）。

### Notes

- 窄屏降级阶梯（chip 交数字 → 标题让位 → chip 收图标）与 1.5.2 完全一致；本次只收紧盒内约束，不改任何阈值。
- 诊断开关（`localStorage.setItem('dsh-better-session-title:debug','1')`）在排查时提供了 `[bst-dom]` 逐节点宽度，是定位本问题的关键证据。

## [1.5.2] - 2026-10-29

**只改文档**：把 npm / GitHub 双渠道的安装说明写进随包发布的 README，并补齐 1.5.1 的「上架 npm」记录。**代码零改动**，行为与 1.5.1 完全相同。

### Docs

- README 中文与英文的安装段改为「npm 优先、GitHub 等价」，示例里的 tag 与 tarball 名跟到 1.5.2。
- CHANGELOG 补记 1.5.1 的 npm 上架（1.5.1 包内的 CHANGELOG 早于这一条）。
- 这一版的唯一目的，是让 **npm 包页面上的 README** 与实际渠道一致：1.5.1 发布时仓库文档还没补上 npm 安装段，npm 页面因此停留在「只写 GitHub 安装」的旧快照。

## [1.5.1] - 2026-10-28

**分发渠道改名完成**：GitHub 仓库从 `dsh-better-session-title` 改为 `dsh-better-session-topbar`，与包名一致。**代码零改动**，顶栏行为与 1.5.0 完全相同。

### Changed

- **仓库名与包名统一为 `dsh-better-session-topbar`。** 1.3.6 只改了包名，仓库一直沿用旧名，README 里得挂一句「注意：仓库名仍是老的」。现在标准安装串是 `github:xinspark/dsh-better-session-topbar#v1.5.1`。
- **上架 npm**：`dsh-better-session-topbar@1.5.1` 已发布到 `registry.npmjs.org`，于是 `dsh plugin add dsh-better-session-topbar` 不必再带 `github:` 前缀；npm 与 GitHub tag 两个渠道内容一致（tarball shasum `6f0073dd…`）。发布时 npm 额外生成了一个 `0.0.0-stage` 占位版本（staged publishing 的产物，不可安装、不影响 `latest`），因当前令牌的 2FA 绕过限制而无法删除。
- **旧地址继续可用。** GitHub 对改名的仓库保留重定向，`github:xinspark/dsh-better-session-title#v1.5.0` 仍能解析并拉到同一个 tag；已安装的 profile 不用动（profile 依赖键是包名，本来就已是新名），`bst-release-check` 里钉着的旧串也能装。
- **随仓库名更新的引用**：`package.json` 的 `repository` / `homepage` / `bugs`、README 中英的 release 徽章与安装命令（含 tarball 名）、MAINTAINING 的仓库路径、插件市场条目（文件改名为 `xinspark__dsh-better-session-topbar.yml` 并更新 `url` / `name`）。

### Docs

- MAINTAINING §2 补记：改仓库名属对外动作，本次由所有者于 2026-10-28 明确指示后执行。
- `docs/RELEASE.md` 顶部说明补上「仓库名已于 1.5.1 统一」。

## [1.5.0] - 2026-10-28

「添加工作区」改为**完全交给宿主**：删除插件自绘的目录面板与 `priority:-1` 的目录流接管，行为与原生 DSH 一致 —— native 宿主直接弹系统「选择文件夹」，browse 宿主用官方应用内面板。

### Changed

- **删除插件自绘的「选择工作区目录」面板**（680×500 的 headless Modal、米勒式单列列表、内联新建文件夹、页脚系统选择按钮）。它与原生并不等价（官方是米勒列 + 单独的新建文件夹对话框），而且只在 browse 后端可用；win32/darwin 本地解析成 native 后端，`listDirectory()` 必抛「needs the browse capability」，那套面板本来就打不开。
- **删除目录流接管**：`BstDirectoryTakeover`、`bst:take-over-add-workspace` 事件、`priority:-1` 占用者、`topOccupant` 让位判定一并移除。插件不再遮蔽官方 browse 面板，也不再与社区桌面的 `NativeDirectoryFlow` 争同一个槽。
- **「添加工作区」现在只有两条路**：① 槽里有 occupant → 调宿主 `workspace.add`，由宿主决定交互（native = 系统选择器；browse = 官方应用内面板）；② 槽空（极少见）→ preload 桥 `__DSH_DIRECTORY_PICKER__` → `uiWorkspace.pickDirectory()` → 明确报错。系统对话框是模态的，重复点击由 `pickerOpening` 挡住。
- **随之删除**：`listDirectory` / `createDirectory` 的调用与探活、`.bst-picker*` 样式、`picker.*` 字典键、仅面板用到的 5 个图标导入。

### Added

- **`npm test` 渲染冒烟**（`test/render-smoke.cjs`）：用桩 React / primitives 执行工厂与面包屑、设置页的渲染体，能在提交前抓住「删了代码但还有悬空引用」。不验外观，也不进 npm 包（`files` 白名单不含 `test/`）。

### Kept

- 顶栏面包屑、两个下拉、会话/工作区行内操作、插件详情页、chip 归一与压缩阶梯、窄屏两态全部不变。
- DSH NEXT 2.0.20 / Harness 0.2.1-rc.3 的同步结论仍成立：同槽原生项顺序（rc.3 新增 `cost-meter-statistics`）、社区桌面用 `priority:-1` 的 `NativeDirectoryFlow` 接管目录流、`dsh-host-directory-picker-auto` 在 win32/darwin 本地解析成 native。

### Docs

- README 双语、`lib/client.js` 顶部维护清单、MAINTAINING 待办同步为「不自绘面板、不接管目录流」，并保留「原生桌面直接进系统选择器」的验收判据。

## [1.4.0] - 2026-10-27

「添加工作区」这一条链路整体重做：从「照抄一个对话框」升级成「按宿主能力分配交互 + 与官方同度量 + 可接管原生弹窗」。1.3.7 未发布，内容并入本节。

### Added

- **直接接管原生「添加工作区」弹窗（官方宿主）。** 面包屑挂载期间往两个目录流槽注册 `priority: -1` 的 occupant（盖过官方 browse occupant）；owner 打开流程时取消它并派发 `bst:take-over-add-workspace`，由面包屑打开插件自己的对话框。于是侧栏 + 与「添加工作区…」菜单项弹的都是插件这张（与官方同度量的）面板。只在官方宿主 + browse 后端可用时注册，面包屑卸载即释放；社区版（`window.desktopNext`）保留它自己的系统对话框驱动，不去抢。
- **页脚「用系统选择器选择」按钮（官方 `nativePicker` 同款位置）。** 只在有 preload 桥（`__DSH_DESKTOP_PICK_DIRECTORY__` 或 `__DSH_DIRECTORY_PICKER__`）时出现，点击直接开系统文件夹对话框，选中后走 `workspaces.create` + `openWorkspace`。文案三平台共用一条（Windows / macOS / Linux 的系统对话框形态由宿主与 preload 桥决定，插件不按平台分叉）；不给 `uiWorkspace.pickDirectory` 留入口——本面板只在 browse 后端打开，那里 pick 必然报错。
- **代码里加了一整段「DSH 升级维护清单」注释**（`lib/client.js` 顶部）：包名/槽位/服务/命令/preload 桥/官方 CSS 度量/顶栏 DOM 锚点/primitives 组件/错误文案/打包，共 10 类耦合点，逐条写明升级后要核对什么；README 中英各有一节同源清单。
- **探针日志多一档 `[bst-picker]`**：记录这次「添加工作区」走的是哪条路（服务活/死、槽占用数、桥有无），下次遇到新发行版不用再猜。

### Changed

- **「添加工作区」对话框改成与官方逐项同度量。** 以前用 Modal 自带的标题栏/页脚，和官方 `dsh-client-ui-directory-picker-browse` 对不上：现在改成 `headless` Modal + 自绘 header（`h2` 16/510 + 面包屑条）/ content / footerBar，数值全部照官方 CSS——dialog `680×500`、header `16/14/8/24` + `.5px` 下边框、content `16/16/16/24`、footer `16/24` + `.5px` 上边框、`footerAction` 最小宽 72；「显示隐藏文件」从按钮改成原生那种无边框文字开关，右上角补回 X。
- **文案与原生菜单对齐**：「添加工作区」/「新会话」/「分支会话」；系统选择按钮统一为「用系统选择器选择」/「Choose with the system picker」。

### Fixed

- **「添加工作区」不再在换掉目录选择服务的宿主上走进死路。** DSH Desktop Next（社区版）把官方的 `directoryPickerController` 整个换掉了：桌面窗口靠 preload 桥 `__DSH_DIRECTORY_PICKER__` 弹系统对话框，网页版连桥都没有。插件原来只按顺序试「原生命令 → `pickDirectory` → 自建面板」，三条都建在那条已经不存在的服务上，于是面板一打开就报 `directory browse failed: gateway/service-unavailable … active Service "directoryPickerController" is unavailable`，而且原生命令被 blocked 时 `shortcuts.invoke` **静默返回、不抛错**，插件却把它当成成功直接 return。
- **链路的判定依据从「命令有没有被调用」改成「宿主还有没有能力」**：先 `listDirectory()` 探活（只列目录、不开窗，无副作用，社区版上它就是抛 `service-unavailable` 的那条）。服务活着 → 借宿主自己的交互（原生桌面/原生 web 的官方 browse 面板），槽空再走 `pickDirectory`，最后才开自建面板；服务死了 → 只认 preload 桥；桥也没有（社区版网页版）→ 明确提示「当前宿主没有提供目录选择服务」，不再装作能用、也不降级成路径输入。
- **`shortcuts` 不再是硬依赖。** 它只用于「更多」菜单里的快捷键提示，却被写进了 cordis 的 `inject`：缺少该服务的第三方发行版上，整个插件（连面包屑）都不会 apply。现在改走 `ctx.inject` 子级，缺席时只少一处按键提示。
- **面包屑在会话页整块消失（运行时报错）。** 接管弹窗的 ref 声明写在了使用点之后：渲染期执行 `openPickerRef.current = openPicker` 时踩到 TDZ（`Cannot access 'openPickerRef' before initialization`），异常把 `conversation.session.header.actions` 这个槽的条目连带卸载，表现为「插件页还在、会话页没效果」。已把 `useRef` 提到使用点之前，并在注释里写明这条顺序约束；接管逻辑在 browse 后端的独立宿主里实测通过（侧栏 + 弹本插件对话框，面包屑正常）。

## [1.3.6] - 2026-10-26

### Changed

- **The package itself was renamed to `dsh-better-session-topbar`** (1.3.5 had only renamed the *display* name). Everything that keys off the package name moved with it: `package.json` `name`, the inserted row id in `cordis.patch.yml`, the `plugins.row.config` slot key (`<pkg>#<row id>`), the `id` in `window.__ModuleLoader__.load({ id })` — which the host matches against the resolved package name — plus the profile dependency key, the `node_modules` link and `dsh.profile.bundles` entries in both local profiles. The GitHub repository keeps the old name `dsh-better-session-title`, so install commands and the README badge still point at it.
- **Why the package name is not the Chinese display name.** A package name has to be URL-safe: `npm install` on `"name": "更好的会话顶栏"` fails with `EINVALIDPACKAGENAME` (`name can only contain URL-friendly characters`), and every `dsh plugin add` / `remove` in a profile shells out to npm, so a CJK name would break installation for everyone. The Chinese name therefore stays on the display layer (`locale/*.json` `meta.title`, host `name`), and the package takes the ASCII form of the same name.
- **Upgrading from 1.3.5 (or earlier) needs one app restart.** The profile's Cordis patch still stores the pre-rename row id; the running host keeps that row in its live composition even after `dsh.profile.bundles` changes, so a page refresh reports "failed to load plugins / 1 entry did not activate … import failed" until the app is restarted. Renaming the row id in the patch is enough on disk — the row is simply absent on the next boot.

## [1.3.5] - 2026-10-26

### Changed

- **Renamed to 更好的会话顶栏 / Better Session Topbar.** The display name in the Plugins list now comes from the locale metadata (`locale/zh.json` / `locale/en.json`), and the host/client module names and the package description follow it. The package name stays `dsh-better-session-title`, so existing installs, patches and row keys keep working.
- **The narrow-screen switch became a two-option selector.** The row is now 「窄屏会话标题显示选择」 and offers 面包屑模式 / 标题模式, each with its trade-offs written next to it, instead of a boolean switch whose "off" state had to be inferred. `narrowTitle: boolean` became `narrowMode: 'crumb' | 'title'` in the host `Config` (`z.union([z.const('crumb'), z.const('title')])`), so the Host validates the value and the client only accepts the two strings — a dirty value falls back to `'crumb'`. A profile that still stores the old `narrowTitle` will not match the new schema and comes back on the default breadcrumb display; pick the other option once on the plugin page.
- **The selector is a native-shaped cube pair, not a `SegmentedControl`.** DSH's own appearance setting is a row of cubes (`aria-pressed`, `.5px` border, `--dsw-radius-xl`, selected background `--dsw-alias-bg-module-platform` with `--dsw-static-neutral-bluish-400`); this plugin reuses that anatomy and adds one line per option. `SegmentedControl` is tablist → panel semantics and would emit `aria-controls` references to panels that do not exist here.
- **The documentation screenshots were all retaken on the same build**, from a live DSH instance (workspace dropdown, session dropdown, row more-menu, subagent ancestry crumb, narrow title state, plugin page), so the images match what the current version renders.

## [1.3.4] - 2026-10-26

### Changed

- **The narrow-screen 「会话标题」 state is now our own session crumb instead of the native inert line.** It is modelled on the breadcrumb's last level minus the session icon: title text + chevron, hover fill, `title` tooltip with the full name, and a click that opens the same dropdown the breadcrumb opens (session list for a plain session, the sibling-subagent switcher for a subagent session), with the same inline rename / fork / archive / pin / copy-ID rows. The native `nav` stays hidden again, so the 1.3.3 guards that revealed it are gone.
- **Subagent sessions keep the parent level** (`父会话 / 当前子会话`, both without icons, the parent still navigates back) — dropping it would leave the sidebar as the only way back to the parent.
- **The workspace level is hidden with `display: none` rather than removed from the tree.** `crumbNeed` is derived from the number of crumb buttons, so removing it would drop the threshold from 285 to 151 and the layout would flap between hidden and shown.
- **Title state forces the text form.** It only happens once the full breadcrumb no longer fits as text, where the ladder's next step would be icons — and the point of this state is a title, not a glyph.
- **The parent level compresses to a glyph before the title does.** Inside a subagent session the title state shows `父 / 当前`; when the title budget bottoms out (`per` at its 150px floor) the parent collapses to the native up/down switcher glyph (16px, the same one DSH's own switcher uses) with its full name kept in `title` / the accessible name, and it expands again only once `per` climbs back to 190 — the 40px band is what stops it flapping. The decision reads `per`, which comes from `avail()`, and `avail()` excludes our own width, so collapsing the parent cannot change the decision that collapsed it.
- **Escape returns focus to the trigger** after closing the dropdown; an outside click does not (that would steal focus from whatever the user just clicked).

### Fixed

- The dropdown could close on Escape and leave focus nowhere — the next Tab started from the top of the page instead of the crumb.

## [1.3.3] - 2026-10-26

### Added

- **A page for this plugin on the Plugins page** (Plugins → 本插件 → 配置), claiming the keyed `plugins.row.config` slot under `dsh-better-session-title#dsh-better-session-title`. Two settings, declared as `.volatile()` fields in the host half's `Config` schema so they are the only ones the form exposes, and persisted through the official settings line into the active profile's Cordis patch:
  - **窄屏改用会话标题** — when the topbar can no longer hold the breadcrumb as text, hide it and let the native session title show instead of folding to icons (off by default: the breadcrumb keeps its icon state, exactly as in 1.3.2). The trade-off is deliberate and stated in the hint: while this state is active the two breadcrumb dropdowns are gone, so switching moves to the sidebar.
  - **探针日志** — the `[bst-dom]` / `[bst-chip]` / `[bst-perf]` diagnostics, off by default.
- Both settings apply without a reload (the page and the topbar share one `configForms` instance and subscribe to it), and the page locks its controls while a write is in flight or when the deployment reports the namespace read-only.

### Changed

- **Diagnostics are now switched from the page instead of a `localStorage` key**, so there is one source of truth and the setting follows the profile. Nothing is written to the renderer console while it is off.
- **The measurement's "our left edge" no longer comes from our own box.** In title mode the breadcrumb is `display: none`, where `getBoundingClientRect()` returns zeros and would make the free width jump, flipping the ladder between hidden and shown. The edge is derived from the row (summing the siblings ahead of us) whenever we have no box, which is independent of our own width.
- The host half now suppresses the auto-generated settings form with `settings.configure({ auto: false }, ctx.fiber)` inside an optional `ctx.inject(['settings'], …)` child, so the page is the only place these two settings appear.
- The settings service is an **optional** dependency (`ctx.inject(['configForms'], …)`), not an `inject` entry: a composition without it loses the page, not the breadcrumb.
- **A measurement that throws is no longer invisible.** The pass still swallows exceptions (the topbar must never break because one measurement failed), but with the probe on the stack now goes to the log as `[bst-error]`. Silence here cost real debugging time: a failing pass on resize produced only `[bst-perf]` and no `[bst-chip]`, which reads as "the measurement stopped running".

## [1.3.2] - 2026-10-26

### Added

- **A fixed width-compression ladder for the topbar.** The three native chips (子智能体 / 智能体团队 / 后台任务) and the breadcrumb used to give way independently, so which one shrank first depended on each native rule. They now follow one order taken from the official layout: chips `full → count` (label replaced by the `(N)` badge) → the whole breadcrumb collapses to icons (chips stay at `count`, the counters survive) → chips `count → icon`. Every decision comes from the free width measured in the header, never from a remembered header width: folding is usually caused by the content (a longer title, a newly appeared chip), and once a fold is keyed on header width it never comes back. A chip that is already squeezed drops only to the lowest *text* mode and records that the title must give way first, so the ladder cannot be skipped.
- **One anatomy for all three chips — 图标 · 文字 · (N) · 圆环 · 箭头.** The native chips disagree: 智能体团队 has no counter, no chevron and no running indicator, 子智能体 bakes its number into the label ("3 个子智能体"), and 后台任务 puts its `StateDot` *before* the text. The chips are normalised at runtime — the counter becomes its own `(N)` span after the label, the label falls back to a short word (子智能体 / 后台任务) with the number moved into that span, the state dot is reordered after the counter, and the team chip gains a counter (only when it has more than one member), a 12px chevron and a 14px running ring cloned from the official `StateDot` spinner. The ring is phase-pinned through `getAnimations()` the same way the official `pinSpinner()` does it, so all three rings spin in step.
- **Breadcrumb collapses to icons.** When the row runs out of room the whole chain becomes icon-only (folder / session glyph / native subagent switcher glyph) with the `/` separators kept, so the level order is still readable. Full titles stay in `title` and in the accessible name.

### Changed

- **Chips now share one set of metrics** instead of each borrowing its native rule set: 12px/18 type, `3px 7px` padding, 5px gap, 28px min-height, 14px icon, 12px chevron, corners from the `--dsw-radius-md` token (12px), and the same hover / focus-visible treatment (colour → `label-primary`, background → `interactive-bg-hover`). Before, they differed in padding (2px vs 7px), gap (3/4/5px), icon size (14 vs 16px), and hover (two of them only shifted colour).
- **The breadcrumb is deliberately one step larger than the chips**, matching the native crumb: 14px/20 type, `4px 8px` padding, 16px icons, `font-weight: 500` throughout, hierarchy carried by colour only (`label-tertiary` for ancestors, `label-primary` for the current level). Chip labels keep the smaller 12px/18.
- **Measurement goes through `display: contents`.** The header chain wraps the action row in a `div { display: contents }`, where `clientWidth` is 0; the box lookup now walks past unboxed ancestors (and applies the same guard to `closest('header')`), so the width the ladder reasons about is a real one.
- **Chip decoration is cheap and self-healing.** Discovery is cached per chip key and invalidated by a `MutationObserver` on the header (child list, subtree, character data — the counter is a text node — and `aria-label`, which is how the native switcher switches between its two shapes); when a chip is still missing, or the team chip's own state (busy / member count) changed, a cheap re-check runs and nothing else does. Absent results are cached too, so a missing chip no longer causes a document-wide scan. Unmounting restores everything the pass touched: the label text (snapshot taken only at the moment of overwrite, so the official wording survives a re-render), the injected counter and ring nodes, the marker attributes, and the saved `flex-grow`.
- **Measurement is event-driven, not polled.** It used to run on a 300ms timer, and every pass interleaves a dozen layout reads (`getBoundingClientRect` / `clientWidth` / `scrollWidth`) with writes — attributes, mode flags, and a `--bst-crumb-max` custom property. Interleaved reads and writes defeat the browser's rendering batching: each read forces a synchronous layout of the whole page. With a long conversation streaming tool calls that becomes a relayout storm, and because the `ResizeObserver` callback *was* the pass itself, it fed its own writes back into itself (`ResizeObserver loop completed with undelivered notifications`, 102 of them in one day's log). The pass now runs at most once per frame and only when something actually changed (element resize, header mutation, window resize), with re-entrancy protection and no work while the page is hidden; the observer callbacks only set a flag. A pass slower than 60ms leaves a rate-limited `[bst-perf]` line in the renderer log (when diagnostics are on), so a future stall can be attributed instead of guessed.
- **Diagnostics are opt-in and off by default.** The three diagnostic lines (`[bst-dom]`, `[bst-chip]`, `[bst-perf]`) are no longer written during normal use — renderer console output is forwarded and persisted by the host, so it is both noise and cost. Enable them for a session with `localStorage.setItem('dsh-better-session-title:debug', '1')` and remove the key to turn them off again (checked at call time, no reload needed). With the flag absent, the structural probe skips its measurements entirely and the pass does not even build its report string.
- Open-state chevron rotation is 120ms on all three (the overlay used 150ms); in icon mode the chevron is hidden, so the chip is a clean 28×28 square.

### Fixed

- **Adding a workspace could dead-end on a `null` id.** When `workspaces.create()` resolved to `null`, `view && view.workspaceId` yielded `null`, which slipped past the `undefined`-only guard and went straight into `uiWorkspace.openWorkspace(null)` — after the picker dialog had already closed. The guard now covers `null` as well and reports 添加工作区失败 instead of ending in nothing visible.

## [1.3.1] - 2026-10-19

### Fixed

- **Wording matches the official UI again.** 1.3.0 renamed the workspace action row to 新建工作区 and the session action row to 新建会话; both are back to the native 添加工作区 / 新会话 (and `dialog.pickerErrorTitle` to 添加工作区失败). The `⋯` menu item 分支 is now the native 分支会话.
- **Directory picker reshaped to the native 「选择工作区目录」 dialog.** Titles, buttons and states are taken verbatim from `dsh-client-ui-directory-picker-browse` instead of being invented: breadcrumb path with an 编辑路径 mode, clicking a row enters that folder, the footer submits the current folder with 打开 / 取消, plus 新建文件夹 and 显示隐藏文件; hidden folders stay hidden until toggled, and an oversized listing warns 文件夹过多，仅显示开头部分。 The previous 上一级 / 选择此文件夹 / 输入或粘贴路径后回车 rows are gone.
- **Plugin page metadata.** `locale/zh.json` and `locale/en.json` now provide `meta.title` / `meta.description` (short, one line each) instead of falling back to the long package description, `package.json` declares `icon: "./icon.svg"` (a new 36×36 breadcrumb mark), and `exports` exposes `./locale/*.json` so the host can actually resolve those locale files.

## [1.3.0] - 2026-10-19

### Added

- **Built-in directory picker.** `uiWorkspace.pickDirectory()` throws on profiles where the composed picker only serves the `browse` capability (`directory picker failed: directoryPicker.pick needs the native capability; the composed picker serves "browse"`), which broke "add workspace" completely. The plugin now drives `uiWorkspace.listDirectory` / `createDirectory` itself and renders a native-shaped picker: parent / home / up, breadcrumb path, folder listing, inline "new folder" form, empty and error states. Works with both the browse and the native picker compositions.
- **Native session menu.** The per-session `⋯` menu is now shaped like the native one: 置顶会话 / 重命名 / 分支会话 / 归档会话 / 复制 Session ID, wired to `uiWorkspace.pinSession` / `unpinSession` (pinned first in the list, with the filled pin icon) and to the clipboard for the session id. Each row shows the same shortcut hint as the native menu, read from the `shortcuts` catalog (`session.rename`, `session.fork`, `session.archive`), so hints stay correct if keybindings change.

### Changed

- **Wording follows the native menu again:** the workspace action row is 添加工作区 / Add workspace and the session action row is 新会话 / New session (was 新建工作区 / 新建会话); 分支会话 replaces the old 分支 label.
- **Session list sorted by activity:** pinned sessions first (in pin order), then most recently updated first, instead of the raw `sessionIds` order.
- **Short description on the plugin page:** `locale/zh.json` / `locale/en.json` now carry `meta.title` / `meta.description`, so the plugin list shows 工作区/会话面包屑 · Workspace/session breadcrumb instead of the long README summary.

## [1.2.1] - 2026-10-18

### Fixed

- **Native title visible again (double title) on DSH 0.2.1-rc.2 (DSH NEXT).** The hide-native-title and shrinkable-container rules were anchored on `div[data-conversation-title-row]` / `[data-conversation-header]`, and 0.2.1-rc.2 removed both attributes — the native `<nav>` breadcrumb stayed visible next to ours. New anchors added alongside the legacy ones (kept for 0.2.0-rc.2): the header is `header[data-window-drag]`, the native title `nav` is hidden only when a later sibling layer contains `.bst-crumbs` (`nav:has(~ div .bst-crumbs)`), and the shrinkable-container rule is re-anchored on that same header. No hash-class names are used, so both generations match structurally.

## [1.2.0] - 2026-10-14

### Fixed

- The dropdown is now rendered through a React portal into `document.body`, like the native `Menu`'s `portal` mode. Rendered in place inside the topbar slot it lived inside the header's stacking context, so page content painted over it: an open list had chat content — and a third-party plugin's injected `复制` button — showing on top of it, and its first row could be covered by the app shell's sidebar column.
- The workspace action row no longer reuses the native wording. "Mobile pocket" plugins delete the native add-workspace entries by scanning every `[role=menuitem]`, `[role=option]`, `li`, `button` and `a` for the **exact** labels `添加工作区` / `添加工作区…` / `Add workspace` / `Add workspace…`, then writing `display: none` plus `data-mobile-nav-hide`, and they re-apply it through a `MutationObserver` on every inserted node (measured against `dsh-pocket` 2.11.0, `hideWsEntries`). Our row used the native label, so it was hidden the moment the dropdown opened and read as "the new-workspace entry is missing". It is now `新建工作区` / `New workspace`; the failure dialog title follows (`新建工作区失败` / `New workspace failed`).

### Changed

- **Standalone release.** The plugin is now fully independent: it ships its own bundle patch (which inserts only its own row), declares no dependencies, and nothing depends on it. Installing it makes the breadcrumb always active — there is no external switch any more.

### Removed

- The dsh-basic-right-sidebar sub-plugin coupling, on both sides: the settings bridge here (`window.__BASRS_SETTINGS__` snapshot + `'basrs:settings'` event), the `showBreadcrumb`-driven `enabled` state, and the `.bst-crumbs-off` class plus its style and the matching `:has(.bst-crumbs:not(.bst-crumbs-off))` CSS guard. That plugin no longer ships this one, no longer declares it as a dependency and no longer offers a breadcrumb toggle; it keeps only a CSS exemption so its "hide duplicated topbar elements" rule never hides `.bst-crumbs` when both are installed.

## [1.1.1] - 2026-10-14

### Fixed

- **Breadcrumb actions could be silently dead for an entire app run** — perfect looks, zero reaction. The client half read its services (`workspaces` / `sessions` / `uiWorkspace` / `locale`) with `ctx.get(...)` at `apply` time while `inject` declared only `slots`, so whenever `apply` won the race against those services registering, `undefined` was captured into every handler closure permanently: the crumb and both dropdowns render beautifully from hook data while switch / add-workspace / rename / delete do nothing — no exception, no log line. `inject` now declares all five, and every action reports a visible error instead of returning silently (`dialog.actionErrorTitle` / `dialog.serviceNotReady`). Verified live against a running app: `uiWorkspace.listDirectory`, `workspaces.rename`, `uiWorkspace.openSession` and a real dropdown-row click (workspace switch, then back) all succeed once the services are ready.
- Switching to a workspace whose sessions were never connected in this app run could fail silently: the fast path (open that workspace's most recent session) is followed by the native path — `uiWorkspace.openWorkspace` (connect the workspace, then open its session), the same entry the native `startSession` uses in 0.2.0-rc.2 — instead of ending in a swallowed `catch`.
- Switch / new session / fork / archive swallowed every failure (`catch {}`); they now surface in the error dialog. Adding a workspace also uses `uiWorkspace.openWorkspace` after `workspaces.create`.
- The dropdown could open already scrolled down in a short window, hiding the first action row (`添加工作区`) above the fold and reading as "the new-workspace entry is missing"; the list now resets `scrollTop` on every open.

## [1.1.0] - 2026-10-14

### Added

- Per-level icon fallback: a level shows only its icon once the topbar squeezes its label below a readable width (`ICONIC_TEXT_FLOOR`, ≈5 CJK characters); the full title stays in the tooltip and in the accessible name. A level whose title merely exceeds its own `max-width` cap keeps the truncated text — a wide window never collapses.
- Every level carries an icon — subagent levels use the native lineage switcher's up/down chevrons glyph — so an icon-only chain never leaves a blank, invisible clickable level.
- `aria-label` and `aria-expanded` on every crumb button: a level keeps a readable name in icon form (`display`-hidden text drops out of the accessible name).

### Fixed

- The breadcrumb was cut off instead of scrunched: the topbar container hosting it (`headerActions`) is `flex: 0 0 auto` with `min-width: auto`, so as the topbar narrowed the row overflowed and got clipped at the window edge and the labels were never squeezed — the icon fallback had no premise. An injected rule makes the three hosting containers shrinkable again (so labels ellipsize normally), and the fallback additionally collapses the row whenever it overflows, so the breadcrumb can never be cut off by the topbar.
- The icon fallback could never appear: its trigger measured the header's overflow, but the native header absorbs pressure by collapsing its own chips into an "…" overflow menu and never overflows. The trigger is now "the level's label is squeezed below a readable width" (`ICONIC_TEXT_FLOOR`), evaluated per level, plus the row-overflow fail-safe, with a header-width hysteresis for recovery — so it fires when the topbar is genuinely out of room and holds still (no flapping).
- Hardened the chevron's click path: icons inside a crumb button are `pointer-events: none`, so the arrow and the label share exactly one hit path (the button itself) instead of depending on how the SVG is hit-tested.
- The hover state also marks the chevron, so the dropdown affordance has explicit feedback.

### Changed

- The `/` separators stay visible in icon form, so the hierarchy remains readable at any chain length.

## [1.0.0] - 2026-08-16

### Added

- Initial release as a DSH bundle plugin.
- Replace the native session topbar title with a two-level "Workspace / Session" breadcrumb.
- Workspace dropdown: switch workspaces, add workspace (native directory picker), rename / delete workspace.
- Session dropdown: switch sessions, new session, rename / fork / archive session.
- Row "more" menu (native Menu) whose lifecycle follows the owning dropdown — no orphan menus.
- Rename/delete dialogs via native Modal + Button + Input with IME-safe Enter handling and duplicate-name checks.
- Auto compact mode: collapses to icons when the topbar space is tight (hysteresis).
- Relative-time meta at the row end, covered by the "More" button on hover; touch devices keep the button visible.
- Built-in zh/en dictionaries following the DSH language switch.
