# 维护规范（MAINTAINING）

> 本文件是维护者的作业手册。规则由仓库所有者（xinspark）制定，维护者按此执行。

## 1. 角色与范围

维护者负责 **更好的会话顶栏 / Better Session Topbar**（包名与仓库名同为 `dsh-better-session-topbar`）的三件事：

1. **GitHub 运维**：`xinspark/dsh-better-session-topbar` 的 Issues 与 PR——分诊、复现、给结论、写回复草稿、按批准执行回复/关闭/合并。
2. **跟随 DSH 版本**：本地 DSH 实例（DSH NEXT / DSH 原生桌面 / `dsh` CLI）升级后，判断插件是否需要适配或升版本，按 `lib/client.js` 顶部的「DSH 升级维护清单」逐类核对。
3. **插件市场提交**：插件发版后同步市场条目。

## 2. 硬规则

- **维护窗口：每天 21:00（Asia/Shanghai）**。窗口外只做本地准备，不做对外动作。
- **所有对外部有影响的动作，必须先获得所有者逐项批准**，批准前只准备草稿。对外动作包括但不限于：
  - `git push`（含 `--force-with-lease`）、打 tag、创建 GitHub Release、改仓库设置/仓库名；
  - 创建/回复/关闭 Issue、创建/合并/评论 PR、请求 review；
  - 向插件市场（`awesome-dsh-plugin/awesome-dsh-plugin`）提 PR 或改条目；
  - 任何第三方仓库上的写操作。
- **不需要批准的本地动作**：读代码与远端资料、跑校验、改代码、本地 commit、本地 tag、写草稿/报告。
- **已记录的授权**：2026-10-28 所有者明确指示「完全改名」，据此执行了 `gh repo rename`（`dsh-better-session-title` → `dsh-better-session-topbar`）及随之的推送与 Release；其余对外动作仍逐项批准。

## 3. 每日 21:00 检查清单

1. **GitHub**：列出 open Issues / PRs，每条给：现象、是否可复现、建议处置（修复 / 需要信息 / 关闭）、回复草稿。
2. **DSH 版本**：记录当前实例版本（DSH NEXT 版本、runtime `@deepseek-ai/dsh` 版本、客户端包版本）；与插件上次适配的版本比对；按「DSH 升级维护清单」10 类耦合点给出「本次升级是否影响」的结论。
3. **待发布**：本地未推送提交、未发布 tag、版本号与 CHANGELOG 是否一致。
4. **市场**：`awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/xinspark__dsh-better-session-topbar.yml` 与 README 列表条目，是否与最新版本/功能一致；只输出 diff 草稿。
5. **汇总**：把「今晚可执行的外部动作」逐项列出，等批准。

## 4. 发版流程

1. 改代码与档（CHANGELOG 新开一节、README 的安装 tag 与 tarball 名）。
2. `package.json` 版本号 + 本地 commit + 本地 annotated tag。
3. **请求批准**后：`git push`（远端分叉时用 `--force-with-lease`，并说明被替换的历史）+ 推 tag。
4. 建 GitHub Release（附 CHANGELOG 摘要），再按需更新市场条目。
5. **发到 npm**：走 **Trusted Publishing（GitHub Actions + OIDC）**，**不需要任何 npm token**。
   - 触发：发布 Release（`published`）或 Actions → `publish` → Run workflow；CI 先跑 `npm test`，再 `npm publish --provenance`。
   - 一次性配置（已完成，2026-10-29）：npm 包页面 → Settings → Trusted Publisher → GitHub Actions，`xinspark` / `dsh-better-session-topbar` / `publish.yml`，并勾选「Allow npm publish」。
   - **发完要复核** `dist-tags.latest`：registry 有约 1–2 分钟处理延迟，CI 打出 `+ pkg@version` 不等于立刻可查。
   - 历史遗留：`0.0.0-stage` 占位版本（staged publishing 产物），不影响 `latest`。
   - 旧的 token 方式已不再使用：账号 2FA 只有安全密钥、无法出 6 位码，命令行发布必被 EOTP 拦。

## 5. 插件市场说明

- `dsh-market/dsh-market` 是**市场应用本体（TypeScript）**，不是插件目录；它的 README 明确写着「要收录插件请去 awesome-dsh-plugin 提 PR」。
- 真正的目录是 **`awesome-dsh-plugin/awesome-dsh-plugin`**：
  - 单条数据：`data/plugins/xinspark__dsh-better-session-topbar.yml`（`url` / `name` / `category` / `description.en|zh`）；
  - 列表条目：`README.md` 与 `README.zh.md` 的 UI 分类下一条链接。
- 只在**功能描述或仓库地址变化**时改它；纯版本号升级（目录里不含 version 字段）不需要动。

## 6. 当前待办（2026-10-29）

