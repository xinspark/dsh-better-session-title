# 发布清单（v1.2.0）

> 面向发布执行者（人或 agent）。`docs/` **不在** npm `files` 白名单里 —— 本文不会发进包。
> 主分发渠道：**GitHub Release + tag**（README 的安装指令引用 `#v1.2.0`）。
> 验证基线：DSH **0.2.0-rc.2**（`@deepseek-ai/dsh-client-ui-primitives` 与 app 依赖一致）。

## 0. 发布门前置：两件事 + 两个红灯

| 项 | 现状 | 动作 |
| --- | --- | --- |
| tag `v1.2.0` | **不存在**（远端只有 `v1.0.0`） | 打 tag 并推送 |
| GitHub **Release** | **0 个** | 必须 `gh release create`：README 的 release badge 读的是 Release，**只推 tag 不点亮** |

- ✅ **代理红灯已解除（2026-10-16 实测更新）**：7890 端口恢复监听，CONNECT 隧道可建立；但 git/curl 默认的 Schannel TLS 后端在本机报 `SEC_E_NO_CREDENTIALS`。**解法：git 命令统一加 `-c http.sslBackend=openssl`**（`ls-remote` / `push` 均实测通过），不用改全局配置。Node fetch 直连与走代理都正常；GCM 里的 `gho_` token 对 API 有效（用户 xinspark）——本机无 gh CLI，Release 用该 token 直接调 GitHub API 创建。
- 🔴 **本机 desktop profile 里本插件是 `link:E:/FXS/Data/DSH-Plugins000/dsh-better-session-title`** → 本机跑的始终是工作树代码，**不能当作 tag 内容的验收证据**。验收要另开一个干净 profile（本机 `~/.dsh/profiles/` 只有 `desktop` 及两个备份，没有 `web`）。

打包面自查（已实测，`npm pack --dry-run` @ 2026-10-16）：tarball = **8 个文件 / 32.0 kB packed** = `files` 白名单 4 项（`index.js` / `lib/client.js` / `cordis.patch.yml` / `CHANGELOG.md`）+ npm 强制附带的 `package.json` / `README.md` / `README.en.md` / `LICENSE`。无 `scripts`、无构建产物。**无漏文件。**（本机 npm 缓存目录被沙箱拒写时，用 `--cache <workspace内路径>` 重跑。）

## 1. 提交与打 tag

按评审决定切 **2 个提交**（原三分法的 docs 与 refactor 改动同属一批功能演进，拆开无独立验收价值；tag 指向 release 提交）：

1. `feat: 1.1.x–1.2.0 — portal dropdowns, standalone plugin, subagent crumb`（`lib/client.js` + README 双语 + 新截图 + 本文）
2. `release: v1.2.0`（`package.json` + `CHANGELOG.md`）

```sh
cd E:/FXS/Data/DSH-Plugins000/dsh-better-session-title
git add -A
git commit -m "release: v1.2.0 — standalone release"
git tag -a v1.2.0 -m "v1.2.0 — standalone release"
git push origin main
git push origin v1.2.0
gh release create v1.2.0 --title "v1.2.0" --notes "…"   # badge 依赖它
```

npm（**可选**，README 未把它列为主渠道）：本机默认 registry 是 `registry.npmmirror.com`，必须显式指官方 —— `npm.cmd whoami --registry https://registry.npmjs.org`，再 `npm.cmd publish --registry https://registry.npmjs.org`。包名 `dsh-better-session-title` 在 npmjs 上当前为 404（可用）。

## 2. 发布后验收

- **A** `git ls-remote --tags origin` 能看到 `v1.2.0`
- **B** README 的 shields badge 显示 `v1.2.0`（它读 Release，不是 tag）
- **C** 干净 profile 实装：`dsh plugin --profile <新名> add github:xinspark/dsh-better-session-title#v1.2.0` → `dsh web` → 刷新页面看顶栏
- **D** 界面自检：工作区下拉**首行是「新建工作区」**；下拉必须**盖住**页面内容（portal 生效，不再被聊天正文/注入按钮压住）
- **E** 回滚：`dsh plugin --profile <新名> remove dsh-better-session-title`

## 3. 待做

