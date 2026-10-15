<p align="center">
  <img src="docs/screenshots/workspace-dropdown.png" alt="Better Session Title 工作区下拉展示" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/xinspark/dsh-better-session-title?style=flat&amp;label=release&amp;color=08C" alt="GitHub release">
  <img src="https://img.shields.io/badge/plugin-UI%20%E5%A2%9E%E5%BC%BA-47848F?style=flat" alt="UI enhancement plugin">
  <img src="https://img.shields.io/badge/DSH%20Web%20GUI-Windows%20%7C%20macOS%20%7C%20Linux-4493F8?style=flat" alt="Windows | macOS | Linux">
  <img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat" alt="MIT License">
</p>

<p align="center"><sub>简体中文 · <a href="README.en.md">English</a></sub></p>

<h3 align="center">把 DSH 顶栏的会话标题换成「工作区 / 会话」两级面包屑，切换入口直接放在顶栏</h3>

<p align="center"><a href="#安装"><ins><code>dsh plugin --profile web add github:xinspark/dsh-better-session-title#v1.2.0</code></ins></a></p>

Better Session Title 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**会话顶栏增强插件**——纯 UI 增强，不引入新能力，不改任何系统源码。DSH 原生顶栏中央只显示会话标题（层级面包屑），工作区/会话的切换入口在左侧边栏；侧边栏收起时，每次切换都要额外点击。本插件把切换入口直接放进顶栏：

- **工作区下拉** —— 展开可见全部工作区及其会话数，一键切换；可「新建工作区」（原生目录选择器）或删除。
- **会话下拉** —— 展开可见当前工作区全部会话及相对更新时间，一键切换；可「新建会话」。

行内操作全部复用 DSH 原生能力：重命名工作区/会话、删除工作区、分支会话、归档会话，与原生侧边栏行为完全一致。

支持 **Windows · macOS · Linux**（DSH Web GUI）——纯 JavaScript，无原生依赖，分发无需构建步骤。

> 验证基线：**DeepSeek Harness 0.2.0-rc.2**（DSH Desktop 与 `dsh web`）。其它版本未经验证。

## 安装

`dsh-better-session-title` 是一个**组合包（bundle）**——以包形式分发的配置补丁层（见 [DSH 官方插件发布文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)）。用 `dsh plugin` 命令安装进 profile：它会自动链接包并追加到 `dsh.profile.bundles`：

```sh
# 从 GitHub 安装（主分发渠道，v1.2.0 为当前发布 tag）
dsh plugin --profile web add github:xinspark/dsh-better-session-title#v1.2.0
```

- **建议锁定 commit**：GitHub 安装拉取的是仓库源码，tag 之后的新推送不会自动影响已安装版本；如需把运行内容严格固定到某个提交，用 `github:xinspark/dsh-better-session-title#<commit-sha>`（官方文档推荐做法）。
- **本地目录 / tarball**（开发或离线环境）：

  ```sh
  dsh plugin --profile web add ./dsh-better-session-title
  dsh plugin --profile web add ./dsh-better-session-title-1.2.0.tgz
  ```

然后启动 Web UI：`dsh web`（或 `dsh --profile web`）。首次 `add` 会自动用 `@deepseek-ai/dsh-base` 初始化 profile。

卸载：`dsh plugin --profile web remove dsh-better-session-title`（同时移除依赖与组合层）。

插件的 bundle 补丁（`cordis.patch.yml`）会自动注册 host 与 client 两半。客户端按请求加载：客户端改动刷新页面即可，host 改动需要重启。

## 主要功能

| 能力 | 说明 |
| --- | --- |
| 多级面包屑 | 顶栏左侧以「工作区 / 会话」展示当前位置，两侧各自展开下拉列表；进入子智能体会话时自动扩展为「工作区 / 父会话 / 子智能体会话」（祖先级可点跳回）。 |
| 逐级自适应图标态 | 顶栏真放不下时才收图标：**整条溢出 → 全部收成图标**（防止被窗口边缘裁掉）；**某一级被挤到读不出内容**（可见宽度 < 80px ≈ 5 个汉字）→ 只收这一级。图标按级取：工作区＝文件夹、普通会话级＝会话字形、子智能体级＝原生 switcher 的上下双箭头；完整标题仍在悬停提示与可访问名里。窗口宽、只是标题超过该级上限时保留截断文本（比一个图标信息量大）。`/` 分隔始终保留 —— 图标态下层级顺序靠它读出来。 |
| 工作区下拉 | 工作区列表（含会话数元信息）、新建工作区（原生目录选择器）、行内更多：重命名 / 删除工作区。 |
| 会话下拉 | 当前工作区的会话列表（含相对时间元信息）、新建会话、行内更多：重命名 / 分支 / 归档会话。 |
| 原生一致的交互 | 下拉为自绘层，卡片沿用原生菜单 token（`--dsw-elevation-prominent`、`--dsw-radius-lg`、`--dsw-menu-surface-fill` + `--dsw-menu-backdrop-filter`、hover 填充 `--dsw-alias-interactive-bg-hover`）；行内度量为 min-height 40 / padding 8·10 / 14px·22px（与原生 `AccountMenu` 的 `[role=menuitem]` 一致；原生 `Menu.module.css` 更紧凑，本插件未跟随）。更多菜单、重命名/删除对话框全部使用原生 `Menu` / `Modal` / `Button` / `Input`（autoFocus、全选、输入法组合 Enter 防误触、工作区重复名校验、错误行）。 |
| 生命周期一致 | 更多菜单跟随其所在下拉同生命周期：下拉关闭（点击外部 / Escape / 选择 / 切换）时菜单一并关闭，不残留孤立菜单。 |
| 双语言 | 内置 zh/en 双语言字典，跟随 DSH 语言切换实时生效。 |