- [x] **v1.4.0 发布**（2026-10-27）：tag `v1.4.0` → `a9ab1fe`，GitHub Release 已建，远端 `main` = `1738c3d`（含 MAINTAINING 本文）。
- [x] **v1.5.0 发布**（2026-10-28）：tag `v1.5.0` → `e3ba1d9`（快进自 `1738c3d`，无需 force），远端 `main` = `e3ba1d9`；Release <https://github.com/xinspark/dsh-better-session-topbar/releases/tag/v1.5.0>（非 draft / 非 prerelease，正文取 CHANGELOG 1.5.0 节）。内容：跟随 DSH NEXT 2.0.20 / Harness 0.2.1-rc.3，「添加工作区」完全交给宿主，删除自绘面板与目录流接管；新增 `npm test` 渲染冒烟。
- [x] **v1.5.1 发布**（2026-10-28）：**仓库改名完成** —— `dsh-better-session-title` → `dsh-better-session-topbar`，包名与仓库名终于一致；代码零改动。tag `v1.5.1` → `378ac0a`，Release <https://github.com/xinspark/dsh-better-session-topbar/releases/tag/v1.5.1>；旧仓库地址由 GitHub 重定向保持可用（实测 `git ls-remote` 旧串仍能解析到同一 tag）。
- [x] **npm 上架**（2026-10-28）：`dsh-better-session-topbar@1.5.1` 首次发布到 `registry.npmjs.org`，tarball shasum `6f0073dd…` 与本地打包一致；`dsh plugin add dsh-better-session-topbar` 从此无需 GitHub 前缀。
- [x] **v1.5.2 发布**（2026-10-29）：**纯文档版**，代码零改动。tag `v1.5.2` → `56255d8`，Release <https://github.com/xinspark/dsh-better-session-topbar/releases/tag/v1.5.2>；npm 上 `dist-tags.latest = 1.5.2`，包内 README 已含「npm 优先」安装段（1.5.1 的包内 README 停留在只写 GitHub 的旧稿）。
- [x] **市场条目改名的 PR**：`_market/awesome-dsh-plugin` 分支 `update/dsh-better-session-topbar`（提交 `671daae`）——条目文件改名为 `xinspark__dsh-better-session-topbar.yml` 并更新 `url` / `name` / 描述（去掉 1.5.0 已删除的「同度量对话框」措辞），两个 README 用 `generate-readme.mjs` 重新生成，只动本条目。**已合并：[#10090](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10090)**（`fkysly` 于 2026-10-28T17:09:54Z 合并，merge commit `2d548a9`；两个 check 全绿）。上游 `main` 已是新条目、旧文件已删、README 第 1436 行同步；本地 `_market` 克隆已 reset 到 `origin/main`、合并分支已删。
- [x] **npm 页面 README 已刷新**（2026-10-29，随 1.5.2）：包内 README 现在写的是「npm 优先、GitHub 等价」，CHANGELOG 也补上了「上架 npm」那条。1.5.1 的包内快照是发布早于文档更新造成的，已随新版本自然消解。
- [x] **v1.5.3 发布**（2026-10-29）：**修复三级面包屑**在窄顶栏下的三处显示问题（文字溢出、分隔符被压没、末级箭头被裁），代码层面只动 CSS 约束。tag `v1.5.3` → `2e8463e`；Release <https://github.com/xinspark/dsh-better-session-topbar/releases/tag/v1.5.3>；**npm 由 GitHub Actions 首次以 Trusted Publishing 完成发布**（run 40782810320，success，带 provenance），`dist-tags.latest = 1.5.3`。
- [x] **npm 改为 Trusted Publishing**（2026-10-29）：新增 `.github/workflows/publish.yml`（`release: published` + `workflow_dispatch`，`id-token: write`，跑 `npm test` 后 `npm publish --provenance`）；npm 包页面已配好信任发布者（GitHub Actions / xinspark / dsh-better-session-topbar / publish.yml，勾了 Allow npm publish）。**从此发版不再需要任何 token**，也绕开了「只有安全密钥、出不了 6 位码」的死结。
- [x] **npm 令牌清理 + 2FA 恢复**（2026-10-29）：发布用的 `publish-topbar-1.5.1`（Bypass 2FA）与旧的 `Agent` 都已在网页删除；所有者随后新建了一个**不勾 Bypass**的 Read/Write token 放进维护台（`NPM_TOKEN`，实测 `whoami → xinspark`），账号现共存这 1 个。账号级「Require two-factor authentication for write actions」已勾回。该 token 现在只用于维护器的只读查询；发版已改走 Trusted Publishing。
- [x] **`0.0.0-stage` 占位版本 —— 已知遗留，决定不处理**（2026-10-29，所有者决定）：staged publishing 首次发布留下的空壳，不在 `latest` 上、`dsh plugin add` 永远装到 1.5.2，**不影响安装与运行**。删它的门槛：需要「非 Bypass」token，且必须在「写入操作要求 2FA」关闭的窗口内（否则要 6 位码，而账号只有安全密钥）；本次已试到 WebAuthn 认证环节（`Something went wrong`），所有者选择保留。以后若要清，按这个顺序做一次即可：临时关写入 2FA → 新建不勾 Bypass 的 Read/Write token → `npm unpublish dsh-better-session-topbar@0.0.0-stage` → 删 token → 勾回 2FA。
- [x] **实机验收**（2026-10-29，所有者本人执行）：干净 profile 实装 tag 版 + rc.3 界面点检（顶栏 / 两个下拉 / 添加工作区 / 插件详情页）已跑完，**无问题**。维护者未逐项复核，本条以所有者确认为准。