- ~~三张截图已过时，必须重拍~~ —— **已完成（2026-10-16）**：`workspace-dropdown.png` / `session-dropdown.png` / `session-more-menu.png` 已在 1.2.0 实机（宽窗口）重拍并覆盖同名文件；另新增 `subagent-crumb.png`（子智能体层级面包屑），双语 README 均已引用。
- 可选：把 `docs/screenshots/**` 加进 `package.json` 的 `files` —— **仅当还要发 npm**：否则 npm 包页有 5 处相对图 404（GitHub 正常）。代价约 +820 KB（新图比旧图大）。
- 已知实现差异（**改 = 行为变更**，不属本次发布范围，留待后续）：下拉分隔线 `1px` + `--dsw-alias-border-l1`（原生 `0.5px` + `--dsw-alias-border-l2`）；图标态颜色 —— 原先那条 `.bst-crumb-iconic .bst-crumb-btn svg` 选择器结构上永不命中，已按「零行为变更」删除，若要图标态用 secondary 颜色需真机目视验收后另行修。
- git 历史里仍留着 1.2.0 之前的「子插件 + 桥接」提交（如 `7911fc2`）。要不要重写历史是**独立且破坏性**的决定（需 force push、重打旧 tag），本次未做。

## 4. 发布说明草稿（zh）

```md
**独立发布** —— 本插件不再依赖任何插件，也不被任何插件依赖：自带 bundle 补丁（只插入自己那一行），
`package.json` 没有依赖；安装即始终生效，没有外部开关。

### 修复
- **下拉被页面内容盖住**：下拉改为 React portal 渲染到 `document.body`（与原生 `Menu` 的 `portal` 同款）。
  此前渲染在顶栏槽位内部、处于 header 的层叠上下文里，于是聊天正文和第三方插件注入的按钮会画在下拉之上，
  列表首行还可能被侧栏列网格盖住。
- **工作区下拉「少了一行」**：行动作行不再沿用原生文案（`添加工作区` → `新建工作区`）。「手机口袋」类插件
  会全局按文本精确匹配原生添加工作区文案后写 `display:none`，并挂 MutationObserver 让新插入的节点同样被隐藏 ——
  沿用原生文案的那一行会被一并吃掉。错误对话框标题同步为「新建工作区失败」。
- **行动作曾静默失效**（1.1.1）：`inject` 现在声明全部五个服务依赖。此前用 `ctx.get()` 在 `apply` 期取服务，
  抢跑会把 `undefined` 永久固化进所有动作闭包，表现是「外观完全正常、点了没反应」，既无异常也无日志。
  另外切换 / 新建 / 分支 / 归档 / 新建工作区 的失败不再被吞掉，改为可见的错误对话框。

### 从 1.0.0 升级
替换安装内容即可，无需其它操作。

### 已知限制
- 仅验证 **DSH 0.2.0-rc.2**（DSH Desktop 与 `dsh web`）。
- 下拉行内度量沿用原生 `AccountMenu` 的 `[role=menuitem]`（40 / 8·10 / 14·22），**不是** `Menu.module.css`
  的紧凑规范；分隔线 1px + `--dsw-alias-border-l1` 与原生 0.5px + `-l2` 略有差异。
- 「新建工作区」是刻意文案：不要改回原生「添加工作区」。
- 社区插件，并非 DeepSeek 官方产品。
```

## 5. Release notes (en)

```md
**Standalone release** — this plugin no longer depends on any plugin, and nothing depends on it: it ships its
own bundle patch (inserting only its own row) and has no dependencies. Installing it makes it always active;
there is no external switch.

### Fixed
- **The dropdown was painted over by page content**: it is now rendered through a React portal into
  `document.body`, like the native `Menu`'s `portal` mode. Rendered in place inside the topbar slot it lived in
  the header's stacking context, so chat content and buttons injected by third-party plugins were drawn on top
  of it, and its first row could be covered by the shell's sidebar column.
- **The workspace dropdown looked like it was missing a row**: the action row no longer reuses the native
  wording (`添加工作区` → `新建工作区`). "Mobile pocket" plugins match the native add-workspace labels exactly,
  write `display: none` and re-apply it through a MutationObserver on every inserted node, so a row using the
  native label gets hidden with it. (The failure dialog title is now "New workspace failed" too.)
- **Row actions could be silently dead** (1.1.1): `inject` now declares all five service dependencies. Services
  were read with `ctx.get()` at `apply` time, so losing that race captured `undefined` permanently into every
  action closure — perfect looks, zero reaction, no exception and no log line. Failures in switch / new session /
  fork / archive / new workspace now surface in a visible error dialog instead of being swallowed.

### Upgrading from 1.0.0
Just replace the installation; no other action is needed.

### Known limitations
- Verified only on **DSH 0.2.0-rc.2** (DSH Desktop and `dsh web`).
- Row metrics follow the native `AccountMenu` `[role=menuitem]` (40 / 8·10 / 14·22), **not** the more compact
  `Menu.module.css`; the separator is 1px + `--dsw-alias-border-l1` vs the native 0.5px + `-l2`.
- `新建工作区` / `New workspace` is deliberate wording: do not revert it to the native label.
- A community plugin, not an official DeepSeek product.
```
