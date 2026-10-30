// ============================================================================
// 更好的会话顶栏 / Better Session Topbar · 浏览器端（Client）
// ----------------------------------------------------------------------------
// 本文件是插件的浏览器半，通过 UMD 包装注册到 DSH 的 clientModules。
//
// 定位：把会话顶栏中央的原生会话标题，替换为「工作区 / 会话」面包屑，并占据顶栏最前端
// （注册 order -40，任何原生项都在我们之后；0.2.1-rc.4 实测同槽为 agent-team -20、
//  agent-preset -10、cost-meter-statistics 1、subagent-catalog 10、job-list 20 —— 与 rc.3 相同，
//  原生顺序随版本变过，我们只依赖自己的 -40，不依赖别人的具体数字）。
// 进入子智能体会话时自动扩展为「工作区 / 父会话 / 子智能体会话」：祖先级可点跳回，
// 末级为当前会话；当前工作区按祖先链的根节点判定（子会话自身不一定属于任何工作区）。
//
// 折叠（紧凑）模式：空间不足时隐藏文本、只留图标，链有多长都成立，靠三条规矩：
//   ① **每一级都必须有图标** —— 工作区=文件夹、普通会话级=会话字形、子智能体级=文件夹+两条
//      竖杠的智能体字形（与顶栏子智能体 chip 同源）。祖先级原先只有文本，隐藏文本后就成了一眼
//      看不见、却仍能点的区域（子智能体会话下最明显）。
//   ② 保留「/」分隔 —— 图标态下层级顺序全靠它读出来（原生 crumbs 同样保留分隔）。
//   ③ 每个按钮都带 aria-label + title —— 文本 display:none 会连带移出可访问名，
//      没有它图标态就成了无名按钮。
// 点击语义：整颗按钮（含右侧箭头）是同一个命中区；按钮内的 svg 一律 pointer-events:none，
//   于是「点箭头」与「点文字」走的是同一条路径，不存在只有箭头失效的中间态。
//
// 复用原生原则：
//   * 下拉列表 —— 自绘弹出层，卡片沿用原生菜单 token（padding 4、圆角 --dsw-radius-lg、
//     shadow --dsw-elevation-prominent、surface --dsw-menu-surface-fill + --dsw-menu-backdrop-filter），
//     行内度量为 min-height 40 / padding 8·10 / 14px·22px / gap 8 —— 与原生 AccountMenu 的
//     [role=menuitem] 一致；**不是** Menu.module.css 的行内度量（那份更紧凑：34 / 6·8 / 13px·20px），
//     后续调整时别照 Menu.module.css 改。
//     原生 Menu 的 itemLabel 带 overflow:hidden 且选中态只有对勾，无法承载
//     「与 hover 一致的整行高亮」，故列表层自绘、视觉与原生完全一致。
//     列表行规范：行内不显示工作区/会话图标（仅「新建工作区」「新建会话」
//     动作行保留图标）；元信息（会话数 / 相对时间）靠行尾；悬停行时元信息
//     被「更多」按钮覆盖（触屏无 hover，则常显按钮、隐藏元信息）。
//   * 行内更多操作 —— 原生 Menu（getAnchorRect 锚定 ellipsis，引用稳定），
//     重命名 / 删除 / 分支 / 归档 全部真实服务调用。
//   * 重命名 / 删除确认 —— 原生 Modal + Button + Input（对齐 ui-workspace：
//     autoFocus、全选、输入法组合 Enter 防误触、重复名校验、错误行）。
//   * 图标 —— 原生 IconXxx（0.2.0-rc.2 命名为 …Regular / …Medium，见下方导入处说明）。
//   * 服务调用 —— 对齐 0.2.0-rc.2 的 ui-workspace：
//       renameWorkspace → workspaces.rename
//       deleteWorkspace → workspaces.delete
//       createWorkspace → workspaces.create
//       pickDirectory   → uiWorkspace.pickDirectory（0.2.0-rc.2 起不在 workspaces 上）
//       connectWorkspace→ uiWorkspace.connectWorkspace
//       openSession     → uiWorkspace.openSession（切换会话 / 新建会话后打开）
//       renameSession   → sessions.using(id,{source:'workspaceOperation'},
//                                        ref => ref.binding.session.rename(title))（{ok,error}）
//       forkSession     → uiWorkspace.forkSession({increaseTitle:true}) → openSession
//       archiveSession  → workspaces.archiveSession（无对话框，直接提交）
//     当前工作区回落：快照已无 recentWorkspaceId，改用 bstRecentWorkspaceId（复刻原生算法）。
//
// 独立插件：本插件自成一体 —— 自带 bundle 补丁（cordis.patch.yml 只插入本插件自己的行），
// 不依赖任何其它插件，也不被任何其它插件依赖；安装即始终生效，没有外部开关。
// 唯一对外约定：`.bst-crumbs` 是类名契约 —— 第三方插件的「隐藏顶栏重复元素」规则按它做豁免，
// **改名会让那些规则转而隐藏本插件的面包屑**。
// ============================================================================
window.__ModuleLoader__.load({
  // 必须等于包名（package.json 的 name）：宿主按包名解析本 bundle 并把工厂投递给
  // 浏览器，浏览器再按同一个 key 等待。两者不一致 = 永远等不到，插件整条静默不出现。
  // 包名只能取 URL-safe 的 ASCII（npm 的 EINVALIDPACKAGENAME 会拒绝中文），
  // 界面上的中文名走 locale 的 meta.title。
  id: 'dsh-better-session-topbar',
  factory: (require) => {
    // ============================================================
    // DSH 升级维护清单 —— 每次 DSH 内核/UI 包升级后，按这张表逐项核对
    // ============================================================
    // 本插件是「贴着原生内部契约」的 UI 层，没有稳定的第三方 API 可依赖；
    // 下面每一项都对应 DSH 侧的具体实现，升级后必须重新取证（读 asar + 实机点一遍）。
    //
    // 1) 包与装配契约（改错 = 插件直接不加载）
    //    - __ModuleLoader__.load({ id }) 的 id 必须等于 package.json 的 name；
    //    - cordis.patch.yml 的行 id / name 也必须是同一个包名；
    //    - 插件详情页配置槽键 = `<包名>#<行 id>`（configForms.get 用同一个 id）。
    // 2) 槽位名（slots 服务）
    //    - 顶栏：conversation.session.header.actions（order -40）；
    //    - 目录流：sidebar.workspaces.directoryFlow / conversation.hero.workspace.directoryFlow；
    //    - 插件配置：plugins.row.config。
    //    同槽其它项的顺序会随版本变（rc.2：subagent-catalog -30、team -20、preset -10；
    //    rc.3：team -20、preset -10、cost-meter-statistics 1、subagent-catalog 10、job-list 20；
    //    rc.4 实测与 rc.3 逐项相同），我们只依赖自己的 -40 排在最前，不依赖别人的具体数字。
    //    升级后先用 cordis_inspect_query 看这些名字与 props 是否还在。
    // 3) 服务名与语义（inject）
    //    - 硬依赖：slots / workspaces / sessions / uiWorkspace / locale；
    //    - 可选依赖：shortcuts、configForms（走 ctx.inject 子级，缺了只少功能）。
    //    - 添加工作区只用到 workspaces.create / uiWorkspace.openWorkspace / pickDirectory；
    //      不再依赖 listDirectory / createDirectory（插件不自绘目录面板）。
    // 4) 命令与快捷键（shortcuts.catalog）
    //    - 只读 catalog 快照做「更多」菜单的快捷键提示（行形如 { id, label, keys, aria }）。
    //    - `workspace.add` 仍是「添加工作区」主路径：侧栏 WorkspacePickFlow 是 addOnly:true，
    //      open 升起后直接展开 directoryFlow（不会先弹切换菜单）。命令 blocked 时 invoke
    //      静默返回，只能当「已交给宿主」，不能当「界面已出现」——所以槽空/无 catalog 行时
    //      我们不调用它，直接走能力兜底（见 newWorkspace）。
    // 5) 目录选择交互（最易变的一块）
    //    - 插件**不接管**目录流、也**不自绘**面板：点「添加工作区」只调宿主的 workspace.add，
    //      occupant 决定长相 —— browse = 官方应用内面板；native = 官方 renderless occupant
    //      直接弹系统「选择文件夹」（win32/darwin 本地、loopback、非 SSH 即 native）。
    //      宿主侧由 dsh-host-directory-picker-auto 在启动时判定：loopback + 非 SSH + 无远程
    //      授权时，win32/darwin → native，Linux 还要有 zenity/kdialog 与 DISPLAY/WAYLAND_DISPLAY。
    //    - 槽空时的兜底顺序：preload 桥 __DSH_DIRECTORY_PICKER__（桌面壳，三平台）→
    //      uiWorkspace.pickDirectory() → 明确报错。DSH NEXT 2.0.21-next 与官方桌面 0.2.1-rc.4 都
    //      只暴露 __DSH_DIRECTORY_PICKER__（后者同时注入 window.desktopNext）。
    //      升级后按「桌面窗口 / 网页 / 社区桌面 / 社区网页」四种组合各点一次。
    // 6) 添加工作区不弹插件自己的面板（设计约定）
    //    - 历史上有过自绘的 680×500 面板与 priority:-1 接管，1.5.0 起删除；若再引入，
    //      必须同时恢复「目录流占用者让位」与「自身卸载后还原」两套保护。
    // 7) 顶栏 DOM 锚点
    //    - 隐藏原生标题靠 header[data-window-drag] nav:has(~ div .bst-crumbs)；
    //      0.2.0-rc.2 用的是 [data-conversation-header]/[data-conversation-title-row]，
    //      0.2.1-rc.2 起这两个属性被移除 —— 升级后先确认这段结构是否又变。
    //    - 只读原生 DOM 做定位/测量，绝不改 React 拥有的节点。
    // 8) 组件契约（primitives）
    //    - Modal({ open, onClose, title, className })；Button({ variant, icon, className, disabled })；
    //      Input、Menu、Switch，以及 *Regular 命名的图标（无尺寸后缀）。props 改名不会在构建期
    //      报错，只会在运行时炸，所以每次升级都要实机点开重命名/删除对话框与设置页。
    // 9) 文案与错误
    //    - 字典走 ctx.locale.register，键名与原生菜单对齐（添加工作区 / 新会话 / 分支会话）。
    // 10) 打包与本地安装
    //    - profile 用 link:/junction 指向本仓库时宿主解析真实路径；
    //      schemastery 是 peer 依赖，本地开发需要 node_modules/@deepseek-ai/schemastery 链接。
    //
    // 维护流程：DSH 升级后先跑 `npm run check:instance`（逐项核对 asar 里的槽位名 / 组件导出 /
    // DOM 锚点 / 服务方法），再按 README「DSH 升级维护清单」逐项实机验证
    // （顶栏 / 下拉 / 添加工作区 / 设置页）。
    // ============================================================
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')
    // 下拉列表要 portal 到 document.body：原地渲染会留在顶栏槽位的层叠/裁剪上下文里，
    // 被应用外壳（侧栏列网格）与页面内容（聊天正文等）盖住 —— 原生 Menu 的 portal 同款理由。
    let createPortal = null
    try {
      const reactDom = require('react-dom')
      if (reactDom && typeof reactDom.createPortal === 'function') createPortal = reactDom.createPortal
    } catch { /* 拿不到就退回原地渲染 */ }
    // 原生 UI 组件库：对话框 / 按钮 / 输入框 / 菜单 / 图标
    let {
      Menu, Modal, Button, Input,
      // 0.2.0-rc.2 起图标改为「无尺寸 + 字重后缀」命名（…Regular / …Medium）。
      // 新名默认尺寸与原 …14 / …16 / …20 名一一对应（chevron、queue = 14；archive = 20；
      // 其余 = 16），所以这里只是改名，各调用点无需传 size。
      IconFolderCloseRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular,
      IconNewChatOutlineRegular, IconProjectAddOutlineRegular, IconEditOutlineRegular,
      IconTrashOutlineRegular, IconBranchOutlineRegular, IconArchiveOutlineRegular,
      IconEllipsisOutlineRegular, IconQueueOutlineRegular,
      // 会话菜单（与原生菜单同款）：置顶/取消置顶、复制 Session ID
      IconPinOutlineRegular, IconPinFillRegular, IconCopyOutlineRegular,
      // 插件详情页（设置页）的控件。两项配置：窄屏显示方式是两选一的选择器，
      // 用原生「外观方块」（theme cube）的版式 —— 那正是 DSH 设置页里「浅色 / 深色 /
      // 跟随系统」三选一的同一套控件；探针日志仍是布尔偏好，用原生 Switch ——
      // 不用 SegmentedControl：那一个是 tablist→panel 语义（每个选项带 aria-controls
      // 指向面板），我们这里没有面板，用它就会产出悬空的 aria-controls 引用。
      Switch,
      // 选择器两枚方块的字形：面包屑＝文件夹（工作区级），标题＝带笔的列表行（标题文本）。
      // 两者都在 primitives 的导出里，与设置页其它图标同源。
      IconFolderOpenOutlineRegular, IconListPenOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    // 设置页两枚模式方块的字形：内核若没有新图标，退回同语义的旧图标（宁可形状差一点，
    // 也不要 ReferenceError 把整个详情页打成空白 —— 老版本里已经踩过这类坑）。
    const ModeCrumbIcon = IconFolderOpenOutlineRegular || IconFolderCloseRegular
    const ModeTitleIcon = IconListPenOutlineRegular || IconEditOutlineRegular

    // ============================================================
    // 子智能体 / 后台任务图标（SVG 字符串是唯一来源）
    // ============================================================
    // ① 子智能体：文件夹 + 两条竖杠的「小机器人脸」（用户点名要的那枚，图形名
    //    icon-workspace-tree-outline），两条 path 的 d 与 linecap/linejoin 逐字取自
    //    dsh-xshared-lib parts/icons.data.json 的同名条目（viewBox 0 0 16 16）。
    //    描边宽度由外层给（数据里标了 stroke-from-wrapper）：原生图标是 1，但这条 folder
    //    轮廓长、拐角少，1 会显得比同排图标细，故取 1.5——与顶栏视觉重量对齐。
    const SUBAGENT_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">',
      '<path d="M14 12.05c0 .8-.65 1.45-1.46 1.45H3.46C2.65 13.5 2 12.85 2 12.05v-8.1c0-.8.65-1.45 1.46-1.45h2.4c.49 0 .94.24 1.21.65l.5.73c.27.4.73.65 1.21.65h3.76c.8 0 1.46.65 1.46 1.45v6.02Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M8.7 8.1v3M11.2 8.1v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      '</svg>',
    ].join('')
    // ①b 上下双箭头：DSH 原生 switcher 那枚（父级压缩态专用）。两条 path 逐字取自用户
    //    给的规格（viewBox 16、stroke 默认 1、round 端点/拐角）。语义是「这里还有一层」，
    //    正是「父会话让成图标」时要表达的东西 —— 所以不复用子智能体的文件夹脸。
    const SWITCHER_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
      '<path d="m5.1 6 2.9-2.9L10.9 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="m5.1 10 2.9 2.9 2.9-2.9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
      '</svg>',
    ].join('')
    // ② 后台任务：`>_` 终端提示符装进一个圆角窗口框（用户要求「加个边框试试」）。
    //    `>_` 的几何仍来自 icon-api-outline（"M3 4L7 8L3 12" + "M9 12H13"），只是等比内缩到框内；
    //    框 13.7×11.7、圆角 3（几乎撑满 16 网格，留 1.15 的外边距给描边），与顶栏其它图标的
    //    圆角语言一致；描边统一 1.4，缩小后仍分得清框与字。
    const JOBS_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">',
      '<rect x="1.15" y="2.15" width="13.7" height="11.7" rx="3" stroke="currentColor" stroke-width="1.4"/>',
      '<path d="M4.9 6.1L7 8L4.9 9.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M8.7 9.9H11.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      '</svg>',
    ].join('')
    // 同一份字符串两种用法：React 里用 dangerouslySetInnerHTML 渲染成行内 svg（继承 currentColor），
    // CSS 里用 mask-image 给原生 chip 的 ::before 上色（mask 只看 alpha，currentColor 在 mask 里无意义）。
    // ③ 下拉箭头：官方「智能体团队」那枚只有图标+文字、没有箭头，我们补一枚（形状取自
    //    xshared-lib icons.data.json 的 icon-chevron-down-outline，与顶栏其它箭头同源）。
    //    用 CSS ::after + mask 画，不往官方 DOM 里塞节点；展开态由官方自己的 aria-expanded 驱动旋转。
    const CHEVRON_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">',
      '<path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      '</svg>',
    ].join('')
    const cssMask = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27') + '")'
    const glyph = (svg, className) => React.createElement('span', {
      className: className,
      'aria-hidden': true,
      dangerouslySetInnerHTML: { __html: svg },
    })
    // ④ 「运行中」圆环：逐字复刻官方 primitives 的 StateDot（ongoing 态）——
    //    viewBox 0 0 24 24、r=9.5、stroke 2、底环 opacity .25、弧 dasharray 12→24，
    //    外层 1.5s 匀速旋转 + 弧 1.5s 呼吸。子智能体 / 后台任务两枚 chip 的圆环是官方组件
    //    自己渲染的，智能体团队那枚没有，我们补的这枚必须跟它们长得一模一样，
    //    否则三枚里会有一枚明显不同。
    const STATE_SPINNER_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">',
      '<g class="bst-spin-motion">',
      '<circle class="bst-spin-track" cx="12" cy="12" r="9.5"/>',
      '<circle class="bst-spin-arc" cx="12" cy="12" r="9.5"/>',
      '</g></svg>',
    ].join('')
    // 官方用 pinSpinner() 把所有 spinner 的 CSS 动画 startTime 钉到文档时间零点（多个 spinner
    // 同时出现时同相旋转）。我们补的这枚如果不同相，会和旁边两枚明显错开，所以照抄这一手。
    const pinSpin = (node) => {
      try {
        for (const a of node.getAnimations({ subtree: true })) a.startTime = 0
      } catch { /* 老引擎没有 getAnimations，退回各自起转 */ }
    }

    // 图标态下限：某一级的标签被顶栏挤到可见宽度小于这个值（≈5 个汉字）时，文本已经读不出
    // 内容，该级改为只显示图标（完整标题仍在 title / aria-label 里，悬停即得）。
    // 注意这是「挤到读不出」的判据，不是「标题比上限长」：后者哪怕窗口再宽也会命中
    // （标题本身就超过 max-width 上限），那正是"这么宽怎么变图标"的来源。
    // 参考量：会话级标签在上限（180px）时的可见宽度约 130px —— 下限必须明显小于它。
    const ICONIC_TEXT_FLOOR = 80
    // 文本态面包屑需要的宽度 = 每级成本 × 级数 + 级间成本：
    //   每级 = 固定开销 54（padding 8×2 + 图标 16 + 两个 gap 5 + 箭头 12）+ 标题下限 80 = 134
    //   级间 = 分隔 5 + 间距 12 ≈ 17
    // **级数在运行时才知道**（工作区 + 每一级会话；子智能体会话下是 3 级），所以这里只放单价，
    // 实际阈值由 update() 里的 crumbNeed 按 el.querySelectorAll('.bst-crumb-btn').length 推导。
    // 曾经写成固定 288（按两级链的粗估），三级链下会高估可用宽度，把标题压成三四十像素
    // 还不收起（第三轮 OCR 指出的问题）。改度量（字号/padding/图标）时这两个数要跟着重算。
    const CRUMB_LEVEL_COST = 134
    const CRUMB_SEP_COST = 17
    // ---- 压缩阶梯（宽度从宽到窄，用户点名的顺序）----
    //   ① 三枚原生 chip：full → count（文字换成「(N)」），判据 avail < crumbNeed；
    //   ② **面包屑整条收成图标**（三枚 chip 停在 count，统计数留着 —— 长标题最不值钱）；
    //   ③ chip count → icon，判据 avail < CRUMB_ICON_NEED。
    // ②③ 之间留出约 125px 的带宽（两级链 crumbNeed=285），否则两级几乎同时发生、用户看不到
    // 「标题先让位」这一步。
    // 阶梯只按 avail 单向判定 —— **不要用顶栏宽度（header.clientWidth）做滞回**：折叠往往不是
    // 顶栏变窄引起的（改名变长、新 chip 出现都会），那种折叠一旦按顶栏宽度记基准，就再也解不开
    // （OCR 评审指出的 high 问题，见 unfoldNeed 处的说明）。
    const CRUMB_ICON_NEED = 160
    // 面包屑从图标态回到文本态时，标题会重新吃掉约 130px（图标态 ≈112、文本态 ≈241）。
    // 展开门槛要比折叠高这么多，否则「展开 → chip 顺势升档变宽 → avail 又不够 → 折叠」
    // 会 300ms 翻一次。用的仍是 avail（内容驱动），所以内容变短时它立刻能解开。
    const CRUMB_TEXT_ADD = 136
    // 原生 chip 的折叠次序：子智能体先折（面包屑里已有冗余信息），后台任务后折。
    const CHIP_KEYS = ['sub', 'team', 'jobs']
    // 每级标题的宽度预算「per」的取值范围（update() 里按可用宽度插值）。
    const CRUMB_MAX_MIN = 150
    const CRUMB_MAX_MAX = 420
    // 标题态下的父级压缩：`per` 触底就说明顶栏已经把标题压到最小，这时把父级让成图标，
    // 宽度全留给当前标题；回差 40（per 涨回 190 才展开）防止来回翻。
    // 用 `per` 而不是实测宽度：avail() 不含我们自己的宽度，所以「父级变图标」不会反过来
    // 改变判据 —— 不自激。
    const TITLE_PARENT_ICON_AT = CRUMB_MAX_MIN
    const TITLE_PARENT_ICON_BACK = CRUMB_MAX_MIN + 40

    // ============================================================
    // 本地基础工具：样式注入 / 定时器
    // ============================================================
    const styleTags = []
    function insertStyle(css) {
      if (typeof document === 'undefined') return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-better-session-topbar'
      tag.textContent = css
      document.head.append(tag)
      styleTags.push(tag)
    }
    function interval(fn, ms) {
      const id = setInterval(fn, ms)
      return () => clearInterval(id)
    }
    // ---- 设置：两个 id 与一份共享缓存 ----
    // 命名空间 = bundle 行的 id（host 半 `index.js` 的 Config schema 用同一个），
    // 详情页的槽位键则是 `<包名>#<行 id>`。
    const BST_PKG = 'dsh-better-session-topbar'
    const BST_ENTRY_ID = 'dsh-better-session-topbar'
    const BST_ROW_KEY = BST_PKG + '#' + BST_ENTRY_ID
    // 当前生效的设置值。顶栏测量（每趟）与详情页（每次渲染）都从这里读，唯一事实源是
    // 官方 `configForms` 服务；服务缺席时保持下面这份初值（与 host 半 schema 的默认值一致）。
    const bstSettings = {
      narrowMode: 'crumb', // 'crumb'＝窄屏时面包屑收成图标；'title'＝窄屏时整行只留会话标题
      probeLog: false,
      status: 'loading',        // 'loading' | 'ready' | 'unavailable'
      writable: false,
      // 顶栏那一趟测量在 effect 里挂上自己的回调：设置一变就重算（并让结构探针有机会补打）
      onChange: null,
    }
    // 官方 configForms 里的共享 form 实例（详情页与顶栏读同一个）。服务缺席时保持 null。
    let bstForm = null

    // ---- 诊断日志：默认关闭，开关在插件详情页 ----
    // 正常使用时一行都不写：渲染进程的 console 会被宿主转发并落盘
    //（~/.dsh/logs/desktop-next*.jsonl），既是噪声也是开销；排查现场时才打开。
    // 前缀仍是 [bst-dom] / [bst-chip] / [bst-perf]，开发者工具里按它筛即可。
    const bstDebug = () => bstSettings.probeLog === true
    const bstLog = (msg) => {
      if (bstDebug() !== true) return
      try { console.info(msg) } catch { /* ignore */ }
    }

    // ============================================================
    // 插件字典（zh/en，跟随 DSH 语言切换）
    // ============================================================
    const BST_ZH = {
      'slot.breadcrumb': '工作区/会话',
      'crumb.workspaceNone': '未关联工作区', 'crumb.sessionNone': '新会话', 'crumb.noSiblings': '暂无同级子代理',
      // 文案与原生菜单对齐（用户要求）：「添加工作区」「新会话」「分支会话」。
      // （曾为躲开 dsh-pocket 2.11.0 的按文本隐藏功能而写成「新建工作区」；该插件不在当前组合里，
      //   且用户明确要求原生文案，故改回。）
      'crumb.addWorkspace': '添加工作区', 'crumb.noWorkspaces': '暂无工作区', 'crumb.newSession': '新会话', 'crumb.noSessions': '当前工作区暂无会话',
      'crumb.rename': '重命名', 'crumb.remove': '删除工作区', 'crumb.fork': '分支会话', 'crumb.archive': '归档会话',
      'crumb.pin': '置顶会话', 'crumb.unpin': '取消置顶', 'crumb.copySessionId': '复制 Session ID',
      // （browser.title/home/newFolder/folderName/createIn/untitledFolder/create/cancel/open/editPath/loading/truncated/showHidden）
      // 系统选择按钮：三平台共用一条文案（Win 资源管理器 / macOS Finder / Linux 文件选择器
      // 都由宿主或 preload 桥决定），不在插件里按平台分叉。
      // 顶栏三枚原生 chip 的 full 档文字（数字由统计数 span 统一给出，见测量代码）：
      // 官方那两枚把「3 个子智能体」整串交给 i18n 拼，数字嵌在文字里，「(3)」就没处放了。
      'chip.sub': '子智能体', 'chip.jobs': '后台任务',
      'menu.more': '更多',
      'dialog.renameWsTitle': '重命名工作区', 'dialog.renameWsPlaceholder': '工作区名称', 'dialog.renameWsDuplicate': '已存在同名工作区',
      'dialog.renameSessionTitle': '重命名会话', 'dialog.renameSessionPlaceholder': '会话标题',
      'dialog.deleteWsTitle': '删除工作区', 'dialog.deleteWsBody': '确定删除工作区「{name}」吗？其会话将移入未分组。此操作不可撤销。',
      'dialog.pickerErrorTitle': '添加工作区失败', 'dialog.close': '关闭',
      // 服务死了且没有桌面桥（社区版网页版）：既没有目录服务也没有桥，只能明确告知。
      'dialog.noPickerTitle': '无法添加工作区',
      'dialog.noPickerBody': '当前宿主没有提供目录选择服务，无法打开目录选择器（社区版网页版常见这种情况）。请改用桌面窗口添加工作区。',
      'dialog.actionErrorTitle': '操作失败',
      'dialog.serviceNotReady': '界面服务尚未就绪（工作区/会话控制器还没连上），请稍后重试。',
      'dialog.confirm': '确定', 'dialog.cancel': '取消',
      'dialog.busy': '处理中…', 'dialog.failed': '操作失败：{error}',
      'rel.justNow': '刚刚', 'rel.minutes': '{n}分钟', 'rel.hours': '{n}小时', 'rel.days': '{n}天', 'rel.months': '{n}个月', 'rel.years': '{n}年',
      // 插件详情页（Plugins → 本插件 → 配置）
      'settings.summary': '窄屏显示方式与探针日志',
      'settings.narrowMode': '窄屏会话标题显示选择',
      'settings.narrowModeHint': '顶栏放不下完整面包屑时（窄屏），改用下面哪一种方式显示。',
      'settings.modeGroup': '窄屏显示方式',
      'settings.modeCrumb': '面包屑模式',
      'settings.modeCrumbNote': '保留「工作区 / 会话」层级，每一级都能点开切换；最窄时只剩图标，标题全文要悬停或点开才看得到。',
      'settings.modeTitle': '标题模式',
      'settings.modeTitleNote': '整行只留当前会话标题（子智能体会话保留「父 / 当前」），长标题更完整；工作区与切换收进下拉，极窄时父级变成上下箭头图标。',
      'settings.probeLog': '探针日志', 'settings.probeLogHint': '向控制台输出 [bst-dom] / [bst-chip] / [bst-perf] / [bst-picker]，仅排查问题时打开。',
      'settings.writeFailed': '保存失败，已恢复为服务端保存的值。',
      'settings.unavailable': '设置服务不可用，暂时无法修改（插件其余功能不受影响）。',
      'settings.loading': '正在读取设置…',
    }
    const BST_EN = {
      'slot.breadcrumb': 'Workspace/Session',
      'crumb.workspaceNone': 'No workspace', 'crumb.sessionNone': 'New session', 'crumb.noSiblings': 'No sibling subagents',
      // Match the native menu wording (see the zh dictionary).
      'crumb.addWorkspace': 'Add workspace', 'crumb.noWorkspaces': 'No workspaces', 'crumb.newSession': 'New session', 'crumb.noSessions': 'No sessions in this workspace',
      'crumb.rename': 'Rename', 'crumb.remove': 'Delete workspace', 'crumb.fork': 'Fork session', 'crumb.archive': 'Archive session',
      'crumb.pin': 'Pin session', 'crumb.unpin': 'Unpin session', 'crumb.copySessionId': 'Copy session ID',
      'chip.sub': 'Subagents', 'chip.jobs': 'Background jobs',
      'menu.more': 'More',
      'dialog.renameWsTitle': 'Rename workspace', 'dialog.renameWsPlaceholder': 'Workspace name', 'dialog.renameWsDuplicate': 'A workspace with this name already exists',
      'dialog.renameSessionTitle': 'Rename session', 'dialog.renameSessionPlaceholder': 'Session title',
      'dialog.deleteWsTitle': 'Delete workspace', 'dialog.deleteWsBody': 'Delete workspace "{name}"? Its sessions move to the ungrouped list. This cannot be undone.',
      'dialog.pickerErrorTitle': 'Add workspace failed', 'dialog.close': 'Close',
      'dialog.noPickerTitle': 'Cannot add workspace',
      'dialog.noPickerBody': 'This host provides no directory picker, so the picker cannot open (common in the community web build). Add the workspace from the desktop window instead.',
      'dialog.actionErrorTitle': 'Action failed',
      'dialog.serviceNotReady': 'The UI services are not ready yet (workspace/session controller still connecting). Please retry in a moment.',
      'dialog.confirm': 'Confirm', 'dialog.cancel': 'Cancel',
      'dialog.busy': 'Working…', 'dialog.failed': 'Action failed: {error}',
      'rel.justNow': 'just now', 'rel.minutes': '{n}m', 'rel.hours': '{n}h', 'rel.days': '{n}d', 'rel.months': '{n}mo', 'rel.years': '{n}y',
      // The plugin detail page (Plugins → this plugin → Configure)
      'settings.summary': 'Narrow-screen display and probe logs',
      'settings.narrowMode': 'Narrow-screen session title display',
      'settings.narrowModeHint': 'When the full breadcrumb no longer fits (narrow screens), switch to one of these displays.',
      'settings.modeGroup': 'Narrow-screen display',
      'settings.modeCrumb': 'Breadcrumb',
      'settings.modeCrumbNote': 'Keeps the workspace / session levels, each one clickable for switching; at the narrowest it folds to icons, so the full title needs a hover or a click.',
      'settings.modeTitle': 'Session title',
      'settings.modeTitleNote': 'Shows only the current session title (parent / current for subagent sessions), so long titles stay readable; the workspace and switching move into the dropdown, and at the narrowest the parent becomes the up/down arrow glyph.',
      'settings.probeLog': 'Probe logs', 'settings.probeLogHint': 'Writes [bst-dom] / [bst-chip] / [bst-perf] / [bst-picker] to the console. For troubleshooting only.',
      'settings.writeFailed': 'Could not save; the stored value was reloaded.',
      'settings.unavailable': 'The settings service is unavailable, so this cannot be changed right now (the rest of the plugin still works).',
      'settings.loading': 'Reading settings…',
    }

    module.exports = {
      name: 'Better Session Topbar',
      // cordis 级依赖声明：必须等这些服务就绪再 apply。
      // ① 少了 `slots`，apply 会在槽位系统就绪前执行，`slots.inject(key, cb)` 的回调**永不触发**
      //    ——插件静默不注册、界面什么都不显示，且全链路没有任何报错。
      // ② 少了 workspaces / sessions / uiWorkspace / locale，apply 可能在这些服务注册前跑完：
      //    下面 `ctx.get(...)` 拿到的是 undefined，而 apply 只执行一次 —— 于是这层 undefined
      //    被**永久捕获**进所有事件处理闭包，表现是「面包屑外观完全正常，但下拉里的
      //    切换 / 新建 / 重命名 / 删除 全部点了没反应」，既无异常也无日志。
      //    官方/第三方客户端插件都声明各自的服务依赖；新增服务依赖时同步加进这里。
      //    shortcuts **不写进这里**：它只用于「更多」菜单里的快捷键提示，缺了菜单照常工作；
      //    而 cordis 的 inject 是硬依赖 —— 第三方发行版一旦没装这个服务，
      //    整个插件（连面包屑）都不会 apply，界面直接消失。改走下面的 ctx.inject 子级。
      inject: ['slots', 'workspaces', 'sessions', 'uiWorkspace', 'locale'],
      apply(ctx) {
        ctx.effect(() => () => { for (const tag of styleTags.splice(0)) tag.remove() }, 'bst: styles')
        const slots = ctx.get('slots')
        if (slots === undefined) return
        const workspaces = ctx.get('workspaces')
        const sessions = ctx.get('sessions')
        // 0.2.0-rc.2：目录选择器与「打开会话 / 打开工作区」搬到 uiWorkspace 服务；
        // workspaces / sessions 只保留列表与 CRUD（rename / delete / create / fork / binding 仍在）。
        // 上面 inject 已保证这四个服务在 apply 前就绪；万一某天组合里确实缺了，
        // 各动作会走 fail('dialog.serviceNotReady') 给出可见错误，而不是静默不执行。
        const uiWorkspace = ctx.get('uiWorkspace')
        const locale = ctx.get('locale')
        // 「更多」菜单的快捷键提示：catalog = { getSnapshot(): rows, subscribe(listener) }，
        // rows 行形如 { id, label, keys: ['Ctrl','+','Alt','+','G'], aria: 'Control+Alt+G' }。
        // 与原生会话菜单同源（session.rename / session.fork / session.archive）。
        // 用 ctx.inject 子级而不是硬 inject：服务缺席时只少一处提示，插件其余部分照常工作。
        // 只取 catalog：0.2.1-rc.3 起 shortcuts.invoke('workspace.add') 只在「槽里有人接」时
        // 才值得调用（见 newWorkspace）；服务本身仍要拿，catalog 用于「更多」菜单的按键提示。
        let shortcuts
        let shortcutCatalog = null
        ctx.inject(['shortcuts'], (shortcutCtx) => {
          const svc = shortcutCtx.get('shortcuts')
          if (svc === undefined) return
          shortcuts = svc
          shortcutCatalog = svc.catalog ? svc.catalog : null
          return () => { shortcuts = undefined; shortcutCatalog = null }
        })
        // ---------- 设置：官方 configForms 服务 ----------
        // 顶栏测量与详情页读同一份 `bstSettings`，唯一事实源是官方 configForms 服务；
        // 写入落在当前 profile 的 Cordis patch（volatile 字段下一次读取即生效）。
        // 用 ctx.inject 子级而不是写进 inject：服务缺席时只该少一个设置界面，
        // 不该让整个插件（面包屑）停摆 —— 与上面那批硬依赖的取舍相反。
        function syncSettings(snap) {
          const next = snap !== undefined ? snap : (bstForm !== null ? bstForm.getSnapshot() : null)
          if (next === null || next === undefined) { bstSettings.status = 'unavailable'; return }
          bstSettings.status = typeof next.status === 'string' ? next.status : 'loading'
          bstSettings.writable = next.writable === true
          const value = next.value
          if (value !== null && value !== undefined && typeof value === 'object') {
            // 只认认识的取值：schema 之外的脏值一律退回默认（与 Host 端校验一致）
            bstSettings.narrowMode = value.narrowMode === 'title' ? 'title' : 'crumb'
            bstSettings.probeLog = value.probeLog === true
          }
          // 顶栏那一趟测量依赖这两个值 → 通知它重算（并让结构探针有机会补打）
          if (typeof bstSettings.onChange === 'function') {
            try { bstSettings.onChange() } catch { /* 顶栏已卸载 */ }
          }
        }

        // ---------- 插件详情页（Plugins → 本插件 → 配置） ----------
        // 位置：`plugins.row.config`，键 `<包名>#<行 id>`。这一半只做两件事：
        //   ① 读：本条目命名空间的共享 form 快照（value / writable / status）；
        //   ② 写：同一个 form 实例的 set(field, value) —— 即时生效，不做 Save/Discard。
        // 版式跟插件管理器自己的 facts 行一致：min-height 44、上下 padding 8、下边框 .5px。
        function BstSettingsPage(props) {
          const t = useBstLocale()
          // 直接订阅 form：详情页与顶栏拿到同一个实例，任何一处写入都会让两边同时更新。
          const snap = React.useSyncExternalStore(
            (listener) => (bstForm !== null ? bstForm.subscribe(listener) : () => {}),
            () => (bstForm !== null ? bstForm.getSnapshot() : null),
          )
          const [busy, setBusy] = React.useState(false)
          const [failed, setFailed] = React.useState(false)
          // view === 'summary' 是插件列表里的一行简介（只有包本身没有描述时才会被用到）
          if (props !== undefined && props.view === 'summary') return t('settings.summary')
          if (bstForm === null || snap === null || snap === undefined) {
            return React.createElement('p', { className: 'bst-settings-status', role: 'status' }, t('settings.unavailable'))
          }
          const value = snap.value !== null && snap.value !== undefined && typeof snap.value === 'object' ? snap.value : {}
          const narrowMode = value.narrowMode === 'title' ? 'title' : 'crumb'
          const probeLog = value.probeLog === true
          const loading = snap.status === 'loading'
          const unavailable = snap.status === 'unavailable'
          // 写入中 / 未就绪 / 只读时一律锁住控件：官方 form 的 writable 是写入是否被接受的权威
          const locked = loading || unavailable || snap.writable !== true || busy
          const write = (field, next) => {
            if (locked) return
            setBusy(true)
            setFailed(false)
            Promise.resolve(bstForm.set(field, next)).then(
              (ok) => { setBusy(false); setFailed(ok !== true) },
              () => { setBusy(false); setFailed(true) },
            )
          }
          const row = (labelKey, hintKey, control) => React.createElement('div', { className: 'bst-settings-row', key: labelKey },
            React.createElement('div', { className: 'bst-settings-main' },
              React.createElement('span', { className: 'bst-settings-label' }, t(labelKey)),
              hintKey === null ? null : React.createElement('p', { className: 'bst-settings-hint' }, t(hintKey)),
            ),
            control,
          )
          const status = failed ? t('settings.writeFailed')
            : unavailable ? t('settings.unavailable')
              : loading ? t('settings.loading') : ''
          // 窄屏显示方式：两选一的「方块选择器」，版式照抄 DSH 设置页的外观三选一
          //（theme cube：图标 + 名称，选中态换底色与描边，aria-pressed 表达选择）。
          // 每个方块带一句取舍说明 —— 用户要求两种模式的优缺点都要写出来，
          // 而且要在选项旁边就能读到，不另开一处帮助。
          const modeCube = (id, nameKey, noteKey, Icon) => React.createElement('button', {
            key: id,
            type: 'button',
            className: 'bst-mode-cube',
            'aria-pressed': narrowMode === id,
            'data-bst-mode': id,
            disabled: locked,
            onClick: () => { if (narrowMode !== id) write('narrowMode', id) },
          },
            React.createElement('span', { className: 'bst-mode-head' },
              React.createElement(Icon, { size: 16 }),
              React.createElement('span', { className: 'bst-mode-name' }, t(nameKey)),
            ),
            React.createElement('span', { className: 'bst-mode-note' }, t(noteKey)),
          )
          return React.createElement('div', { className: 'bst-settings' },
            React.createElement('div', { className: 'bst-settings-block' },
              React.createElement('span', { className: 'bst-settings-label' }, t('settings.narrowMode')),
              React.createElement('p', { className: 'bst-settings-hint' }, t('settings.narrowModeHint')),
              React.createElement('div', {
                className: 'bst-mode-cubes',
                role: 'group',
                'aria-label': t('settings.modeGroup'),
              },
                modeCube('crumb', 'settings.modeCrumb', 'settings.modeCrumbNote', ModeCrumbIcon),
                modeCube('title', 'settings.modeTitle', 'settings.modeTitleNote', ModeTitleIcon),
              ),
            ),
            row('settings.probeLog', 'settings.probeLogHint',
              React.createElement(Switch, {
                checked: probeLog,
                label: t('settings.probeLog'),
                disabled: locked,
                onChange: (next) => write('probeLog', next),
              })),
            status === '' ? null : React.createElement('p', {
              className: 'bst-settings-status',
              role: 'status',
              'data-tone': failed ? 'error' : 'muted',
            }, status),
          )
        }

        ctx.inject(['configForms'], (ctx) => {
          const configForms = ctx.get('configForms')
          if (configForms === undefined || typeof configForms.get !== 'function') return
          // 命名空间 = 行 id。同一个 profile 里任何地方调 get(同一个 id) 拿到的都是同一个实例。
          bstForm = configForms.get(BST_ENTRY_ID)
          ctx.effect(() => {
            syncSettings()
            const off = bstForm.subscribe(() => syncSettings())
            return () => { try { off() } catch { /* ignore */ } }
          }, 'bst: settings mirror')
          // 详情页注册进插件管理器的行页面槽：键 `<包名>#<行 id>`。
          // slots.inject 包一层 —— 插件管理器可能比我们晚挂载。
          slots.inject('plugins.row.config', () => slots.register(
            { name: 'plugins.row.config', key: BST_ROW_KEY, locale: 'better-session-title' },
            BstSettingsPage,
          ))
        })
        function useShortcut(id) {
          return React.useSyncExternalStore(
            shortcutCatalog !== null ? shortcutCatalog.subscribe : (() => () => {}),
            () => {
              if (shortcutCatalog === null) return undefined
              const rows = shortcutCatalog.getSnapshot()
              return rows.find((row) => row.id === id)
            },
          )
        }

        // ---------- 字典与语言切换 ----------
        const bstT = (key, params) => {
          const dict = locale !== undefined ? locale.bind('better-session-title') : null
          if (dict !== null) {
            const text = dict(key, params)
            if (text !== key) return text
          }
          const zhText = BST_ZH[key]
          if (zhText === undefined) return key
          if (!params) return zhText
          return zhText.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m))
        }
        if (locale !== undefined) {
          try { locale.register('better-session-title', { zh: BST_ZH, en: BST_EN }) } catch { /* 已注册或服务受限 */ }
        }
        function useBstLocale() {
          const [, force] = React.useReducer((x) => x + 1, 0)
          React.useEffect(() => {
            const disposers = []
            if (locale && typeof locale.subscribe === 'function') {
              disposers.push(locale.subscribe(() => force()))
            }
            return () => { for (const d of disposers) { try { d() } catch { /* ignore */ } } }
          }, [])
          return bstT
        }

        // ---------- 原生侧栏行内相对时间（tree.ts relativeTime + locales） ----------
        function fmtRel(ms) {
          if (typeof ms !== 'number' || Number.isNaN(ms)) return ''
          const diff = Math.max(0, Date.now() - ms)
          const MIN = 60000, HOUR = 3600000, DAY = 86400000
          if (diff < MIN) return bstT('rel.justNow')
          if (diff < HOUR) return bstT('rel.minutes', { n: Math.floor(diff / MIN) })
          if (diff < DAY) return bstT('rel.hours', { n: Math.floor(diff / HOUR) })
          if (diff < 30 * DAY) return bstT('rel.days', { n: Math.floor(diff / DAY) })
          if (diff < 365 * DAY) return bstT('rel.months', { n: Math.floor(diff / (30 * DAY)) })
          return bstT('rel.years', { n: Math.floor(diff / (365 * DAY)) })
        }

        // 原生 recentWorkspace(workspaces, sessions) 等价实现（0.2.0-rc.2 已移除快照字段
        // recentWorkspaceId）：取「最近更新会话」最大的工作区；无会话的工作区回落 createdAt。
        function bstRecentWorkspaceId(items, byId) {
          let selected
          let selectedTime = -Infinity
          for (const w of items) {
            let latest = -Infinity
            for (const id of w.sessionIds) {
              const s = byId[id]
              if (s !== undefined && typeof s.updatedAt === 'number') latest = Math.max(latest, s.updatedAt)
            }
            if (latest === -Infinity) latest = Date.parse(w.createdAt) || 0
            if (selected === undefined || latest > selectedTime) { selected = w.workspaceId; selectedTime = latest }
          }
          return selected
        }

        // 会话链（复刻 0.2.0-rc.2 原生 deriveAncestry）：
        //   普通会话 → [自己]；子智能体会话 → [根祖先, …, 自己]（沿 parentId 上溯到非 subagent 为止）。
        // 根祖先用于判定「当前工作区」——子智能体会话不一定出现在任何工作区的 sessionIds 里。
        function bstSessionChain(byId, id) {
          const chain = []
          const seen = new Set()
          let cursor = id
          while (cursor !== undefined) {
            if (seen.has(cursor)) break
            seen.add(cursor)
            const s = byId[cursor]
            if (s === undefined) break
            chain.unshift({
              id: s.id,
              title: s.displayTitle || s.id,
              subagent: s.origin === 'subagent',
            })
            if (s.origin !== 'subagent') break
            cursor = s.parentId
          }
          return chain
        }

        // ---------- 自绘下拉列表（样式逐值复刻原生 Menu.module.css） ----------
        // items: [{ id, icon?, label, meta?, selected?, disabled?, actions? }]（actions = 更多菜单项）
        // actions: [{ id, label, icon?, danger?, action }]
        function BstList({ open, anchorEl, items, onSelect, onClose, onMore, onEscape }) {
          const [pos, setPos] = React.useState(null)
          const listRef = React.useRef(null)
          // onClose 走 ref：调用方每次渲染传新箭头函数，但监听器只在 open/anchorEl
          // 变化时重绑，避免每渲染一次就 remove/addEventListener 一次。
          const onCloseRef = React.useRef(onClose)
          onCloseRef.current = onClose
          // Esc 与“点击外部”区分开：Esc 是键盘取消，关闭后要归还焦点；
          // 外部点击归还焦点会把焦点从用户刚点的位置抢走。
          const onEscapeRef = React.useRef(onEscape)
          onEscapeRef.current = onEscape
          // 定位：锚定面包屑按钮下方，视口边缘避让（12px 边距）
          React.useLayoutEffect(() => {
            if (!open || !anchorEl) { setPos(null); return }
            const r = anchorEl.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            const MARGIN = 12
            const el = listRef.current
            const lw = el ? el.offsetWidth : 0
            const lh = el ? el.offsetHeight : 0
            // 每次打开都回到列表顶部：列表是滚动容器（max-height + overflow-y），
            // 一旦残留非 0 的 scrollTop，第一行（「新建工作区」/「新建会话」动作行）
            // 就会被滚出可视区 —— 表现为「下拉里缺少新建工作区」。
            if (el && el.scrollTop !== 0) el.scrollTop = 0
            let x = r.left
            let y = r.bottom + 4
            // 底部空间不足时向上展开
            if (y + lh > vh - MARGIN && r.top - lh - 4 > MARGIN) y = r.top - lh - 4
            if (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN)
            if (lh > 0) y = Math.min(Math.max(y, MARGIN), vh - lh - MARGIN)
            setPos({ left: x, top: y })
          }, [open, anchorEl])
          // 关闭：点击列表外 / Escape
          React.useEffect(() => {
            if (!open) return
            function onClick(e) {
              // 列表内、锚按钮上不关闭（锚按钮由自身的 click 做 toggle）
              if (listRef.current && listRef.current.contains(e.target)) return
              if (anchorEl && anchorEl.contains(e.target)) return
              onCloseRef.current()
            }
            function onKeyDown(e) {
              if (e.key !== 'Escape') return
              if (typeof onEscapeRef.current === 'function') onEscapeRef.current()
              else onCloseRef.current()
            }
            // 外部关闭必须监听 click 而非 pointerdown/mousedown：pointerdown/
            // mousedown 先于 click 派发，若此时关闭列表（卸载），行内按钮或
            // 悬浮菜单项的 click 将永远丢失——实测点击更多菜单项时列表被提前
            // 卸载、更多菜单随之关闭、重命名按钮消失，onSelect 不执行，
            // 对话框永不弹出。click 派发时目标元素必然还活着：行/菜单项的
            // onClick 先执行，其 stopPropagation 阻止 click 冒泡到 document
            // （悬浮菜单项不误关列表），未阻止的列表外点击才正常关闭。
            document.addEventListener('click', onClick)
            document.addEventListener('keydown', onKeyDown)
            return () => {
              document.removeEventListener('click', onClick)
              document.removeEventListener('keydown', onKeyDown)
            }
          }, [open, anchorEl])
          if (!open || !pos) return null
          const listEl = React.createElement('div', {
            ref: listRef, className: 'bst-list', style: pos, role: 'menu',
          },
            items.map((it, idx) => it.separator
              ? React.createElement('div', { key: 'sep' + idx, className: 'bst-list-sep', role: 'separator' })
              : React.createElement('button', {
                  key: it.id, type: 'button', role: 'menuitem', className: 'bst-item' + (it.selected ? ' bst-item-selected' : ''),
                  disabled: it.disabled, onClick: () => onSelect(it.id),
                },
                  it.icon ? React.createElement('span', { className: 'bst-item-icon' }, it.icon) : null,
                  React.createElement('span', { className: 'bst-item-main' },
                    React.createElement('span', { className: 'bst-item-title' }, it.label),
                    it.meta ? React.createElement('span', { className: 'bst-item-meta' }, it.meta) : null,
                  ),
                  it.actions && it.actions.length > 0
                    ? React.createElement('span', {
                        role: 'button', tabIndex: -1, className: 'bst-item-more',
                        title: bstT('menu.more'), 'aria-label': bstT('menu.more'),
                        // stopPropagation：阻止 click 冒泡到行按钮（避免触发行切换）
                        onClick: (e) => { e.stopPropagation(); onMore(e.currentTarget.getBoundingClientRect(), it.actions) },
                      }, React.createElement(IconEllipsisOutlineRegular, null))
                    : null,
                ),
            ),
          )
          // portal 到 body：脱离顶栏槽位的层叠/裁剪上下文（原生 Menu 同样这么做）
          return createPortal === null ? listEl : createPortal(listEl, document.body)
        }

        // ---------- 顶栏面包屑（代替原生会话标题） ----------
        function WorkspaceTitleBreadcrumb(props) {
          useBstLocale()
          const { sessionId, useSessions } = props
          const items = props.useWorkspaces((list) => list.items)
          const archived = props.useWorkspaces((list) => list.archivedSessionIds)
          // 当前工作区（快照已无 recentWorkspaceId，回落值本地计算，见 bstRecentWorkspaceId）
          const byId = useSessions((list) => list.byId)
          // 「更多」菜单的快捷键提示：与原生会话菜单同源（session.rename / fork / archive）。
          // hook 必须在组件顶层调用（不能放进 map），三个 id 各取一次、下面逐行复用。
          const scRename = useShortcut('session.rename')
          const scFork = useShortcut('session.fork')
          const scArchive = useShortcut('session.archive')
          const [wsOpen, setWsOpen] = React.useState(false)
          const [ssOpen, setSsOpen] = React.useState(false)
          const [sbOpen, setSbOpen] = React.useState(false)
          const wsAnchorRef = React.useRef(null)
          const ssAnchorRef = React.useRef(null)
          // 独立插件：没有外部开关，面包屑始终渲染（曾经的父插件设置桥接已移除）。
          // 自适应图标态：面包屑**作为一个整体**判定，且只在「真的放不下 / 被挤到读不出」时才换图标。
          // 判据是**可用宽度**（从我们左边缘到顶栏右边缘、减掉右侧所有兄弟）：
          //   ≥ crumbNeed（按当前级数推导，两级=285）且 chip 还有 full 档在抢 → 文本态；
          //   chip 全部退到 count 后 < crumbNeed（或 chip 连 count 都被挤爆）→ 整条收成图标；
          //   展开要 ≥ crumbNeed + CRUMB_TEXT_ADD(136) —— 标题回来会重新占掉这块，回差给足才不会翻。
          // 「整体」是刻意的：顶栏只出现「全文本」或「全图标」两态，不会出现一级图标一级文本的碎片；
          // 代价是长标题在窄窗下会连带整条收起，这也比留半截字更整齐。
          // **不要**用 +180px 之类的 header 宽度滞回：折叠后自己只剩 112px、flex-grow 又是 0，
          // 让出来的空间不会自动还回来，「记住折叠时的 header 宽度」会让折叠态永远解不开
          //（0.2.1 实测：窗口回到 808px 仍是 el=112 fold）。展开改用「折叠态实测的可用宽度」判，
          // 那条不受自己宽度的影响，所以解得开。
          const [iconic, setIconic] = React.useState('')
          // 标题态（窄屏「会话标题」）单独一个 state：渲染层要据此决定父级用哪枚图标
          // （压缩态用原生上下箭头，而不是会话字形）。
          const [titleState, setTitleState] = React.useState(false)
          // 原生 chip（N 个子智能体 / N 个后台任务）：**两个相互独立的个体**，各自折叠、各自滞回，
          // 不像面包屑那样作为一个整体一起变。它们由别的插件渲染，我们拿不到 ref，唯一稳定的语义锚点
          // 是 aria-label（官方类名是哈希的、会随版本变）。于是：
          //   · 探测：在面包屑所在的那一行（header，退化为父节点）里按 aria-label 关键字找按钮，排除自己的；
          //   · 落状态：**直接写到按钮自己的 data-bst-chip / data-bst-chip-mode 上**，样式与档位都由它驱动。
          // 为什么不写成 `<html>` 类 + `header button[aria-label*="…"]` 那样的选择器：顶栏的 DOM 结构
          // 随版本变（0.2.1-rc.2 就换过一次锚点），祖先选择器一旦失配就静默失效；而 data-* 是 React
          // 不会清掉的属性，写上去就一定生效，也便于现场排查（看按钮有没有这个属性即可）。
          const ref = React.useRef(null)
          // 智能体团队的成员数：渲染期算、测量 effect 里用（effect 只挂载一次，直接读局部变量会拿到初值）
          const teamCountRef = React.useRef('')
          // 智能体团队有没有成员在跑：同上，渲染期算、effect 里读
          const teamBusyRef = React.useRef(false)
          // 用 layout effect：首次测量发生在绘制前，于是不会先闪一下文本再变图标。
          React.useLayoutEffect(() => {
            const el = ref.current
            if (!el) return
            // 锚点：优先真正的 <header>；否则往上找到第一个**有盒子**的祖先。必须跳过
            // display:contents 包裹层 —— 它没有盒子、clientWidth 恒为 0，会让下面那句
            // `if (header.clientWidth === 0) return` 每次都早退，整个测量（打标签、压缩阶梯、
            // 折叠）静默不执行，连 report() 都不会打。这正是 OCR 评审判定 high 的那条。
            const firstBoxed = (node) => {
              let n = node
              while (n !== null && getComputedStyle(n).display === 'contents') n = n.parentElement
              return n
            }
            // closest('header') 的结果同样要过 firstBoxed：真实 <header> 也可能是 display:contents
            // （让子项参与父级 grid 的常见写法），那样 clientWidth 依旧是 0。
            const header = firstBoxed(el.closest('header')) || firstBoxed(el.parentElement) || el
            const group = { on: false } // 只记「面包屑是否收成图标」；回差交给 avail 的带宽
            // 标题态里父级是否已压缩成图标（跨趟记忆，滞回用）
            let parentIcon = false
            // 原生 chip 三态：icon（纯图标）/ count（图标 + 统计数）/ full（图标 + 完整文字），
            // 每块只记当前档位。**不再记「降档那一刻的顶栏宽度」做滞回**：那个基准只有降档时才更新，
            // 而可用宽度可以因为别的原因（别的 chip 消失、标题变短）恢复，于是 chip 会永远升不回来
            //（OCR 评审的中等问题）。回差交给「升完之后 avail 还够不够」这条实测判据。
            const chips = { sub: { mode: 'full' }, team: { mode: 'full' }, jobs: { mode: 'full' } }
            // aria-label 关键字（zh + en 各一份）：子智能体 chip 的两种形态
            //（「N 个子智能体」/「切换子智能体：…」）都含「子智能体」；后台任务同理。
            const CHIP_HINTS = {
              sub: ['子智能体', 'subagent'],
              team: ['智能体团队', 'agent team'],
              jobs: ['个后台任务', 'background job'],
            }
            // 有稳定锚点的优先用锚点（官方自绘节点上的 data-* 比文案稳）：智能体团队那枚
            // 官方就挂在 [data-team-action] 里，先按它找，找不到再退回文案匹配。
            const CHIP_SELECTORS = { team: '[data-team-action] button' }
            // 现场诊断：只在结论变化时打一行，落在宿主日志里（桌面端会把 renderer 的
            // console 写进 desktop-next.log），于是「到底找没找到 chip」不用开 DevTools 也能查。
            let lastReport = ''
            const report = (sig, msg) => {
              // 去重键是**结论**（sig），不是消息全文：消息里嵌了 w=/av=/el=/max= 这些实时宽度，
              // 拖窗口时每帧都不同，用全文去重等于每帧都打一行（OCR 指出的问题）。
              if (sig === lastReport) return
              lastReport = sig
              bstLog('[bst-chip] ' + msg)
            }
            // 找 chip：先在本行（header）里按语义找，避开弹出层里的树项（那些也有「子智能体」字样）；
            // 找不到时再退回「与面包屑同一水平行」的全局按钮 —— 桌面端顶栏的 DOM 容器不一定叫 header，
            // 一旦祖先锚点失配，只按 header 找会静默找不到（这正是它一直不生效的原因）。
            //
            // **缓存 + 脏标记**：探测结果按 key 记住，每轮只校验它还连着、aria-label 还匹配；
            // 本行子树有任何 childList 变化就置脏、下一轮重扫。原来每轮都全文档 scan 一遍
            // （document.querySelectorAll('button[aria-label]')），而「今天没有子智能体 / 后台任务」
            // 正是常态 —— 于是每秒 6 次全文档扫描叠加 getComputedStyle/getBoundingClientRect，
            // 持续强制回流（OCR 两轮都点到的性能问题）。
            const chipCache = new Map()
            let chipScanDirty = true
            const ariaMatches = (btn, hints) => {
              const label = btn.getAttribute('aria-label') || ''
              const lower = label.toLowerCase()
              return hints.some((k) => label.includes(k) || lower.includes(k.toLowerCase()))
            }
            const scanChip = (hints, prefer) => {
              if (prefer !== undefined) {
                const hit = header.querySelector(prefer)
                if (hit !== null) return hit
              }
              const match = (b) => {
                if (b.classList.contains('bst-crumb-btn')) return false
                return ariaMatches(b, hints)
              }
              const inRow = Array.from(header.querySelectorAll('button[aria-label]')).filter(match)
              if (inRow.length > 0) return inRow[0]
              const mine = el.getBoundingClientRect()
              const mid = (mine.top + mine.bottom) / 2
              return Array.from(document.querySelectorAll('button[aria-label]'))
                .filter(match)
                .find((b) => {
                  const box = b.getBoundingClientRect()
                  return box.height > 0 && Math.abs((box.top + box.bottom) / 2 - mid) < 24
                }) || null
            }
            const findChip = (key, hints, prefer) => {
              if (chipScanDirty !== true) {
                const cached = chipCache.get(key)
                // 脏标记没被置起时：命中就校验后复用；**上次没找到就直接返回 null** ——
                // 否则「今天没有子智能体 / 后台任务」这个常态会每轮全文档扫一遍，缓存等于白加。
                if (cached === undefined) return null
                if (cached.isConnected && ariaMatches(cached, hints)) return cached
              }
              const hit = scanChip(hints, prefer)
              if (hit === null) chipCache.delete(key)
              else chipCache.set(key, hit)
              return hit
            }
            // 一次性结构探针：把「我们在哪、周围是谁、各自多宽」打一行到宿主日志
            //（桌面端会把 renderer 的 console 落盘，见 ~/.dsh/logs/desktop-next*.jsonl）。
            // 顶栏是别人的 DOM：不先看清容器链和兄弟，就只能靠猜 —— 而这一步已经猜错过两次。
            let dumped = false
            const dumpOnce = () => {
              if (dumped) return
              // 结构探针本身要沿着祖先链做十几次 getBoundingClientRect / getComputedStyle ——
              // 日志关着的时候这些测量全是白做，直接不跑。
              // 先判开关再落 dumped：调试开关可以随时在控制台打开，那时本趟还能补打出来。
              if (bstDebug() !== true) return
              dumped = true
              try {
                const brief = (n) => {
                  const cls = typeof n.className === 'string' && n.className !== ''
                    ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
                  const cs = getComputedStyle(n)
                  const r = n.getBoundingClientRect()
                  return n.tagName.toLowerCase() + cls + '(' + Math.round(r.width)
                    + '|' + cs.display + ',' + cs.flexBasis + ',' + cs.flexGrow + ',' + cs.flexShrink
                    + ',minw=' + cs.minWidth + ')'
                }
                // 每层的孩子也打出来：光看「我们这一层多宽」不够，真正的问题是
                // 「谁把父容器的宽度吃掉了」，只有孩子清单能回答。
                const kidsOf = (n) => Array.from(n.children).slice(0, 8).map((c) => {
                  const cls = typeof c.className === 'string' && c.className !== ''
                    ? '.' + c.className.trim().split(/\s+/)[0] : ''
                  const r = c.getBoundingClientRect()
                  const cs = getComputedStyle(c)
                  return c.tagName.toLowerCase() + cls + '(' + Math.round(r.width) + '|' + cs.display + ')'
                }).join(',')
                const chain = []
                let node = el
                while (node !== null) {
                  chain.push(brief(node) + '[' + kidsOf(node) + ']')
                  if (node === header) break
                  node = node.parentElement
                }
                bstLog('[bst-dom] ' + chain.join(' < '))
              } catch { /* ignore */ }
            }
            // 设置变化 → 置脏重算。由关到开时把 dumped 复位，结构探针才能补打一次。
            // 回调挂在 bstSettings 上而不是订阅设置：设置服务可能在组件之前/之后就绪，两条路都通。
            const onSettings = () => { dumped = false; markDirty() }
            bstSettings.onChange = onSettings
            // 我们真正参与布局的那条 flex 行：跳过 display:contents 的包裹层（槽位系统会给每个
            // occupant 套一层，等于不存在），第一个正常显示的祖先就是它。
            const frameOf = () => {
              let node = el
              while (node !== null) {
                const parent = node.parentElement
                if (parent === null) return null
                if (getComputedStyle(parent).display !== 'contents') return parent
                node = parent
              }
              return null
            }
            const frameEl = frameOf()
            // 这条行默认**不长大**（flex: 0 1 auto），而它左边还留着一大块原本给原生标题的空位：
            // 实测 [bst-dom]，1427px 的顶栏里 titleCluster=1217，但 headerActions 只有 595 ——
            // 六百多 px 一直空着，我们和几个 chip 只能在 595 里互相挤（标题截断、别人仓促换行）。
            // 让它吃下这块空位，比在外面加 max-width/百分比去猜要稳得多；卸载时恢复原值。
            const framePrevGrow = frameEl !== null ? frameEl.style.flexGrow : ''
            if (frameEl !== null && frameEl !== header) frameEl.style.flexGrow = '1'
            // ---- 调度：事件驱动 + 每帧最多一次 ----
            // 曾经是 300ms 定时全量测量，那是个重锤：一次 update() 里有几十次「读布局」，
            // 而流式输出期间页面布局一直是脏的 —— 每次读都强制整页重排，等于把浏览器本来
            // 能合并的渲染工作打散成几十次同步重排，正在跑的会话界面因此卡到不可用。
            // 更糟的是 `new ResizeObserver(update)` 的回调里又写了会改变布局的样式
            //（--bst-crumb-max）——观测同一元素、又在回调里改它的布局，自己触发自己，
            // 日志里那 102 条 "ResizeObserver loop completed with undelivered notifications"
            // 就是它的签名。
            // 现在：RO / MO / resize 只「置脏 + 排一帧」，真正的测量在 rAF 里跑，且只在脏时跑。
            // 空闲时零成本；流式期间头部不变就一次都不量（rAF 回调本身也不触发重排）。
            let dirty = true
            let running = false
            let rafId = null
            const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
              ? performance.now() : Date.now())
            let slowAt = 0
            const schedule = () => {
              if (rafId !== null) return
              rafId = requestAnimationFrame(() => {
                rafId = null
                // 后台标签页不测量：那里的 rAF 本就被节流，量出来的宽度也不可信
                if (document.hidden === true) { dirty = true; return }
                update()
              })
            }
            const markDirty = () => { dirty = true; schedule() }
            const update = () => {
              // 重入保护：测量过程中我们自己的插入 / setIconic 引起的重渲染会再次置脏，
              // 这里只记账不嵌套执行 —— 否则就是同步递归。
              if (running === true) { dirty = true; return }
              if (dirty !== true) return
              dirty = false
              running = true
              const t0 = nowMs()
              try {
                if (header.clientWidth === 0) return
                dumpOnce()
                // 这一帧面包屑实际有几级（工作区 + 每一级会话）：阈值必须按级数推导，
                // 否则三级链下会高估可用宽度、把标题压成几个像素还不收起。
                const crumbNeed = Math.max(2, el.querySelectorAll('.bst-crumb-btn').length)
                  * CRUMB_LEVEL_COST + CRUMB_SEP_COST
                // ---- 「标题优先」的判据 ----
                // ① 顶栏溢出：内容画到 header 外框之外。
                // ② 标题没有可用空间：**可用宽度** < crumbNeed（按当前面包屑级数推导）。
                //    为什么不能只看「顶栏有没有溢出」：本插件那几层容器是 flex-shrink:1
                //    （0.2.1-rc.2 起为了不被窗口边缘裁掉而允许收缩），其它按钮则是 flex:0 0 auto ——
                //    宽度不够时先被牺牲的是标题，顶栏本身一点都不溢出。
                // 可用宽度必须在**我们所在的那条 flex 行**里量，不能拿整个 header 量：
                // header 是 grid，剩余宽度可能被别的列占着。实测（[bst-dom] 日志）：
                //   header=1427 → titleRow=1379 → titleCluster=1217 → headerActions=595
                // 也就是说 600 多 px 一直空在父容器里，而我们还被压在 595 里互相抢。
                // 所以这里量「父行右边缘 − 我们的左边缘 − 同一行里排在我们后面的兄弟」。
                // 兄弟的宽度：**不能直接量**。槽位系统会给 occupant 套一层 display:contents 的
                // 容器，它没有盒子，getBoundingClientRect().width 恒为 0 —— 实测这里漏掉的正是
                // 智能体团队 / 子智能体 / 后台任务三枚（av=571 而 el=152，[bst-chip] 日志），
                // 于是「可用宽度」被高估，chip 永远不退、标题压在 chip 底下。故递归到下层的
                // display:contents 里逐个累加。
                const widthOf = (n) => {
                  if (getComputedStyle(n).display !== 'contents') return n.getBoundingClientRect().width
                  let sum = 0
                  for (const child of n.children) sum += widthOf(child)
                  return sum
                }
                // 我们这一格在行里的**左边缘**。折叠成图标、甚至整条隐藏（窄屏=会话标题模式）时，
                // 我们自己的盒子会变窄，`display:none` 时 `getBoundingClientRect()` 干脆全返回 0 ——
                // 而 avail() 拿它当减数：一旦它跳变，就会「隐藏自己 → 可用宽度暴涨 → 又显示 → 再折叠」
                // 来回翻。所以只在**有盒子**时直接用实测值，隐藏时改为从行首累加前面的兄弟 ——
                // 那个值与我们是宽是窄、显示还是隐藏都无关。
                const slotLeft = (gap) => {
                  if (frameEl === null) return 0
                  if (el.clientWidth > 0) return el.getBoundingClientRect().left
                  const cs = getComputedStyle(frameEl)
                  let x = frameEl.getBoundingClientRect().left + (parseFloat(cs.paddingLeft) || 0)
                  let found = false
                  const walk = (parent) => {
                    for (const child of parent.children) {
                      if (child === el || child.contains(el)) {
                        // 槽位系统那层 display:contents 包裹层没有盒子，要继续下钻到我们这一格
                        if (child !== el && getComputedStyle(child).display === 'contents') { walk(child); return }
                        found = true
                        return
                      }
                      x += widthOf(child) + gap
                    }
                  }
                  walk(frameEl)
                  return found ? x : el.getBoundingClientRect().left
                }
                const avail = () => {
                  if (frameEl === null) return el.clientWidth
                  const box = frameEl.getBoundingClientRect()
                  const gap = parseFloat(getComputedStyle(frameEl).columnGap) || 0
                  const mineLeft = slotLeft(gap)
                  // 「排在我们后面的兄弟」不能按 frameEl.children 数：槽位系统把 occupant 都塞进
                  // 同一个 display:contents 包裹层里，那一层没有盒子、宽度恒为 0，而它里面除了我们
                  // 还有预设 / 费用 / 三枚 chip 共约 300px —— 实测（[bst-chip] 日志）av=571 而 el=152，
                  // 差的正是这段：av 被高估，chip 永远判「放得下」，标题就被压到 chip 底下。
                  // 改为从 el 逐层往上走到 frameEl，每层累加「之后的兄弟」（contents 层递归下去）。
                  let used = 0
                  let count = 0
                  let node = el
                  while (node !== null && node !== frameEl) {
                    for (let sib = node.nextElementSibling; sib !== null; sib = sib.nextElementSibling) {
                      used += widthOf(sib)
                      count += 1
                    }
                    node = node.parentElement
                  }
                  const geo = box.right - mineLeft - used - gap * (count + 1)
                  // 兜底：我们自己的盒子已经被压到读不出字（< ICONIC_TEXT_FLOOR）时，任何几何推算
                  // 都不如这条实测硬 —— 实测 av=273 而 el=0（[bst-chip] 日志），此时必须判「没空间」。
                  // 折叠态（group.on）**不能**用这条兜底：图标态盒子本来就窄（单级 ≈53px），
                  // 会把 avail 钉死在盒子宽度上，而展开门槛是 crumbNeed + 136 —— 于是永远解不开，
                  // 只有刷新才能恢复（第四轮 OCR 指出的中等问题）。
                  return !group.on && el.clientWidth < ICONIC_TEXT_FLOOR
                    ? Math.min(geo, el.clientWidth) : geo
                }
                // 只看**我们所在的那条 flex 行**（frameEl）有没有溢出。早先是整个 header 一起看，
                // 于是别的插件一个常驻溢出（绝对定位的 popover 锚点、带负 margin 的子项）就会被
                // 当成「我们没空间」—— 三枚 chip 会被永久钉在 icon 档（OCR 指出的中等问题）。
                // 行本身就是 grid 的一列，行内溢出才是我们该负责的那种「放不下」。
                const overflow = () => {
                  const row = frameEl !== null ? frameEl : header
                  if (row.scrollWidth > row.clientWidth + 1) return true
                  const box = row.getBoundingClientRect()
                  for (const child of row.children) {
                    const r = child.getBoundingClientRect()
                    if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) return true
                  }
                  return false
                }
                // （原来的 textCramped() 兜底已删：它判的是「标题被 max-width 裁掉」，而压缩档本身
                //   就是故意截短标题，用它当降档判据会把刚压缩出来的空间又立刻交回去。现在降档只看
                //   avail()，缺空间的第一手证据是上面 avail() 里的 el<ICONIC_TEXT_FLOOR 兜底。）
                const fits = (c, mode) => {
                  const prev = c.btn.dataset.bstChipMode
                  c.btn.dataset.bstChipMode = mode
                  const ok = c.btn.scrollWidth <= c.btn.clientWidth + 1
                  c.btn.dataset.bstChipMode = prev === undefined ? c.st.mode : prev
                  return ok
                }
                // ---- 原生 chip：三态，两块各自独立 ----
                //   full  图标 + 完整文字（「3 个子智能体」）
                //   count 图标 + 统计数（「(3)」）
                //   icon  纯图标
                // 先把每个 chip 摆到它记住的档位；**可用宽度**不足（标题放不下）或顶栏溢出时
                // 逐格退让（谁档位高先退谁；同档位时按 CHIP_KEYS 的顺序：子智能体 → 智能体团队 →
                // 后台任务，因为面包屑里已含子智能体层级信息、团队次之、任务计数最不可替代）；
                // 升档只看「升完之后可用宽度还够不够」（下面实测），不看顶栏宽度。
                const found = []
                const chipState = []
                for (const key of CHIP_KEYS) {
                  const st = chips[key]
                  const btn = findChip(key, CHIP_HINTS[key], CHIP_SELECTORS[key])
                  if (btn === null) { found.push(key + '=missing'); continue }
                  if (btn.dataset.bstChip !== key) btn.dataset.bstChip = key
                  // 统计数只认「以数字开头」的 aria-label（「3 个子智能体」/「3 subagents」）：
                  // 切换器形态是「切换子智能体：{标题}」，标题里常带数字（「第3轮优化」），
                  // 若取「首个数字」会把标题里的数字当成统计数，显示出无意义的「(3)」——
                  // 那种形态没有统计数，只该有两档（icon / full）。中间档显示成「（3）」——
                  // 带括号的统计数（与原生工作区列表里「DSH000 (23)」的写法一致），不是裸数字。
                  const digits = (btn.getAttribute('aria-label') || '').match(/^\s*(\d+)/)
                  // 智能体团队那枚原生不带数字，用我们自己算的成员数；其它 chip 仍读 aria-label
                  let count = ''
                  if (key === 'team') count = teamCountRef.current
                  else if (digits !== null) count = digits[1]
                  const countText = count === '' ? '' : '(' + count + ')'
                  let countEl = btn.querySelector('[data-bst-chip-count]')
                  if (count === '') {
                    // 没有统计数的形态（智能体团队、子智能体切换器）不要往别人的 DOM 里塞空 span
                    if (countEl !== null) countEl.remove()
                    countEl = null
                  } else if (countEl === null) {
                    countEl = document.createElement('span')
                    countEl.dataset.bstChipCount = ''
                    countEl.className = 'bst-chip-count'
                    btn.insertBefore(countEl, btn.firstChild)
                  }
                  if (countEl !== null && countEl.textContent !== countText) countEl.textContent = countText
                  // 给原生「纯文字」子节点打标记，count / icon 档只隐藏这些 —— 不用 :has(svg) 猜：
                  // 「运行中」的 StateDot 不是 svg，猜的话会被一起隐藏，收起后连"还在跑"都看不出来了
                  //（0.2.1 实测截图：count 档只剩「(1)」，圆点没了）。
                  let labelEl = null
                  for (const child of btn.children) {
                    if (child === countEl || child.hasAttribute('data-bst-chip-count')) continue
                    if (child.childElementCount === 0 && (child.textContent || '').trim() !== '') {
                      if (labelEl === null) labelEl = child
                      if (!child.hasAttribute('data-bst-chip-label')) child.dataset.bstChipLabel = ''
                    }
                  }
                  // 「运行中」的 StateDot 原生排在最前（官方是 [圆点][数字][箭头]）。我们的
                  // ::before 图标插在最前之后，圆点就夹在**图标和文字之间**，于是这枚 chip 的
                  // 「图标→文字」间距比另外两枚多出一个圆点（用户截图里后台任务那枚就是这样）。
                  // 这里把圆点标出来，样式里用 flex order 挪到文字之后、箭头之前：三枚都变成
                  // 「图标 · 文字 · (N) · 圆点 · 箭头」，节奏一致，圆点也仍然在（跑没跑一眼可辨）。
                  if (key !== 'team') {
                    for (const child of btn.children) {
                      if (child === labelEl || child === countEl) continue
                      if (child.hasAttribute('data-bst-chip-count') || child.hasAttribute('data-bst-chip-label')) continue
                      if ((child.textContent || '').trim() !== '') continue // 只要没有文字的（圆点/Slot）
                      if (child.tagName.toLowerCase() === 'svg' && child === btn.lastElementChild) continue // 箭头
                      if (!child.hasAttribute('data-bst-chip-dot')) child.dataset.bstChipDot = ''
                    }
                  }
                  // 团队那枚是按 [data-team-action] 定位的，不依赖 aria-label；但 count/icon 档会把
                  // 它的文字 display:none，万一官方哪天不再给 trigger 挂 aria-label，按钮就成了
                  // 「没有可访问名」的空壳。这里兜一手：有文字、没名字时补一个（只补一次）。
                  if (key === 'team' && labelEl !== null && btn.getAttribute('aria-label') === null) {
                    const text = (labelEl.textContent || '').trim()
                    if (text !== '') btn.setAttribute('aria-label', text)
                  }
                  // 三枚 chip 同构：**图标 · 文字 · (N) · 箭头**。
                  // sub/jobs 官方把「3 个子智能体 / 3 个后台任务」整串交给 i18n 拼出来，数字嵌在
                  // 文字里，于是「(3)」没处放。所以在**计数形态**（aria-label 以数字开头）下把文字
                  // 换成我们自己的短标签（chip.sub / chip.jobs），数字统一交给统计数 span；
                  // 切换器形态（「切换子智能体：{标题}」）保留官方标题原文 —— 那串是有信息量的。
                  // 只改那个文本节点本身（nodeValue），不重建节点：React 下次按新数字重渲染时
                  // 写回的仍是同一个节点，不会与我们失联。
                  if (labelEl !== null && key !== 'team' && digits !== null) {
                    const want = bstT('chip.' + key)
                    // 标记条件（childElementCount === 0）保证这里没有元素子节点，
                    // 所以 firstChild 必然是文本节点，直接改 nodeValue 即可（避免重建节点、
                    // 与 React 持有的那个文本节点失联）。
                    const node = labelEl.firstChild
                    if (node !== null && node.nodeType === 3 && node.nodeValue !== want) {
                      // **只在即将覆盖原生文案的这一瞬间**记快照 —— 卸载时按它还原。
                      // 不能不加条件地记：第一次改写之后 nodeValue 已经是我们自己的「子智能体」，
                      // 下一轮 300ms 的 update 就会把快照覆盖成我们这句，原生文案（「3 个子智能体」）
                      // 永久丢失，卸载时还原出来的还是我们的文案、chip 从此没有计数
                      //（第三轮 OCR 指出的 high 问题）。
                      labelEl.dataset.bstChipText = node.nodeValue
                      node.nodeValue = want
                    }
                  }
                  if (labelEl !== null && countEl !== null) {
                    // 统计数一律插在文字**之后**（团队那枚的文字是官方自带的「智能体团队」，
                    // 没有数字，插在之后同样读作「智能体团队 (3)」），三枚因此完全同构。
                    const anchor = labelEl.nextSibling
                    if (countEl.nextSibling !== anchor) btn.insertBefore(countEl, anchor)
                  }
                  // 「智能体团队」的运行中圆环：官方那枚没有这个节点，由我们补（另外两枚是官方
                  // 自己渲染的 StateDot）。放在按钮最末 —— 官方箭头是伪元素，排在所有子节点之后，
                  // 于是三枚的视觉顺序一致：图标 · 文字 · (N) · 圆环 · 箭头。
                  if (key === 'team') {
                    const busy = teamBusyRef.current === true
                    let spin = btn.querySelector('[data-bst-chip-spin]')
                    if (!busy) {
                      if (spin !== null) spin.remove()
                    } else if (spin === null) {
                      spin = document.createElement('span')
                      spin.dataset.bstChipSpin = ''
                      spin.className = 'bst-chip-spin'
                      spin.setAttribute('aria-hidden', 'true')
                      spin.innerHTML = STATE_SPINNER_SVG
                      btn.appendChild(spin)
                      // 与官方 spinner 同相：动画一起从文档时间零点起转
                      spin.addEventListener('animationstart', () => pinSpin(spin), true) // 不冒泡，走捕获
                      pinSpin(spin)
                    } else if (spin !== btn.lastChild) {
                      btn.appendChild(spin)
                    }
                  }
                  const order = count === '' ? ['icon', 'full'] : ['icon', 'count', 'full']
                  // 双重判定：个体判据 + 整体判据，任一判「放不下」就降档，两个都判「放得下」才升档。
                  //   · 个体判据（fits）：把目标档临时挂上去，看这个按钮自己是否被容器压窄
                  //     （scrollWidth > clientWidth）。容器会收缩时它反应最快，且能区分「是谁挤谁」。
                  //   · 整体判据（overflow）：整条顶栏是否溢出。容器不收缩时个体判据恒为「放得下」
                  //     —— 后台任务 chip 就是这种（它出现时那组容器不收缩），必须靠这一路兜住。
                  if (order.indexOf(st.mode) < 0) st.mode = order[order.length - 1]
                  btn.dataset.bstChipMode = st.mode
                  chipState.push({ key: key, st: st, btn: btn, order: order })
                }
                // 降档一：自己已经被容器压窄 —— **只降到还有文字的最低档**（count；没有 count 档的
                // 那枚就是 full），不再一路压到 icon。
                // 为什么：用户定的阶梯是「chip 交数字 → 标题让位 → chip 交统计数」，而这里原来能
                // 直接压到 icon，于是出现「展开侧边栏后子智能体直接变纯图标、标题却还在显示」——
                // 阶梯被跳过了。压不下去的事实记为 squeezed，交给下面的 ② 让标题先让位。
                let squeezed = false
                for (const c of chipState) {
                  let idx = c.order.indexOf(c.st.mode)
                  while (idx > 1 && !fits(c, c.order[idx])) {
                    idx -= 1
                    c.st.mode = c.order[idx]
                    c.btn.dataset.bstChipMode = c.st.mode
                  }
                  // order 的第 1 档就是「带文字的最低档」：['icon','count','full'] → count
                  if (c.order.length > 1 && !fits(c, c.order[1])) squeezed = true
                }
                // 降档二：按压缩阶梯逐格退让（见文件头部 CRUMB_* 常量处的说明）。
                // 判据是**可用宽度**，每退一格都要重新量 —— chip 变小会直接把空间还给标题。
                // 溢出也一并算：容器不可收缩时只有它能兜住。
                // 谁档位高先退谁；同档位时退 CHIP_KEYS 靠前的子智能体（面包屑里已含层级信息）。
                // 关键的一条：**只要还有 chip 在 full 档，就只退到 count 为止**；全部退到 count 后，
                // 阈值换成 CRUMB_ICON_NEED(160) —— 也就是 160..crumbNeed 这一段里 chip 停在 count、
                // 由标题让位，而不是一低于 crumbNeed 就把 chip 压成图标（用户要求「先压缩会话面包屑」）。
                // 另外：count 本身就放不下（squeezed）而标题还没让位时，这一轮也不许再往下压 ——
                // 先把机会交给 ②，标题收成图标之后如果还不够，下一轮再压到 icon。
                for (let guard = 0; guard < 8 && chipState.length > 0; guard += 1) {
                  const stillFull = chipState.some((c) => c.st.mode === 'full')
                  if (squeezed && !group.on && !stillFull) break
                  if (!overflow() && avail() >= (stillFull ? crumbNeed : CRUMB_ICON_NEED)) break
                  let victim = null
                  let victimRank = 0
                  for (const c of chipState) {
                    const rank = c.order.indexOf(c.st.mode) // 0=icon 1=count 2=full
                    if (rank > 0 && rank > victimRank) { victim = c; victimRank = rank }
                  }
                  if (victim === null) break
                  victim.st.mode = victim.order[victimRank - 1]
                  victim.btn.dataset.bstChipMode = victim.st.mode
                }
                // 升档：不溢出、升完仍给标题留够空间、自己放得下，三个都过才升。
                // 这里的「升完仍够」是在**已经挂上新档位**之后量的（下面先写 dataset 再判），
                // 所以它本身就是最准的回差：升上去会把标题挤到阈值以下时不允许升。
                // 阈值与降档一一对应：升到 full 要 avail ≥ crumbNeed，升到 count 只要
                // ≥ CRUMB_ICON_NEED —— 否则 160..crumbNeed 这段里 chip 会被误钉在图标档（降得下来、升不上去）。
                // **没有任何「顶栏宽度」门槛**（曾经有 120px、后来 24px）：那个基准只在降档时更新，
                // 而 avail 可以因为内容变化自己恢复，于是 chip 会永远卡在低档 —— 现在只认实测的 avail。
                for (const c of chipState) {
                  let idx = c.order.indexOf(c.st.mode)
                  while (idx < c.order.length - 1) {
                    const up = c.order[idx + 1]
                    const upNeed = up === 'full' ? crumbNeed : CRUMB_ICON_NEED
                    c.btn.dataset.bstChipMode = up
                    // 面包屑折叠期间不让升回 full：那等于把「chip 交文字」这一步撤销，
                    // 与阶梯①的先后顺序冲突；要展开由下面的 unfoldNeed 统一判定。
                    const ok = !overflow() && avail() >= upNeed && fits(c, up)
                      && !(group.on && up === 'full')
                    if (!ok) {
                      c.btn.dataset.bstChipMode = c.st.mode
                      break
                    }
                    idx += 1
                    c.st.mode = up
                  }
                  c.btn.dataset.bstChipMode = c.st.mode
                  found.push(c.key + '=' + c.st.mode)
                }
                // ---- 阶梯②：面包屑**整条收成图标**（三枚 chip 停在 count，统计数保留）----
                // 一个整体，不逐级各折各的：标题超长时照旧省略号，放不下就整条变图标。
                // 前提是**三枚 chip 已经全部退到 count**（chipsFull 为假）—— 用户的顺序是
                // 「chip 先交文字、再交标题、最后才交统计数」，所以这一步排在 chip 变图标之前。
                // 两条触发：① 可用宽度不够；② **chip 连 count 都被挤爆**（squeezed）——
                // ② 是实机反馈补的：展开侧边栏时容器会突然变窄，chip 被 flex 压扁，若只认 ①，
                // 会出现「子智能体先跳成纯图标、标题却还在显示」，把阶梯顺序整个跳过。
                // 展开门槛：可用宽度回够 CRUMB_TEXT_ADD 那么多才算真有余量（标题要重新占回这块）。
                // **判据只认 avail，不认 header.clientWidth**：avail 由内容决定，改名变短、chip 消失
                // 都会让它涨回来，于是折叠解得开；而顶栏宽度在内容变化时纹丝不动 —— 用它当基准，
                // 就会出现 OCR 指出的「折叠后只有改窗口大小才能恢复」。
                const chipsFull = chipState.some((c) => c.st.mode === 'full')
                const unfoldNeed = crumbNeed + CRUMB_TEXT_ADD
                // 注意：折叠期间「升回 full」被明确禁止，所以这里的 chipsFull 恒为假，
                // 不要再用它做短路条件（旧的 `chipsFull ||` 就是死条件，已删）。
                if (group.on) {
                  if (avail() >= unfoldNeed) group.on = false
                } else if (!chipsFull && (squeezed || avail() < crumbNeed)) {
                  group.on = true
                }
                // ---- 窄屏显示方式（设置项 narrowMode）----
                // 「窄」的判据复用上面刚算出的折叠点：面包屑文本态已经放不下（group.on）。
                // 选 'title' 时不收成图标，而是**整条隐藏、只留会话标题** ——
                // 三个图标能读出的信息不如一句原生标题。
                // 为什么不会来回翻：avail() 里不含我们自己的宽度（见 slotLeft 的说明），
                // 所以「隐藏自己」不会改变判据的输入，窗口变宽后仍按 unfoldNeed 正常解回。
                // 选 'crumb'（默认）时保持原阶梯：整条收成图标，两个下拉仍可点开。
                const titleMode = bstSettings.narrowMode === 'title' && group.on
                if (titleMode !== (el.dataset.bstNarrow === 'title')) {
                  // data-* 落状态：React 不会清掉它，样式与「是否隐藏原生标题」都按它判定
                  if (titleMode) el.dataset.bstNarrow = 'title'
                  else delete el.dataset.bstNarrow
                }
                // 标题上限跟着可用宽度走：窗口宽就把标题给足，而不是一律卡在 180px
                //（0.2.1 实测：1234px 窗口里会话标题仍被截成「更好的会话标题插…」，右边空着一截）。
                // 折叠态下文本是 display:none，这个值只作为展开预案，不影响当帧。
                const per = Math.max(CRUMB_MAX_MIN, Math.min(CRUMB_MAX_MAX, Math.floor((avail() - 40) / 2)))
                if (el.style.getPropertyValue('--bst-crumb-max') !== per + 'px') {
                  el.style.setProperty('--bst-crumb-max', per + 'px')
                }
                // ---- 标题态 · 父级压缩（子智能体会话的「父 / 当前」）----
                // 父级是次要信息：标题预算触底（per == 下限）时把它让成图标，宽度全给当前标题。
                // 只在这一态生效 —— 普通会话没有父级，宽屏面包屑的父级仍按阶梯收图标。
                // 判据是 per（由 avail 推出），而 avail 不含我们自己的宽度，因此「父级变图标」
                // 不会改变判据本身，不会自激；回差由 TITLE_PARENT_ICON_BACK 给。
                const parentKey = (() => {
                  const btns = el.querySelectorAll('.bst-crumb-btn')
                  // 第一枚是工作区级（data-bst-crumb="ws"），会话链从第二枚开始
                  const session = []
                  for (const b of btns) {
                    if (b.dataset.bstCrumb !== 'ws' && b.dataset.bstCrumb !== undefined) session.push(b.dataset.bstCrumb)
                  }
                  return session.length >= 2 ? session[session.length - 2] : ''
                })()
                if (titleMode !== true || parentKey === '') parentIcon = false
                else if (parentIcon === false && per <= TITLE_PARENT_ICON_AT) parentIcon = true
                else if (parentIcon === true && per >= TITLE_PARENT_ICON_BACK) parentIcon = false
                const keys = []
                if (group.on) {
                  for (const b of el.querySelectorAll('.bst-crumb-btn')) {
                    const key = b.dataset.bstCrumb
                    if (key !== undefined) keys.push(key)
                  }
                }
                // busy= 是「智能体团队有没有人在跑」（决定我们补的那枚圆环在不在），
                // 现场排查圆环亮不亮时看这一位即可，不用开 DevTools。
                const conclusion = (group.on ? 'fold' : 'text') + '|' + (squeezed ? 1 : 0) + '|'
                  + (titleMode ? 'title' : 'crumb') + '|'
                  + (teamBusyRef.current === true ? 1 : 0) + '|' + found.join(' ')
                // 日志关着就别拼这行消息：它自己还要再读两次布局（clientWidth / avail()）。
                if (bstDebug() === true) {
                  report(conclusion, 'w=' + header.clientWidth + ' av=' + Math.round(avail())
                    + ' need=' + crumbNeed + '/' + unfoldNeed
                    + ' el=' + el.clientWidth + ' max=' + per
                    + (group.on ? ' fold' : ' text')
                    + ' busy=' + (teamBusyRef.current === true ? 1 : 0)
                    + ' sq=' + (squeezed ? 1 : 0)
                    + ' mode=' + (titleMode ? 'title' : 'crumb')
                    + ' ' + found.join(' '))
                }
                chipScanDirty = false
                // 标题态只把「父级」交给图标态（压缩），当前标题必须保持文本 ——
                // 这一态的前提就是「整条面包屑文本已经放不下」，阶梯本来会把末级也收成图标，
                // 而用户要的是「会话标题」，不是一枚图标。
                const next = titleMode
                  ? (parentIcon === true ? parentKey : '')
                  : keys.join(' ')
                setIconic((prev) => (prev === next ? prev : next))
                setTitleState((prev) => (prev === titleMode ? prev : titleMode))
              } catch (error) {
                // 测量里的异常一律吞掉（顶栏不能因为一次测量失败就崩），但**探针开着时要留痕**：
                // 静默的 catch 会让「这一趟没打 report」变成无从解释的现象（实测踩过：resize 时
                // 抛错 → 只有 [bst-perf] 没有 [bst-chip]）。
                if (bstDebug() === true) {
                  // 只取栈的前若干字符：整栈对定位「哪一步抛的」已经够用，又不会把日志撑爆
                  const text = error !== null && error !== undefined && typeof error.stack === 'string'
                    ? String(error.stack).slice(0, 300)
                    : String(error)
                  bstLog('[bst-error] ' + text)
                }
              } finally {
                running = false
                // 慢一趟就留证据（限流 5s 一条）：下次再有人报「运行中卡顿」，
                // 日志里能直接判定是不是我们这一趟。
                const cost = nowMs() - t0
                if (cost > 60) {
                  const at = nowMs()
                  if (at - slowAt > 5000) {
                    slowAt = at
                    const w = header.clientWidth
                    bstLog('[bst-perf] pass ms=' + Math.round(cost) + ' w=' + w)
                  }
                }
                // 测量期间又有变化（我们自己的插入、React 重渲染）→ 再排一帧复核；幂等，最多多跑一趟
                if (dirty === true) schedule()
              }
            }
            update()
            // RO 回调只置脏，**绝不**写样式：观测某元素、又在它的回调里改它的布局 = 自触发回环。
            const ro = new ResizeObserver(markDirty)
            ro.observe(el)
            // 顶栏本身也要观测：有了 min-width 下限后，窗口变窄时先变的是 header 与「让出来的」
            // 其它按钮宽度，而我们自己的盒子可能停在 112px 不动 —— 只听 el 会漏掉这些变化。
            if (header !== el) ro.observe(header)
            // 我们所在的那条 flex 行同样决定 avail()：header 是 grid，列宽变化未必传达到 header 自身。
            if (frameEl !== null && frameEl !== header && frameEl !== el) ro.observe(frameEl)
            const onResize = () => markDirty()
            window.addEventListener('resize', onResize)
            // 从后台回到前台补一次（隐藏期间 rAF 不跑，dirty 被留着）
            const onVisible = () => { if (document.hidden !== true) markDirty() }
            document.addEventListener('visibilitychange', onVisible)
            // chip 的增删（有子智能体了 / 任务跑完了）才需要重新探测：置脏 + 立刻量一次。
            // 观察整个 header（不是只有我们那条行）：`scanChip` 支持把 chip 找在行外，
            // 只观察 frameEl 会让那种情况永远不重新探测；顺带盯 aria-label 变化
            //（切换器形态 → 计数形态是靠改属性表达的）。
            // 我们自己的插入/删除是幂等的，第二轮不会再有变化，不会成环。
            const chipObserver = typeof MutationObserver === 'function'
              ? new MutationObserver(() => { chipScanDirty = true; markDirty() })
              : null
            if (chipObserver !== null) {
              chipObserver.observe(header, {
                childList: true,
                subtree: true,
                // 统计数是从文字里读的（「3 个子智能体」），React 换数字走的是改文本节点
                //（characterData），只盯 childList 会漏掉「(9) → (10)」这类变化。
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-label'],
              })
            }
            // 兜底重扫：万一 chip 在 header 之外（document 兜底扫描那条路），它没有任何可观察的
            // 祖先，DOM 上也永远不会有变化 —— 每 5 秒重新置脏一次。
            // 另外元素「团队有没有人在跑 / 有几个成员」是渲染期算进 ref 的（不产生 DOM 变化），
            // 我们自己补的那枚圆环要跟着它出现消失，所以每秒对一次这两项；
            // 两者都没变、三枚 chip 也都找到了，就什么都不做（不读布局、不重算）。
            let lastBusy = null
            let lastCount = null
            const rearmTimer = interval(() => {
              const busy = teamBusyRef.current === true
              const count = teamCountRef.current
              const missing = chipCache.size < CHIP_KEYS.length
              if (!missing && busy === lastBusy && count === lastCount) return
              lastBusy = busy
              lastCount = count
              chipScanDirty = true
              markDirty()
            }, 1000)
            return () => {
              ro.disconnect()
              if (chipObserver !== null) chipObserver.disconnect()
              window.removeEventListener('resize', onResize)
              document.removeEventListener('visibilitychange', onVisible)
              if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
              rearmTimer()
              // 设置回调摘掉（否则设置变化会去驱动一个已卸载的测量）
              if (bstSettings.onChange === onSettings) bstSettings.onChange = null
              // 窄屏标记必须撤掉：留着的话原生标题的隐藏规则会一直不生效，退出插件状态不干净
              if (el.dataset.bstNarrow !== undefined) delete el.dataset.bstNarrow
              // 卸载时把父行的 flex-grow 还给原生（我们只是借用它的空闲宽度）
              if (frameEl !== null && frameEl !== header) frameEl.style.flexGrow = framePrevGrow
              // 把写进官方 DOM 的东西**全部撤回**：样式标签由 ctx.effect 统一移除，但如果只做那一步，
              // chip 会停在我们最后一次摆的档位（label 被 display:none 隐藏、统计数/圆环还在），
              // 而再没有人更新它 —— OCR 评审指出这在插件卸载/热更新后会留下一排「坏掉的 chip」。
              try {
                for (const btn of document.querySelectorAll('button[data-bst-chip]')) {
                  for (const span of btn.querySelectorAll('[data-bst-chip-count],[data-bst-chip-spin]')) span.remove()
                  for (const label of btn.querySelectorAll('[data-bst-chip-label]')) {
                    const original = label.dataset ? label.dataset.bstChipText : undefined
                    if (original !== undefined && label.firstChild !== null
                      && label.firstChild.nodeType === 3) {
                      label.firstChild.nodeValue = original
                    }
                  }
                  const own = ['bstChip', 'bstChipMode', 'bstChipDot']
                  for (const name of own) delete btn.dataset[name]
                }
                for (const node of document.querySelectorAll('[data-bst-chip-label]')) {
                  if (node.dataset) {
                    delete node.dataset.bstChipLabel
                    delete node.dataset.bstChipText
                  }
                }
                // 圆点标记写在 chip 的**子节点**上，不在按钮上，得单独清（OCR 指出的漏项）。
                for (const node of document.querySelectorAll('[data-bst-chip-dot]')) {
                  node.removeAttribute('data-bst-chip-dot')
                }
              } catch { /* DOM 已被卸载时忽略 */ }
            }
          }, [])
          const iconicSet = new Set(iconic === '' ? [] : iconic.split(' '))
          // 注意：这里不能有全局 mousedown「点击外部关闭」监听——
          // mousedown 先于 click 派发，会把列表先行卸载，行内 click 全部丢失。
          // 点击外部关闭已由 BstList 的 document click 监听负责（且排除了锚按钮）。
          // 会话链：普通会话只有自己；子智能体会话会多出父会话（可多级）。
          const chain = React.useMemo(() => bstSessionChain(byId, sessionId), [byId, sessionId])
          const chainRootId = chain.length > 0 ? chain[0].id : sessionId
          // 当前工作区按「链根」判定：普通会话下链根就是自己（与旧行为一致）；
          // 子智能体会话用根祖先去匹配，避免退回「最近工作区」这个无关结果。
          const currentWs = items.find((w) => w.sessionIds.includes(chainRootId))
            || items.find((w) => w.workspaceId === bstRecentWorkspaceId(items, byId))
            || null
          // 子代理会话的 displayTitle 是「首条提示词原文」（又长又不是标题），真正的短标题躺在
          // 它**父会话**的 subagentCatalog 投影里 —— 原生 switcher 用的正是 currentEntry.label。
          // 因此每一级子代理都从它自己父级的 catalog 取 label，取不到才回落 displayTitle。
          const projections = useSessions((list) => list.projectionsBySession)
          // 「智能体团队」chip 的统计数：官方那枚只有图标+文字，没有数字。我们补上成员数 ——
          // 数据同源（根会话的 agentTeam 投影），没有团队/投影未就绪时为空，chip 退回两态。
          // 用 ref 交给测量 effect（它只在挂载时建一次闭包，读不到后续渲染的局部变量）。
          const teamMembers = React.useMemo(() => {
            const proj = projections ? projections[chainRootId] : undefined
            const team = proj && proj.values ? proj.values.agentTeam : undefined
            return team && Array.isArray(team.members) ? team.members : null
          }, [projections, chainRootId])
          // **只有成员数 > 1 才显示统计数**：单人团队显示「(1)」是纯噪声（这是刻意的，
          // 不是「投影未就绪」的退化——那种情况 teamMembers 为 null）。圆环的判据不受它影响：
          // 一个人也可以是「在跑」，只是那种情况下团队圆环本来就排除掉自己，不会亮。
          const teamCount = teamMembers !== null && teamMembers.length > 1 ? String(teamMembers.length) : ''
          // 「智能体团队」的运行中指示：官方那枚 chip 没有，另外两枚（子智能体 / 后台任务）都有，
          // 为了让三枚显示效果一致，这里按官方面板自己的算法补一个：
          //   status = phase === 'active' ? (会话在跑 ? 'running' : 'inactive') : phase
          // 注意 phase==='active' 只代表「成员还活着」，真正的运行状态必须去会话上看 ——
          // 官方面板读的是 useSessionStatus().running，我们 inject 里没有那个 store，只能读摘要
          // 快照 byId[id].running（官方自己也是拿它做兜底），代价是状态变化滞后一个快照周期。
          // **排除「我们自己」**：当前会话，以及团队所属的链根会话（在子智能体会话里看顶栏时，
          // 链根才是这场对话的主体）。不排除的话，你每发一句话圆环就转，成了噪声。
          const teamBusy = React.useMemo(() => {
            if (teamMembers === null) return false
            for (const m of teamMembers) {
              if (m.id === sessionId || m.id === chainRootId) continue
              if (m.phase !== 'active') continue
              const s = byId[m.id]
              if (s !== undefined && s.running === true) return true
            }
            return false
          }, [teamMembers, byId, sessionId, chainRootId])
          // 这两个 ref 是「最新值」通道，给只挂载一次的测量 effect 用。
          // **不在渲染期写 ref**：并发渲染下一次被丢弃的渲染也会改到它（React 明令不行的写法）。
          // 代价是首次测量（本 effect 之前的那个 layout effect）读到的是初值，最多 300ms 后
          // 由测量循环纠正 —— 对「(N)」和圆环来说不可见。
          React.useLayoutEffect(() => {
            teamCountRef.current = teamCount
            teamBusyRef.current = teamBusy
          })
          const catalogOf = (parentId) => {
            const proj = projections ? projections[parentId] : undefined
            return proj && proj.values && Array.isArray(proj.values.subagentCatalog)
              ? proj.values.subagentCatalog : null
          }
          const chainLabeled = React.useMemo(() => chain.map((node, i) => {
            if (!node.subagent || i === 0) return node
            const catalog = catalogOf(chain[i - 1].id)
            const entry = catalog === null ? undefined : catalog.find((e) => e.id === node.id)
            return entry && entry.label ? { ...node, title: entry.label } : node
          }), [chain, projections])
          // 会话摘要缺失（启动竞态 / 会话不在快照里）时仍保留一格占位，避免整个会话段消失
          const crumbs = chainLabeled.length > 0 ? chainLabeled : [{ id: 'none', title: bstT('crumb.sessionNone'), subagent: false }]
          // ---------- 同级子代理切换器（对齐原生 CatalogDropdown 的 switcher 变体） ----------
          // 只在「当前会话是子智能体会话」时启用：末级面包屑改为切换器，
          // 列出父会话（链的倒数第二级）的直接子代理，当前项高亮。
          // 数据源优先用父会话的 subagentCatalog 投影（原生同源），未就绪时回退到 byId 里同 parentId 的子会话。
          const isSubagentSession = chain.length > 1
          const siblingParentId = isSubagentSession ? chain[chain.length - 2].id : undefined
          const siblings = React.useMemo(() => {
            if (siblingParentId === undefined) return []
            const catalog = catalogOf(siblingParentId)
            if (catalog !== null && catalog.length > 0) {
              return catalog.map((e) => ({ id: e.id, label: e.label || e.id }))
            }
            return Object.values(byId)
              .filter((s) => s !== undefined && s.origin === 'subagent' && s.parentId === siblingParentId)
              .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              .map((s) => ({ id: s.id, label: s.displayTitle || s.id }))
          }, [projections, byId, siblingParentId])
          const archivedSet = new Set(archived)
          const pinned = props.useWorkspaces((list) => list.pinnedSessionIds)
          const pinnedSet = new Set(pinned || [])
          const sessionVisible = (s) => s !== undefined
            && s.origin !== 'subagent'
            && !archivedSet.has(s.id)
            && (!s.blank || s.id === sessionId)
          // 排序对齐原生 orderByRecency + 置顶优先：置顶会话在前（保持置顶顺序），
          // 其余按 summary.updatedAt 降序、id 作确定性 tie-break（原生同款）。
          const sessionRows = currentWs
            ? currentWs.sessionIds
                .map((id) => byId[id])
                .filter(sessionVisible)
                .sort((a, b) => {
                  const pa = pinnedSet.has(a.id), pb = pinnedSet.has(b.id)
                  if (pa !== pb) return pa ? -1 : 1
                  if (pa && pb) {
                    const ia = (pinned || []).indexOf(a.id), ib = (pinned || []).indexOf(b.id)
                    if (ia !== ib) return ia - ib
                  }
                  const ta = a.updatedAt || 0, tb = b.updatedAt || 0
                  if (ta !== tb) return tb - ta
                  return a.id < b.id ? -1 : 1
                })
            : []
          const switchWorkspace = async (w) => {
            setWsOpen(false)
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              // 快路径：该工作区里最近更新的可见会话（切过去就能看到内容，与旧行为一致）
              const members = w.sessionIds
                .map((id) => byId[id])
                .filter(sessionVisible)
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              if (members.length > 0) {
                // 未连接过的工作区，openSession 可能直接失败 → 交给下面的原生路径
                try { uiWorkspace.openSession(members[0].id); return } catch { /* fall through */ }
              }
              // 原生路径：ui-workspace 的 startSession 走的就是 openWorkspace ——
              // 先 connectWorkspace（复用/新建空白会话）再打开，这是 0.2.0-rc.2 里
              // 「切换工作区」的正统入口（没有它，未连接工作区的会话打不开）。
              await uiWorkspace.openWorkspace(w.workspaceId)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          // ---------- 添加工作区：完全交给宿主（与原生实现对齐） ----------
          // 插件不再自绘「选择工作区目录」面板，也不再接管目录流槽。点「添加工作区」只做一件事：
          // 调宿主的 workspace.add，由宿主 compose 的那支 surface 决定交互 ——
          //   · native 后端（win32/darwin 本地、loopback、非 SSH）→ 官方 renderless 的
          //     dsh-client-ui-directory-picker-native，直接弹系统「选择文件夹」，没有中间面板；
          //   · browse 后端 → 官方应用内浏览面板。
          // 两者都与侧栏 + 的行为一致。只有宿主根本没有目录流（槽空）时才兜底用系统选择器；
          // 连系统选择器都没有（社区版网页版）就明确报错，不自绘面板、不降级成路径输入。
          const slotCount = (hole) => {
            try { return slots.entries(hole).length } catch { return 0 }
          }
          // 桌面窗口的 preload 桥（官方桌面与社区桌面都有）；普通浏览器里不存在。
          const desktopBridgePick = () => {
            const bridge = typeof window === 'undefined' ? undefined : window.__DSH_DIRECTORY_PICKER__
            if (!bridge || typeof bridge.pick !== 'function') return null
            return () => bridge.pick.call(bridge)
          }
          // 系统对话框是模态的：重复点击会再开一个，用 ref 挡。
          const pickerOpening = React.useRef(false)

          const createFromPath = async (path) => {
            // 服务缺失时**必须报出来**：静默 return 会让用户在系统对话框里选完目录之后
            // 「什么都不发生、也没有任何提示」（本文件其它动作统一走 fail()，这里对齐）。
            if (!workspaces || !uiWorkspace) {
              fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady'))
              return
            }
            const view = await workspaces.create({ path })
            const id = view && view.workspaceId
            // 少这一步就会「选完目录、界面上什么都不发生」—— 与本函数上方的约定一致，必须报。
            // `view && view.workspaceId` 在 create 返回 null/undefined 时给出的是 **null**，
            // 只判 undefined 会漏过去、把 null 塞进 openWorkspace（表现为“选完目录什么都没发生”）。
            if (id === undefined || id === null) {
              fail('dialog.pickerErrorTitle', bstT('dialog.serviceNotReady'))
              return
            }
            await uiWorkspace.openWorkspace(id)
          }
          const nativeAddWorkspace = () => {
            if (!shortcuts || typeof shortcuts.invoke !== 'function') return false
            // 槽里有 occupant 才有人接这个流程；空槽时原生命令自己 blocked（不弹任何东西）。
            if (slotCount('sidebar.workspaces.directoryFlow') === 0) return false
            // 再确认这条命令真的注册了：catalog 里有行才说明 ui-workspace 提供了 workspace.add。
            // catalog 为空/取不到时不据此否决 —— 那样只会让我们误判成「没有原生命令」。
            if (shortcutCatalog !== null) {
              let rows = null
              try { rows = shortcutCatalog.getSnapshot() } catch { rows = null }
              if (Array.isArray(rows) && rows.length > 0 && !rows.some((row) => row !== null && row !== undefined && row.id === 'workspace.add')) return false
            }
            try {
              // invoke 只在「有模态框且命令没声明 modals」时拦截；这里没有模态框。
              // 注意：命令 blocked（槽空 / directoryBusy）时 invoke **静默返回、不抛错**，
              // 所以调用方不能把它当作「UI 已经出现」，只能当「已把请求交给宿主」。
              shortcuts.invoke('workspace.add', { modal: null })
              return true
            } catch { return false }
          }
          const newWorkspace = async () => {
            setWsOpen(false)
            setWsError(null)
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            const slot = slotCount('sidebar.workspaces.directoryFlow')
            // ① 槽被占用：宿主自己有一套交互，交给它 —— 这就是原生「添加工作区」的全部实现。
            //    命令 blocked 时 invoke 静默返回，那属于「宿主没有可用交互」，继续往下兜底。
            if (slot > 0 && nativeAddWorkspace()) {
              bstLog('[bst-picker] add-workspace -> host flow (slot=' + slot + ')')
              return
            }
            // ② 槽空（极少见）：只借系统选择器，仍然不弹插件自己的面板。
            const bridge = desktopBridgePick()
            bstLog('[bst-picker] add-workspace fallback slot=' + slot + ' bridge=' + (bridge === null ? 'no' : 'yes'))
            if (bridge !== null) {
              if (pickerOpening.current) return
              pickerOpening.current = true
              let path
              try { path = await bridge() } catch (e) { pickerOpening.current = false; fail('dialog.pickerErrorTitle', e); return }
              pickerOpening.current = false
              if (path === undefined || path === null || path === '') return
              try { await createFromPath(path) } catch (e) { fail('dialog.pickerErrorTitle', e) }
              return
            }
            if (typeof uiWorkspace.pickDirectory === 'function') {
              if (pickerOpening.current) return
              let path
              let unsupported = false
              pickerOpening.current = true
              try { path = await uiWorkspace.pickDirectory() } catch { unsupported = true }
              pickerOpening.current = false
              if (!unsupported) {
                if (path === undefined || path === null || path === '') return
                try { await createFromPath(path) } catch (e) { fail('dialog.pickerErrorTitle', e) }
                return
              }
            }
            // ③ 服务不存在且没有桥（社区版网页版）：明确告知。
            fail('dialog.noPickerTitle', bstT('dialog.noPickerBody'))
          }
          const newSession = async () => {
            setSsOpen(false)
            if (!uiWorkspace || !currentWs) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              // 原生「新会话」= uiWorkspace.startSession(workspaceId) → openWorkspace（复用空白会话）
              await uiWorkspace.openWorkspace(currentWs.workspaceId)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }

          // ---------- 更多操作（ellipsis → 原生 Menu 弹出） + 对话框状态 ----------
          const [moreMenu, setMoreMenu] = React.useState(null)
          const moreRectRef = React.useRef(null)
          const closeMore = () => setMoreMenu(null)
          const openMore = (rect, actions) => {
            moreRectRef.current = rect
            // 悬浮期间下拉保持打开，用户仍能看到当前操作的是哪一行；
            // 关闭由原生 Menu 自身负责（外部点击 / Escape）或 onSelect 显式执行。
            setMoreMenu({ actions })
          }
          // getAnchorRect 必须引用稳定（原生 Menu 的 place useLayoutEffect 依赖它）
          const getMoreAnchorRect = React.useCallback(() => moreRectRef.current, [])
          const [wsRename, setWsRename] = React.useState(null)
          const [wsDelete, setWsDelete] = React.useState(null)
          const [ssRename, setSsRename] = React.useState(null)
          const [wsError, setWsError] = React.useState(null)
          // 统一的失败出口：`{ title, message }`。**不要**再写静默 `catch {}` / 早返回 ——
          // 服务未就绪或调用失败时的静默表现是
          // 「界面完美、点了完全没反应」，既无控制台线索也无界面线索，排查成本极高。
          const fail = (titleKey, e) => setWsError({
            title: bstT(titleKey),
            message: typeof e === 'string' ? e : ((e && e.message) || String(e)),
          })
          const wsRenameRef = React.useRef(null)
          const ssRenameRef = React.useRef(null)
          const openWsRename = (w) => { setWsRename({ id: w.workspaceId, currentTitle: w.title, draft: w.title, busy: false, error: null }); wsRenameRef.current = false }
          const openWsDelete = (w) => setWsDelete({ id: w.workspaceId, title: w.title, busy: false, error: null })
          const openSsRename = (s) => { setSsRename({ id: s.id, currentTitle: s.displayTitle, draft: s.displayTitle, busy: false, error: null }); ssRenameRef.current = false }
          const confirmWsRename = async () => {
            if (!workspaces || !wsRename) return
            const trimmed = wsRename.draft.trim()
            if (trimmed === '' || trimmed === wsRename.currentTitle) { setWsRename(null); return }
            setWsRename({ ...wsRename, busy: true, error: null })
            try {
              await workspaces.rename(wsRename.id, trimmed)
              setWsRename(null)
            } catch (e) {
              setWsRename({ ...wsRename, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          const confirmWsDelete = async () => {
            if (!workspaces || !wsDelete) return
            setWsDelete({ ...wsDelete, busy: true, error: null })
            try {
              await workspaces.delete(wsDelete.id)
              setWsDelete(null)
            } catch (e) {
              setWsDelete({ ...wsDelete, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          const confirmSsRename = async () => {
            if (!sessions || !ssRename) return
            const trimmed = ssRename.draft.trim()
            if (trimmed === '') return
            setSsRename({ ...ssRename, busy: true, error: null })
            try {
              // 0.2.0-rc.2 原生路径（对齐 ui-workspace 的 renameSession）：
              // sessions.using 取引用后走 reference.binding.session.rename，返回 {ok,error}
              const result = await sessions.using(
                ssRename.id,
                { source: 'workspaceOperation' },
                (reference) => reference.binding.session.rename(trimmed),
              )
              if (!result.ok) throw new Error((result.error && result.error.message) || 'rename failed')
              setSsRename(null)
            } catch (e) {
              setSsRename({ ...ssRename, busy: false, error: bstT('dialog.failed', { error: (e && e.message) || String(e) }) })
            }
          }
          const forkSession = async (s) => {
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              // 原生 forkSession：sessions.fork({sessionId, increaseTitle:true}) → 打开子会话
              const newId = await uiWorkspace.forkSession(s.id)
              uiWorkspace.openSession(newId)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          const archiveSession = async (s) => {
            setSsOpen(false)
            if (!workspaces) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try { await workspaces.archiveSession(s.id) } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          // 置顶 / 取消置顶：原生会话菜单同款 —— uiWorkspace.pinSession / unpinSession。
          const togglePin = async (s) => {
            if (!uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            try {
              if (pinnedSet.has(s.id)) await uiWorkspace.unpinSession(s.id)
              else await uiWorkspace.pinSession(s.id)
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          // 复制 Session ID：primitives 的 writeClipboard 不在本插件导入面内，
          // 用浏览器剪贴板 + 旧式 execCommand 兜底（桌面壳支持前者）。
          const copySessionId = async (s) => {
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(s.id)
                return
              }
              const area = document.createElement('textarea')
              area.value = s.id
              area.style.position = 'fixed'
              area.style.opacity = '0'
              document.body.appendChild(area)
              area.select()
              const ok = document.execCommand('copy')
              area.remove()
              if (!ok) throw new Error('copy failed')
            } catch (e) { fail('dialog.actionErrorTitle', e) }
          }
          const renameKeyDown = (refState, confirm) => (e) => {
            if (e.key === 'Enter' && refState.current !== true) {
              e.preventDefault()
              confirm()
            }
          }

          // ---------- 列表数据 ----------
          // 工作区重命名的重复名校验（footer 禁用与错误行共用一次计算）
          const wsRenameDup = wsRename !== null && wsRename.draft.trim() !== ''
            && wsRename.draft.trim() !== wsRename.currentTitle
            && items.some((w) => w.title === wsRename.draft.trim() && w.workspaceId !== wsRename.id)
          const wsListItems = [
            { id: 'add', label: bstT('crumb.addWorkspace'), icon: React.createElement(IconProjectAddOutlineRegular, { size: 16 }) },
            { separator: true },
            ...(items.length === 0
              ? [{ id: 'none', label: bstT('crumb.noWorkspaces'), disabled: true }]
              : items.map((w) => ({
                  id: w.workspaceId,
                  label: w.title,
                  // 行内不显示工作区图标（节省空间）；仅「新建工作区」动作行保留图标
                  // 会话数 = 原生 sessionVisible 过滤后的成员数（对齐 sessionCount: g.sessions.length）
                  meta: `(${w.sessionIds.filter((id) => sessionVisible(byId[id])).length})`,
                  selected: w.workspaceId === (currentWs && currentWs.workspaceId),
                  actions: [
                    { id: 'rename', label: bstT('crumb.rename'), icon: React.createElement(IconEditOutlineRegular, null), action: () => openWsRename(w) },
                    { id: 'remove', label: bstT('crumb.remove'), icon: React.createElement(IconTrashOutlineRegular, null), danger: true, action: () => openWsDelete(w) },
                  ],
                }))),
          ]
          const ssListItems = [
            { id: 'new', label: bstT('crumb.newSession'), icon: React.createElement(IconNewChatOutlineRegular, { size: 16 }) },
            { separator: true },
            ...(sessionRows.length === 0
              ? [{ id: 'none', label: bstT('crumb.noSessions'), disabled: true }]
              : sessionRows.map((s) => ({
                  id: s.id,
                  label: s.displayTitle,
                  // 行内不显示会话图标（节省空间）；仅「新建会话」动作行保留图标
                  // 会话更新时间（原生相对时间规则）
                  meta: s.updatedAt ? fmtRel(s.updatedAt) : '',
                  selected: s.id === sessionId,
                  // 顺序与原生会话菜单一致：置顶 → 重命名 → 分支 → 归档 → 复制 ID
                  actions: [
                    {
                      id: 'pin',
                      label: bstT(pinnedSet.has(s.id) ? 'crumb.unpin' : 'crumb.pin'),
                      icon: React.createElement(pinnedSet.has(s.id) ? IconPinFillRegular : IconPinOutlineRegular, null),
                      action: () => togglePin(s),
                    },
                    { id: 'rename', label: bstT('crumb.rename'), icon: React.createElement(IconEditOutlineRegular, null), shortcut: scRename, action: () => openSsRename(s) },
                    { id: 'fork', label: bstT('crumb.fork'), icon: React.createElement(IconBranchOutlineRegular, null), shortcut: scFork, action: () => forkSession(s) },
                    { id: 'archive', label: bstT('crumb.archive'), icon: React.createElement(IconArchiveOutlineRegular, { size: 16 }), shortcut: scArchive, action: () => archiveSession(s) },
                    { id: 'copyId', label: bstT('crumb.copySessionId'), icon: React.createElement(IconCopyOutlineRegular, { size: 16 }), action: () => copySessionId(s) },
                  ],
                }))),
          ]
          // 同级子代理行（仅子智能体会话使用）：当前项高亮；不挂行内操作（原生 switcher 行同样只有名称）
          const siblingItems = siblings.length === 0
            ? [{ id: 'none', label: bstT('crumb.noSiblings'), disabled: true }]
            : siblings.map((s) => ({ id: s.id, label: s.label, selected: s.id === sessionId }))
          // 工作区级的完整文案（title / aria-label / 文本共用一份，避免三处各写一遍）
          const wsTitle = (currentWs && currentWs.title) || bstT('crumb.workspaceNone')
          // 折叠（紧凑）模式下文本 display:none 会一并移出可访问名 —— 每个面包屑按钮都显式
          // 声明 aria-label，图标态仍有可读名字（原生 CatalogDropdown 同样做法）。
          // 每一级的图标：子智能体级用「文件夹 + 两条竖杠」的智能体字形（与顶栏子智能体
          // chip 同源），普通会话级用会话字形 —— 逐级都有图标是「折叠成图标」在任意链长下
          // 都不会变空的前提。
          // **必须显式传 size**：primitives 的默认 size 是逐图标定的，不是统一 16 ——
          //   IconFolderCloseRegular → FolderCloseArtwork size=16
          //   IconQueueOutlineRegular → IconQueueOutlineArtwork size=**14**（它内部把 14 传给
          //     ChatLinesOutlineArtwork，后者自己的默认值是 16，被这层吃掉）
          // 于是不传 size 时两侧一个是 16px、一个是 14px，视觉上「会话图标比工作区小一圈」。
          const CRUMB_ICON_SIZE = 16
          const crumbIcon = (subagent) => (subagent
            ? glyph(SUBAGENT_SVG, 'bst-glyph')
            : React.createElement(IconQueueOutlineRegular, { size: CRUMB_ICON_SIZE }))
          // 标题态里被压成图标的那一级用原生上下箭头（目前只会是父级）：它表达的是
          // 「上面还有一层」，用会话字形会让人误以为那是一个会话本身。
          const crumbGlyph = (node) => (titleState === true && iconicSet.has(node.id))
            ? glyph(SWITCHER_SVG, 'bst-glyph')
            : crumbIcon(node.subagent)

          // Esc 关闭下拉后把焦点还给触发按钮（原生菜单的键盘行为）。
          // 外部点击**不**归还：那会把焦点从用户刚点的位置抢走。
          const focusTrigger = (refObj) => {
            const node = refObj !== null && refObj !== undefined ? refObj.current : null
            if (node === null || node === undefined || typeof node.focus !== 'function') return
            try { node.focus() } catch { /* 节点已卸载 */ }
          }

          return React.createElement(React.Fragment, null,
            React.createElement('div', { ref: ref, className: 'bst-crumbs' },
              // ---------- 工作区面包屑 ----------
              React.createElement('div', { className: 'bst-crumb', 'data-bst-level': 'ws' },
                React.createElement('button', {
                  ref: wsAnchorRef, type: 'button',
                  className: 'bst-crumb-btn' + (iconicSet.has('ws') ? ' bst-crumb-iconic' : ''),
                  'data-bst-crumb': 'ws',
                  title: wsTitle,
                  'aria-label': wsTitle,
                  'aria-expanded': wsOpen,
                  onClick: () => { setWsOpen((o) => !o); setSsOpen(false) },
                },
                  React.createElement('span', { className: 'bst-crumb-icon' },
                    React.createElement(IconFolderCloseRegular, { size: CRUMB_ICON_SIZE })),
                  React.createElement('span', { className: 'bst-crumb-text' }, wsTitle),
                  React.createElement(wsOpen ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { className: 'bst-chev' }),
                ),
              ),
              // ---------- 会话面包屑（含祖先链：子智能体会话多一级「父会话」） ----------
              // 末级 = 当前会话（点击开下拉）；祖先级 = 可点跳回（原生 crumb 同款行为）。
              // 子智能体会话的级用 .bst-crumb-sub 缩小字号，视觉上与原生的 crumbSubagent 一致。
              ...crumbs.flatMap((node, index) => {
                const last = index === crumbs.length - 1
                // 图标态：该级完整标题放不进自己的上限 → 只显示图标（全名留在 title/aria-label）
                const iconOnly = iconicSet.has(node.id) ? ' bst-crumb-iconic' : ''
                const cls = 'bst-crumb-btn'
                  + (last ? ' bst-crumb-current' : '')
                  + (node.subagent ? ' bst-crumb-sub' : '')
                // 末级：子智能体会话开同级切换器、普通会话开会话下拉；祖先级：跳回该级会话。
                // 关键不变式：**每级都有图标**，图标态下链不会出现空洞（祖先级原先只有文本，
                // 隐藏文本后就变成一块看不见的可点区域）。
                const opened = last && (ssOpen || sbOpen)
                return [
                  React.createElement('span', {
                    key: 'sep-' + node.id, className: 'bst-sep', 'aria-hidden': true,
                    // 首级前面那个分隔符是「工作区 / 会话」之间的那个：标题态要连它一起藏
                    ...(index === 0 ? { 'data-bst-sep-first': '' } : null),
                  }, '/'),
                  React.createElement('div', { key: 'seg-' + node.id, className: 'bst-crumb' },
                    last
                      ? React.createElement('button', {
                          ref: ssAnchorRef, type: 'button', className: cls + iconOnly,
                          'data-bst-crumb': node.id,
                          title: node.title,
                          'aria-label': node.title,
                          'aria-expanded': opened,
                          onClick: () => {
                            setWsOpen(false)
                            if (isSubagentSession) { setSbOpen((o) => !o); setSsOpen(false) }
                            else { setSsOpen((o) => !o); setSbOpen(false) }
                          },
                        },
                          React.createElement('span', { className: 'bst-crumb-icon' }, crumbGlyph(node)),
                          React.createElement('span', { className: 'bst-crumb-text' }, node.title),
                          React.createElement(opened ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { className: 'bst-chev' }),
                        )
                      : React.createElement('button', {
                          type: 'button', className: cls + iconOnly,
                          'data-bst-crumb': node.id,
                          title: node.title,
                          'aria-label': node.title,
                          onClick: () => { if (uiWorkspace) uiWorkspace.openSession(node.id) },
                        },
                          React.createElement('span', { className: 'bst-crumb-icon' }, crumbGlyph(node)),
                          React.createElement('span', { className: 'bst-crumb-text' }, node.title),
                        ),
                  ),
                ]
              }),
            ),
            // ---------- 下拉列表（自绘，样式复刻原生） ----------
            React.createElement(BstList, {
              open: wsOpen,
              anchorEl: wsAnchorRef.current,
              items: wsListItems,
              onSelect: (id) => {
                setWsOpen(false)
                if (id === 'add') { newWorkspace(); return }
                const w = items.find((x) => x.workspaceId === id)
                if (w) switchWorkspace(w)
              },
              onClose: () => setWsOpen(false),
              onMore: openMore,
            }),
            React.createElement(BstList, {
              open: ssOpen,
              anchorEl: ssAnchorRef.current,
              items: ssListItems,
              onSelect: (id) => {
                setSsOpen(false)
                if (id === 'new') { newSession(); return }
                if (uiWorkspace) uiWorkspace.openSession(id)
              },
              onClose: () => setSsOpen(false),
              onEscape: () => { setSsOpen(false); focusTrigger(ssAnchorRef) },
              onMore: openMore,
            }),
            // 同级子代理切换器（仅子智能体会话）：列出父会话的直接子代理，选中即切过去
            React.createElement(BstList, {
              open: sbOpen,
              anchorEl: ssAnchorRef.current,
              items: siblingItems,
              onSelect: (id) => { setSbOpen(false); if (uiWorkspace) uiWorkspace.openSession(id) },
              onClose: () => setSbOpen(false),
              onEscape: () => { setSbOpen(false); focusTrigger(ssAnchorRef) },
              onMore: openMore,
            }),
            // ---------- 更多菜单（原生 Menu，锚定 ellipsis） ----------
            // className: bst-more-menu → display:contents：原生 Menu 的空包裹
            // span 默认是 inline-flex，会作为 flex 项挤进顶栏 .headerActions
            // （gap 8px）使后续动作（如创造模式 chip）后移 8px；contents 让它
            // 不产生盒、完全不参与布局，菜单关闭/打开不再引起顶栏位移。
            moreMenu ? React.createElement(Menu, {
              open: true,
              onClose: closeMore,
              onSelect: (id) => {
                const a = moreMenu.actions.find((x) => x.id === id)
                setMoreMenu(null)
                // 更多菜单项的操作完成后关闭所在下拉（点击更多菜单项时
                // click 被原生 Menu 内部 stopPropagation 拦截，不会走到
                // BstList 的外部关闭，所以这里显式关闭）
                setWsOpen(false)
                setSsOpen(false)
                if (a) a.action()
              },
              items: moreMenu.actions.map((a) => ({ id: a.id, label: a.label, icon: a.icon, danger: a.danger })),
              portal: true,
              closeOnPointerLeave: true,
              align: 'end',
              getAnchorRect: getMoreAnchorRect,
              className: 'bst-more-menu',
            }) : null,
            // ---------- 对话框（原生 Modal） ----------
            React.createElement(Modal, {
              open: wsError !== null,
              onClose: () => setWsError(null),
              closeLabel: bstT('dialog.close'),
              title: wsError !== null ? wsError.title : bstT('dialog.pickerErrorTitle'),
              footer: React.createElement(Button, { variant: 'primary', onClick: () => setWsError(null) }, bstT('dialog.close')),
            },
              wsError !== null ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsError.message) : null,
            ),
            React.createElement(Modal, {
              open: wsRename !== null,
              onClose: () => { if (wsRename && !wsRename.busy) setWsRename(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.renameWsTitle'),
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: wsRename ? wsRename.busy : true, onClick: () => setWsRename(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'primary',
                  disabled: !wsRename || wsRename.busy || wsRename.draft.trim() === '' || wsRenameDup,
                  onClick: confirmWsRename,
                }, bstT('dialog.confirm')),
              ),
            },
              wsRename ? React.createElement(Input, {
                value: wsRename.draft,
                placeholder: bstT('dialog.renameWsPlaceholder'),
                'aria-label': bstT('dialog.renameWsTitle'),
                autoFocus: true,
                disabled: wsRename.busy,
                onFocus: (e) => { e.target.select() },
                onChange: (e) => setWsRename({ ...wsRename, draft: e.target.value, error: null }),
                onCompositionStart: () => { wsRenameRef.current = true },
                onCompositionEnd: () => { wsRenameRef.current = false },
                onKeyDown: renameKeyDown(wsRenameRef, confirmWsRename),
              }) : null,
              wsRenameDup
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, bstT('dialog.renameWsDuplicate')) : null,
              wsRename && wsRename.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsRename.error) : null,
            ),
            React.createElement(Modal, {
              open: wsDelete !== null,
              onClose: () => { if (wsDelete && !wsDelete.busy) setWsDelete(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.deleteWsTitle'),
              description: wsDelete ? bstT('dialog.deleteWsBody', { name: wsDelete.title }) : undefined,
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: wsDelete ? wsDelete.busy : true, onClick: () => setWsDelete(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'outline', className: 'bst-btn-danger-outline',
                  disabled: !wsDelete || wsDelete.busy,
                  onClick: confirmWsDelete,
                }, bstT('dialog.deleteWsTitle')),
              ),
            },
              wsDelete && wsDelete.busy
                ? React.createElement('div', { className: 'bst-dialog-note', role: 'status' }, bstT('dialog.busy')) : null,
              wsDelete && wsDelete.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsDelete.error) : null,
            ),
            React.createElement(Modal, {
              open: ssRename !== null,
              onClose: () => { if (ssRename && !ssRename.busy) setSsRename(null) },
              closeLabel: bstT('dialog.cancel'),
              title: bstT('dialog.renameSessionTitle'),
              footer: React.createElement(React.Fragment, null,
                React.createElement(Button, { variant: 'outline', disabled: ssRename ? ssRename.busy : true, onClick: () => setSsRename(null) }, bstT('dialog.cancel')),
                React.createElement(Button, {
                  variant: 'primary',
                  disabled: !ssRename || ssRename.busy || ssRename.draft.trim() === '',
                  onClick: confirmSsRename,
                }, bstT('dialog.confirm')),
              ),
            },
              ssRename ? React.createElement(Input, {
                value: ssRename.draft,
                placeholder: bstT('dialog.renameSessionPlaceholder'),
                'aria-label': bstT('dialog.renameSessionTitle'),
                autoFocus: true,
                disabled: ssRename.busy,
                onFocus: (e) => { e.target.select() },
                onChange: (e) => setSsRename({ ...ssRename, draft: e.target.value, error: null }),
                onCompositionStart: () => { ssRenameRef.current = true },
                onCompositionEnd: () => { ssRenameRef.current = false },
                onKeyDown: renameKeyDown(ssRenameRef, confirmSsRename),
              }) : null,
              ssRename && ssRename.error !== null
                ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, ssRename.error) : null,
            ),
          )
        }

        // ---------- 样式注入 ----------
        // 核心：面包屑代替原生会话标题（隐藏原生标题 nav）。
        // 0.2.0-rc.2 标题结构：header[data-conversation-header] > div[data-conversation-title-row]
        //   > div.titleCluster > [ nav.crumbs（原生标题）, div.headerActions（本面包屑） ]
        // 0.2.1-rc.2 起两个 data 属性被移除，新结构：
        //   header[data-window-drag] > div.titleRow > div.titleCluster
        //     > [ nav.crumbs, div.headerActions（本面包屑，同层兄弟） ]
        // 两代锚点都保留：新一代用 header[data-window-drag] 定界，nav 以
        // 「后面兄弟层里出现 .bst-crumbs」为条件（:has(~ div .bst-crumbs)），
        // 不依赖哈希类名；本插件未注册时规则不命中，原生标题自然保留（无需额外 JS）。
        // 原生会话标题始终隐藏：窄屏「会话标题」态露的也是我们自己的会话级
        //（1.3.3 曾在这一态放原生 nav 回来，1.3.4 起改为去图标的会话级，见下）。
        insertStyle(`div[data-conversation-title-row]:has(.bst-crumbs) nav{display:none}`)
        insertStyle(`header[data-window-drag] nav:has(~ div .bst-crumbs){display:none}`)
        // 窄屏「会话标题」态：只留会话级 —— 藏掉工作区级、它后面那个分隔符，以及会话图标。
        //   ① 图标：用户要的是「标题」，不是一枚图标；宽屏面包屑里的图标保留。
        //   ② 工作区级用 display:none 而**不是**不渲染：crumbNeed 按 .bst-crumb-btn 的数量
        //      推导（见 CRUMB_LEVEL_COST 的注释），真删掉会让阈值从 285 掉到 151，
        //      于是「藏起来 → 放得下 → 再显示」来回翻。
        insertStyle('.bst-crumbs[data-bst-narrow="title"] [data-bst-level="ws"],'
          + '.bst-crumbs[data-bst-narrow="title"] [data-bst-sep-first],'
          + '.bst-crumbs[data-bst-narrow="title"] .bst-crumb-icon{display:none}')
        // 例外：被压成图标的那一级（标题态下只会是父级）本来就只有图标，得放回来 —— 否则
        // 压缩后剩一个空按钮。图标由渲染层换成原生上下箭头（见 crumbGlyph）。
        insertStyle('.bst-crumbs[data-bst-narrow="title"] .bst-crumb-iconic .bst-crumb-icon{display:inline-flex}')
        // 插件详情页（设置页）版式：行度量与插件管理器自己的 facts 行一致
        //（min-height 44 / 上下 8 / 下边框 .5px），字号 13·20 与 12·18 沿用原生设置页。
        insertStyle('.bst-settings{display:flex;flex-direction:column;gap:0;min-width:0}'
          + '.bst-settings-row{display:flex;align-items:center;justify-content:space-between;gap:16px;'
          + 'min-height:44px;padding:8px 2px;box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2)}'
          + '.bst-settings-row:last-of-type{border-bottom:0}'
          + '.bst-settings-block{display:flex;flex-direction:column;gap:8px;padding:12px 2px;'
          + 'box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2)}'
          + '.bst-settings-main{display:flex;flex-direction:column;gap:2px;min-width:0}'
          + '.bst-settings-label{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-weight:500}'
          + '.bst-settings-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}'
          + '.bst-mode-cubes{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;min-width:0}'
          // 方块选择器：几何照抄原生外观三选一（Setting 页 themeCube）——.5px 描边、xl 圆角、
          // 选中换 module-platform 底色 + bluish-400 描边；只是把内容从「图标+名称」扩成
          // 「图标+名称+一句取舍」，所以内边距收紧、字号沿用设置页的 13/20 与 12/18。
          + '.bst-mode-cube{box-sizing:border-box;flex:1 1 240px;min-width:0;display:flex;flex-direction:column;'
          + 'gap:6px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l4);'
          + 'border-radius:var(--dsw-radius-xl);background:transparent;color:var(--dsw-alias-label-primary);'
          + 'font:inherit;text-align:left;cursor:pointer}'
          + '.bst-mode-cube:hover:not(:disabled):not([aria-pressed="true"]){background:var(--dsw-alias-interactive-bg-hover)}'
          + '.bst-mode-cube[aria-pressed="true"]{background:var(--dsw-alias-bg-module-platform);'
          + 'border-color:var(--dsw-static-neutral-bluish-400)}'
          + '.bst-mode-cube:disabled{cursor:default;opacity:.6}'
          + '.bst-mode-head{display:flex;align-items:center;gap:6px;font-size:13px;line-height:20px;font-weight:500}'
          + '.bst-mode-head svg{flex:none;color:var(--dsw-alias-label-secondary)}'
          + '.bst-mode-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}'
          + '.bst-settings-status{margin:8px 2px 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}'
          + '.bst-settings-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}')
        // 承载面包屑的三层容器默认不可收缩：实测 headerActions 是 `flex: 0 0 auto` +
        // `min-width: auto`，所以顶栏变窄时它不让位，面包屑整条溢出、在窗口边缘被裁掉 ——
        // 文本永远不会被挤出省略号（「文本不会被挤压缩」的根因），逐级图标态也就没有前提。
        // 让这三层回到可收缩（它们本就在原生 minmax(0,1fr) 的列里），文本才会正常省略。
        // 注意：原生头部是 <header>（不是 div），锚点必须限定在 header 上，
        // 写成 div[window-drag] 之类会永远匹配不到（静默失效）。
        insertStyle(`[data-conversation-header] div:has(.bst-crumbs){min-width:0;flex-shrink:1}`)
        insertStyle(`header[data-window-drag] div:has(.bst-crumbs){min-width:0;flex-shrink:1}`)
        // 面包屑自己的尺寸策略：**可缩**，且**永不外溢**。
        //   · flex-shrink:1 + min-width:0 —— 允许被压窄，文本由 .bst-crumb-text 省略；
        //   · overflow:hidden —— 关键的一条。本盒子的子项（各级按钮，虽然 min-width:0，但带图标与
        //     内边距，压不到 0）一旦超出，flex 默认**画到盒子外面**，正好盖在后面那枚 chip 上
        //     （实测截图：「更好的会话标题插件维护(2智能体团队」两串字叠在一起）。裁切是最坏情况
        //     的上限：判据再准，也不该让文字压到别人的控件上。
        // 不设 min-width 下限：0.2.1 实测过，给这盒子一个宽度下限会挤得相邻控件仓促换行，比裁切更难看。
        // 「可用宽度」由测量代码按「父行右边缘 − 我们的左边缘 − 排在我们后面的兄弟」算，**不读本盒子
        // 的 clientWidth** —— 本盒子是内容宽度、不 grow，读它会得出「标题只有 349px」的假象。
        // 面包屑 + 下拉列表（复刻原生 Menu.module.css）+ 对话框补充样式
        insertStyle(`.bst-crumbs{display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1;overflow:hidden}.bst-crumb{position:relative;min-width:0;display:flex}.bst-crumb-btn{display:flex;align-items:center;gap:5px;border:none;background:transparent;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-tertiary);font-size:14px;font-weight:500;line-height:20px;cursor:pointer;max-width:var(--bst-crumb-max,220px);min-width:0;flex:1 1 auto;padding:4px 8px;min-height:28px}.bst-crumb-btn:hover,.bst-crumb-btn:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bst-crumb-btn:active{background:var(--dsw-alias-interactive-bg-active)}.bst-crumb-current{color:var(--dsw-alias-label-primary)}.bst-crumb-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-crumb-btn svg{flex-shrink:0;color:var(--dsw-alias-label-tertiary);pointer-events:none}.bst-crumb-btn:hover .bst-chev{color:var(--dsw-alias-label-primary)}.bst-sep{color:var(--dsw-alias-label-tertiary);font-size:12px;user-select:none;flex:none}.bst-crumb-icon{display:inline-flex;flex:none}.bst-crumb-iconic .bst-crumb-text{display:none}.bst-crumb-sub{font-size:12px;line-height:18px}`)
        // 下拉列表（行内度量与原生 AccountMenu 的 menuitem 一致；卡片沿用原生菜单 surface token）
        insertStyle(`.bst-list{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;min-width:220px;max-width:360px;max-height:calc(100vh - 24px);overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));box-shadow:var(--dsw-elevation-prominent)}.bst-list-sep{height:1px;margin:4px 2px;background:var(--dsw-alias-border-l1);flex:none}.bst-item{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left;box-sizing:border-box}.bst-item:hover:not(:disabled),.bst-item-selected{background:var(--dsw-alias-interactive-bg-hover)}.bst-item:disabled{opacity:.4;cursor:not-allowed}.bst-item-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}.bst-item-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px}.bst-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-item-meta{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.bst-item-more{display:none;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}.bst-item:hover:not(:disabled) .bst-item-more{display:inline-flex}.bst-item:hover:not(:disabled) .bst-item-meta{display:none}.bst-item-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bst-more-menu{display:contents}@media (hover:none){.bst-item-more{display:inline-flex}.bst-item-meta{display:none}}`)
        // 对话框补充样式
        insertStyle(`.bst-dialog-error{font-size:12px;color:var(--dsw-alias-state-error-primary);word-break:break-all}.bst-dialog-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}.bst-btn-danger-outline{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}`)
        // ------------------------------------------------------------------
        // 会话顶栏细化：三枚原生 chip（子智能体 / 智能体团队 / 后台任务）的度量与字形
        // ------------------------------------------------------------------
        // 行内字形（子智能体级面包屑用）：容器撑住 16px，与同排的原生图标（primitives 默认 size=16）齐平。
        insertStyle(`.bst-glyph{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;color:var(--dsw-alias-label-tertiary)}.bst-glyph>svg{display:block;width:16px;height:16px}`)
        // ------------------------------------------------------------------
        // 三枚原生 chip：统一成一套「类 DSH 原生」的度量
        // ------------------------------------------------------------------
        // 子智能体 / 后台任务来自官方 ui-subagent / ui-jobs，智能体团队来自 [data-team-action]——
        // 全是别人的按钮：不接管、不隐藏，只在测量代码给它们打上 data-bst-chip="sub|team|jobs"
        // 之后统一改度量。原生三枚彼此并不一致（padding 3px 2px / 3px 2px / 3px 7px，
        // 圆角 --dsw-radius-sm / 6px，hover 变色目标也不相同），这里取「原生里带图标那枚」
        // 的取值作为统一口径，于是三枚与官方观感一致、彼此也一致：
        //   font-size 12 / line-height 18 / padding 3px 7px / gap 5 / min-height 28
        //   border-radius var(--dsw-radius-md) / 文字 label-tertiary / hover 提亮 **并加底色**
        // 出处：团队 MQ2cuG_trigger（12px、3px 7px、gap 5、radius 6px、hover→primary）+ 三枚共同的
        // min-height 28 与 label-tertiary 基准色。
        // 两处「非原生」是用户点名的口味，别当成 bug 修：圆角用 --dsw-radius-md（实测 12px，
        // 与面包屑同一个 token；原生 chip 自己是 --dsw-radius-sm=8px、团队字面量 6px）、
        // hover 加底色（原生只提亮文字）。
        // nowrap + 可收缩是必需的：官方没有 nowrap，顶栏一挤中文就竖排成「智能/体团/队」，
        // 而且 wrap 状态下 scrollWidth 恒等于 clientWidth，量不出「放不下」（三态档位就没有前提）。
        insertStyle('button[data-bst-chip]{display:inline-flex;align-items:center;gap:5px;'
          + 'min-width:0;white-space:nowrap;overflow:hidden;'
          + 'font-size:12px;line-height:18px;padding:3px 7px;min-height:28px;border-radius:var(--dsw-radius-md);'
          + 'color:var(--dsw-alias-label-tertiary)}'
          // 官方后台任务那枚的「文字」span 自带 `.count{margin:0 5px}`（原生是给数字留的间距），
          // 而那个 span 正是我们标成 data-bst-chip-label 的节点 —— 不归零的话它的图标↔文字间距
          // 会比另外两枚多 5px（截图里「后台任务」离图标更远、「(4)」前面也更宽）。
          + 'button[data-bst-chip]>[data-bst-chip-label]{margin:0}'
          // hover：在原生「文字提亮」之上**加回底色**（用户要求）。底色与面包屑同一个 token，
          // 于是同一行里「可点的东西悬停有色块」这件事保持一致；文字提亮也保留，双保险。
          + 'button[data-bst-chip]:hover,button[data-bst-chip]:focus-visible{'
          + 'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}'
          // 「运行中」圆点的位置：圆点 order 1、官方箭头 order 2，于是视觉顺序是
          // 图标(::before) · 文字 · (N) · 圆点 · 箭头 —— 三枚 chip 的「图标→文字」间距一致。
          + 'button[data-bst-chip]>[data-bst-chip-dot]{order:1}'
          + 'button[data-bst-chip="sub"]>svg,button[data-bst-chip="jobs"]>svg{order:2}')
        // 「智能体团队」补丁：官方那枚只有「图标 + 文字」，统计数与箭头都没有，由我们补：
        //   · 文字给个上限 + 省略号（换文案 / 长语言时不至于把整枚撑爆）；
        //   · 箭头用 ::after + mask，展开态由官方自己的 aria-expanded 驱动翻转，icon 档收起。
        //     过渡 .12s 同样取自官方：ui-jobs 的 `.trigger svg{transition:transform .12s}`；
        //     子智能体那枚没有过渡（瞬间转），属官方内部不一致，不归我们改。
        //     尺寸 12 不是拍的：这就是官方自己在同类控件上的取值 —— ui-jobs 的 trigger 箭头是
        //     IconChevronDownOutlineRegular size:12，agent-team 包自己的展开按钮也是 size:12。
        //     （子智能体那枚用的是 primitives 默认 16，属官方内部不一致，不归我们改。）
        //   · 统计数由测量代码插成 <span data-bst-chip-count>，位置与另外两枚一致（文字之后）。
        insertStyle('button[data-bst-chip="team"]>[data-bst-chip-label]{max-width:120px;overflow:hidden;'
          + 'text-overflow:ellipsis;white-space:nowrap}'
          + 'button[data-bst-chip="team"]::after{content:"";display:block;width:12px;height:12px;'
          + 'flex:none;background-color:currentColor;opacity:.7;'
          + '-webkit-mask:' + cssMask(CHEVRON_SVG) + ' center/contain no-repeat;'
          + 'mask:' + cssMask(CHEVRON_SVG) + ' center/contain no-repeat;transition:transform .12s}'
          + 'button[data-bst-chip="team"][aria-expanded="true"]::after{transform:rotate(180deg)}'
          + 'button[data-bst-chip="team"][data-bst-chip-mode="icon"]::after{display:none}')
        // 原生 chip 补图标：顶栏里「N 个子智能体」「N 个后台任务」两组按钮自带文字却没有图标，
        // 这里用 ::before + mask 补上。**不按祖先/aria-label 选择器匹配**——那两个条件依赖官方
        // DOM 结构与文案（0.2.1-rc.2 就换过一次 header 锚点），一旦失配就静默失效；
        // 改为由测量代码在按钮上打 data-bst-chip="sub|jobs"（见 WorkspaceTitleBreadcrumb 的
        // useLayoutEffect），样式只认这个属性，命中与否一眼可查：Elements 面板里看按钮有没有该属性。
        // mask 只用 alpha，故图标串里的 currentColor 不影响显色，颜色由 background-color 给。
        // 图标与文字的间距交给上面共用规则的 gap，这里不再自带 margin（否则两者会相加）。
        // **尺寸取 14，对齐原生**（不是 primitives 默认的 16）：顶栏这三枚里唯一自带图标的
        // 智能体团队，官方就是 `IconUsersOutlineRegular, { size: 14 }`；子智能体的
        // `activitySlot` 也是 width/height:14。14 才是这一行的图标尺码。
        const chipGlyph = (kind, svg) => insertStyle(
          `button[data-bst-chip="${kind}"]::before{content:"";display:block;width:14px;height:14px;`
          + 'flex:none;background-color:currentColor;opacity:.65;'
          + '-webkit-mask:' + cssMask(svg) + ' center/contain no-repeat;'
          + 'mask:' + cssMask(svg) + ' center/contain no-repeat}',
        )
        chipGlyph('sub', SUBAGENT_SVG)
        chipGlyph('jobs', JOBS_SVG)
        // 三态由测量代码逐级写入 data-bst-chip-mode，三枚 chip 各降各的。
        // 隐藏哪些节点不看标签名/子元素，而看测量代码打上的标记：
        //   data-bst-chip-label = 原生「纯文字」节点（jobs: span.count；subagent: span.count /
        //     span.switcherTitle），count/icon 档隐藏它；
        //   data-bst-chip-count = 我们自己的统计数 span（「(N)」），full / count 档都显示，icon 档收起；
        //   「运行中」的 StateDot 两样都不是，任何档位都保留 —— 收起后仍看得出任务还在跑。
        // icon 档连官方自带的箭头一起收起（sub/jobs 的箭头是官方塞的 svg 子节点，团队那枚是我们
        // 的 ::after、已按档位关掉）；padding 保持 3px 7px 不变，于是收起后是 14 + 7×2 = 28px 的方块
        // —— 正好等于官方团队那枚「label 被 container query 藏掉」之后的宽度，三枚完全一致。
        // 「运行中」圆环的样式：与官方 StateDot 的 ongoing 态逐项对齐（14px、r=9.5、stroke 2、
        // 底环 opacity .25、弧 dasharray 12→24、1.5s 匀速旋转 + 1.5s 呼吸、颜色 label-tertiary、
        // reduced-motion 下停成静态弧）。数值来源：primitives/lib/StateDot.module.css。
        insertStyle('.bst-chip-spin{display:block;flex:none;width:14px;height:14px;'
          + 'color:var(--dsw-alias-label-tertiary)}'
          + '.bst-chip-spin>svg{display:block;width:14px;height:14px}'
          + '.bst-spin-motion{transform-origin:center;animation:bst-spin-rotate 1.5s linear infinite}'
          + '.bst-spin-track,.bst-spin-arc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}'
          + '.bst-spin-track{opacity:.25}'
          + '.bst-spin-arc{stroke-dasharray:12 150;animation:bst-spin-dash 1.5s ease-in-out infinite}'
          + '@keyframes bst-spin-rotate{to{transform:rotate(360deg)}}'
          + '@keyframes bst-spin-dash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}'
          + '50%{stroke-dasharray:24 150;stroke-dashoffset:-6}'
          + '100%{stroke-dasharray:12 150;stroke-dashoffset:0}}'
          + '@media (prefers-reduced-motion:reduce){.bst-spin-motion,.bst-spin-arc{animation:none}'
          + '.bst-spin-arc{stroke-dasharray:18 150;stroke-dashoffset:-3}}')
        // 统计数的规格直接抄官方 `.MQ2cuG_count`：12px / label-caption / 400 字重 / 等宽数字。
        // （原生 jobs 的 count 用 margin:0 5px 拉开，我们统一交给 gap，故不再自带 margin。）
        insertStyle('.bst-chip-count{color:var(--dsw-alias-label-caption);font-size:12px;'
          + 'line-height:16px;font-weight:400;font-variant-numeric:tabular-nums}'
          + 'button[data-bst-chip-mode="icon"]>span[data-bst-chip-count]{display:none}'
          + 'button[data-bst-chip-mode="count"]>[data-bst-chip-label],'
          + 'button[data-bst-chip-mode="icon"]>[data-bst-chip-label]{display:none}'
          + 'button[data-bst-chip="sub"][data-bst-chip-mode="icon"]>svg,'
          + 'button[data-bst-chip="jobs"][data-bst-chip-mode="icon"]>svg{display:none}')
        // ---------- 注册：会话顶栏 actions 槽 ----------
        // order -40 → 该槽内最前。原生项的顺序随版本变过（0.2.1-rc.2：subagent-catalog -30 /
        // team -20 / preset -10；0.2.1-rc.3：team -20 / preset -10 / cost-meter 1 /
        // subagent-catalog 10 / job-list 20），我们只保证自己排在最前，不依赖别人的数字。
        // 于是面包屑落回「原生标题」所在的位置，成为会话顶栏最前端的元素。
        slots.inject('conversation.session.header.actions', () => slots.register(
          { name: 'conversation.session.header.actions', id: 'bst-breadcrumb', order: -40, label: () => bstT('slot.breadcrumb'), registrant: 'dsh-better-session-topbar' },
          WorkspaceTitleBreadcrumb,
        ))
      },
    }
    return module.exports
  },
})