## 截图

**会话下拉展开**——切换会话、新建会话：

![会话下拉](docs/screenshots/session-dropdown.png)

**会话更多菜单**——悬停行尾，重命名/分支/归档：

![会话更多菜单](docs/screenshots/session-more-menu.png)

**工作区下拉展开**——切换工作区、新建工作区：

![工作区下拉](docs/screenshots/workspace-dropdown.png)

## 使用

安装后，打开任意会话，顶栏中央即显示「工作区 / 会话」面包屑：

- 点击**工作区**一侧：展开工作区下拉（顶部为「新建工作区」）。
- 点击**会话**一侧：展开会话下拉（顶部为「新建会话」）。
- 悬停列表行：行尾显示「更多」按钮（重命名 / 分支 / 归档等，按行类型而定）。
- 选择行即切换；点击空白处或按 `Esc` 关闭下拉。

## 与官方项目的关系

本项目基于官方 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 构建，是一个**社区插件**，并非 DeepSeek 官方产品。它展示的都是 DSH 自己的数据与界面，只是重新组织；不修改任何系统源码。

## 二次开发

- **`index.js`** —— host 半：最小空实现（纯 UI 插件，所有逻辑在浏览器半）。
- **`lib/client.js`** —— 浏览器半（UMD，注册进 DSH `clientModules`）。结构自上而下：
  1. 本地基础工具：样式注入 / 定时器。
  2. **双语字典**（`BST_ZH` / `BST_EN`）—— 注册进 `ctx.locale`，跟随语言切换；`bstT()` 带 fallback。
  3. **自绘下拉列表** `BstList` —— 沿用原生菜单样式与 token；定位避让视口边缘；`click` 外部关闭（不用 mousedown/pointerdown：它们先于 `click` 派发，会先行卸载列表、吃掉行内 click）。
  4. `WorkspaceTitleBreadcrumb` —— 注册进 `conversation.session.header.actions`（`order: -40`，顶栏最左）；逐级自适应图标态（该级标签被挤到可见宽度 < `ICONIC_TEXT_FLOOR` 才换图标，恢复走 header 宽度滞回，故不抖动）；更多菜单与下拉同生命周期；重命名/删除走原生 Modal。
  5. `apply(ctx)` —— 样式注入 + 槽位注册；`inject: ['slots','workspaces','sessions','uiWorkspace','locale']`（服务依赖必须声明，否则 apply 抢跑会把 `undefined` 永久固化进所有动作，表现为「界面正常、点了没反应」）。

扩展速查：

- **新增行操作** —— 在 `wsListItems` / `ssListItems` 的 `actions` 数组加一项（`{ id, label, icon?, danger?, action }`）。
- **新增文案** —— 在 `BST_ZH` / `BST_EN` 字典加 key。
- **调整下拉样式** —— 修改 `insertStyle` 中的 `.bst-item*` 规则（token 与原生 Menu 一致）。
- **调整图标态阈值** —— 阈值是 `ICONIC_TEXT_FLOOR`（≈5 个汉字宽）：某级文本被截断且可见宽度低于它、或整条面包屑溢出，才换图标。两个坑：① 别用「标题超过该级 `max-width`」当判据 —— 那在宽窗口下也会命中（长标题本来就超上限），界面会莫名其妙地到处变图标；② 别假设"文本一定会被挤" —— 顶栏容器默认不可收缩，溢出会表现为被窗口边缘裁掉（见 `has(.bst-crumbs)` 那条让容器可收缩的样式）。
- **给链上加一级** —— 只改 `bstSessionChain`（数据）即可；渲染端逐级同一段代码，图标按 `node.subagent` 取（子智能体级＝上下双箭头，其余＝会话字形），所以任何链长都不会出现「某级没有图标」的空洞。
- **下拉必须 portal 到 `document.body`** —— 原地渲染会落在顶栏槽位里，被应用外壳的层叠上下文压住：外壳/聊天内容（含第三方插件注入的「复制」按钮）会盖在下拉上面，列表首行也可能被侧栏网格盖住。原生 `Menu` 的 `portal: true` 就是同一个理由。
- **行动作行别用原生文案** —— 「手机口袋」类插件（实测 `dsh-pocket` 2.11.0 的 `hideWsEntries`）会全局扫描 `[role=menuitem]/[role=option]/li/button/a`，按文本**精确匹配** `添加工作区` / `Add workspace` 后写 `display:none`，并挂 MutationObserver 让新插入的节点同样被隐藏；沿用原生文案的那一行会被一并吃掉，看起来就是「下拉里少了一行」。自有文案（`新建工作区` / `New workspace`）即可避开。

## 特别感谢

感谢 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 与 DeepSeek AI 团队——核心的智能体、模型、工具、会话、Web UI 与插件生态都来自这个项目；也感谢 [Cordis](https://github.com/cordiverse/cordis) 提供的插件化基础，以及 [Koishi.js](https://koishi.chat/) 社区长期积累的插件化实践、工具与经验。

## 许可证

[MIT](LICENSE) —— 完全开源免费。

Better Session Title 是 DeepSeek Harness 的社区插件，**并非 DeepSeek 官方产品**。
