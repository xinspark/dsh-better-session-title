// ============================================================================
// Better Session Title（dsh-better-session-title）· 浏览器端（Client）
// ----------------------------------------------------------------------------
// 本文件是插件的浏览器半，通过 UMD 包装注册到 DSH 的 clientModules。
//
// 定位：把会话顶栏中央的原生会话标题，替换为「工作区 / 会话」面包屑，并占据顶栏最前端
// （注册 order -40，排在原生 subagent-catalog/-30、agent-team/-20、agent-preset/-10 之前）。
// 进入子智能体会话时自动扩展为「工作区 / 父会话 / 子智能体会话」：祖先级可点跳回，
// 末级为当前会话；当前工作区按祖先链的根节点判定（子会话自身不一定属于任何工作区）。
//
// 折叠（紧凑）模式：空间不足时隐藏文本、只留图标，链有多长都成立，靠三条规矩：
//   ① **每一级都必须有图标** —— 工作区=文件夹、普通会话级=会话字形、子智能体级=原生
//      switcher 的上下双箭头字形。祖先级原先只有文本，隐藏文本后就成了一眼看不见、
//      却仍能点的区域（子智能体会话下最明显）。
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
  id: 'dsh-better-session-title',
  factory: (require) => {
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
      // 子智能体层级图标：原生管线的 switcher 字形（上下双箭头）——
      // 原生 conversation.session.header.lineage 的切换器用的就是这个语义，
      // 折叠成图标时它让「这一级是子智能体」一眼可辨，且与下拉箭头（单箭头）不同形。
      IconChevronsUpDownOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    // 图标态下限：某一级的标签被顶栏挤到可见宽度小于这个值（≈5 个汉字）时，文本已经读不出
    // 内容，该级改为只显示图标（完整标题仍在 title / aria-label 里，悬停即得）。
    // 注意这是「挤到读不出」的判据，不是「标题比上限长」：后者哪怕窗口再宽也会命中
    // （标题本身就超过 max-width 上限），那正是"这么宽怎么变图标"的来源。
    // 参考量：会话级标签在上限（180px）时的可见宽度约 130px —— 下限必须明显小于它。
    const ICONIC_TEXT_FLOOR = 80

    // ============================================================
    // 本地基础工具：样式注入 / 定时器
    // ============================================================
    const styleTags = []
    function insertStyle(css) {
      if (typeof document === 'undefined') return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-better-session-title'
      tag.textContent = css
      document.head.append(tag)
      styleTags.push(tag)
    }
    function interval(fn, ms) {
      const id = setInterval(fn, ms)
      return () => clearInterval(id)
    }

    // ============================================================
    // 插件字典（zh/en，跟随 DSH 语言切换）
    // ============================================================
    const BST_ZH = {
      'slot.breadcrumb': '工作区/会话',
      'crumb.workspaceNone': '未关联工作区', 'crumb.sessionNone': '新会话', 'crumb.noSiblings': '暂无同级子代理',
      // 注意：这里**不要**用原生文案「添加工作区 / Add workspace」。第三方「手机口袋」类插件
      // （实测 dsh-pocket 2.11.0 的 hideWsEntries）会全局扫描 [role=menuitem],li,button,a
      // 并按文本精确匹配 WS_LABELS=['添加工作区','添加工作区…','Add workspace','Add workspace…']，
      // 命中就 display:none + data-mobile-nav-hide —— 我们与原生同文案的那一行会被它一并隐藏
      // （列表里看着少了一行）。改自有文案即可避开，且语义更准：这一行是「新建工作区」。
      'crumb.addWorkspace': '新建工作区', 'crumb.noWorkspaces': '暂无工作区', 'crumb.newSession': '新建会话', 'crumb.noSessions': '当前工作区暂无会话',
      'crumb.rename': '重命名', 'crumb.remove': '删除工作区', 'crumb.fork': '分支', 'crumb.archive': '归档会话',
      'menu.more': '更多',
      'dialog.renameWsTitle': '重命名工作区', 'dialog.renameWsPlaceholder': '工作区名称', 'dialog.renameWsDuplicate': '已存在同名工作区',
      'dialog.renameSessionTitle': '重命名会话', 'dialog.renameSessionPlaceholder': '会话标题',
      'dialog.deleteWsTitle': '删除工作区', 'dialog.deleteWsBody': '确定删除工作区「{name}」吗？其会话将移入未分组。此操作不可撤销。',
      'dialog.pickerErrorTitle': '新建工作区失败', 'dialog.close': '关闭',
      'dialog.actionErrorTitle': '操作失败',
      'dialog.serviceNotReady': '界面服务尚未就绪（工作区/会话控制器还没连上），请稍后重试。',
      'dialog.confirm': '确定', 'dialog.cancel': '取消',
      'dialog.busy': '处理中…', 'dialog.failed': '操作失败：{error}',
      'rel.justNow': '刚刚', 'rel.minutes': '{n}分钟', 'rel.hours': '{n}小时', 'rel.days': '{n}天', 'rel.months': '{n}个月', 'rel.years': '{n}年',
    }
    const BST_EN = {
      'slot.breadcrumb': 'Workspace/Session',
      'crumb.workspaceNone': 'No workspace', 'crumb.sessionNone': 'New session', 'crumb.noSiblings': 'No sibling subagents',
      // See the zh dictionary: avoid the native wording ("Add workspace"), which mobile plugins
      // like dsh-pocket hide by exact-text match on every [role=menuitem]/button.
      'crumb.addWorkspace': 'New workspace', 'crumb.noWorkspaces': 'No workspaces', 'crumb.newSession': 'New session', 'crumb.noSessions': 'No sessions in this workspace',
      'crumb.rename': 'Rename', 'crumb.remove': 'Delete workspace', 'crumb.fork': 'Fork', 'crumb.archive': 'Archive session',
      'menu.more': 'More',
      'dialog.renameWsTitle': 'Rename workspace', 'dialog.renameWsPlaceholder': 'Workspace name', 'dialog.renameWsDuplicate': 'A workspace with this name already exists',
      'dialog.renameSessionTitle': 'Rename session', 'dialog.renameSessionPlaceholder': 'Session title',
      'dialog.deleteWsTitle': 'Delete workspace', 'dialog.deleteWsBody': 'Delete workspace "{name}"? Its sessions move to the ungrouped list. This cannot be undone.',
      'dialog.pickerErrorTitle': 'New workspace failed', 'dialog.close': 'Close',
      'dialog.actionErrorTitle': 'Action failed',
      'dialog.serviceNotReady': 'The UI services are not ready yet (workspace/session controller still connecting). Please retry in a moment.',
      'dialog.confirm': 'Confirm', 'dialog.cancel': 'Cancel',
      'dialog.busy': 'Working…', 'dialog.failed': 'Action failed: {error}',
      'rel.justNow': 'just now', 'rel.minutes': '{n}m', 'rel.hours': '{n}h', 'rel.days': '{n}d', 'rel.months': '{n}mo', 'rel.years': '{n}y',
    }

    module.exports = {
      name: 'Better Session Title',
      // cordis 级依赖声明：必须等这些服务就绪再 apply。
      // ① 少了 `slots`，apply 会在槽位系统就绪前执行，`slots.inject(key, cb)` 的回调**永不触发**
      //    ——插件静默不注册、界面什么都不显示，且全链路没有任何报错。
      // ② 少了 workspaces / sessions / uiWorkspace / locale，apply 可能在这些服务注册前跑完：
      //    下面 `ctx.get(...)` 拿到的是 undefined，而 apply 只执行一次 —— 于是这层 undefined
      //    被**永久捕获**进所有事件处理闭包，表现是「面包屑外观完全正常，但下拉里的
      //    切换 / 新建 / 重命名 / 删除 全部点了没反应」，既无异常也无日志。
      //    官方/第三方客户端插件都声明各自的服务依赖；新增服务依赖时同步加进这里。
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
        function BstList({ open, anchorEl, items, onSelect, onClose, onMore }) {
          const [pos, setPos] = React.useState(null)
          const listRef = React.useRef(null)
          // onClose 走 ref：调用方每次渲染传新箭头函数，但监听器只在 open/anchorEl
          // 变化时重绑，避免每渲染一次就 remove/addEventListener 一次。
          const onCloseRef = React.useRef(onClose)
          onCloseRef.current = onClose
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
              if (e.key === 'Escape') onCloseRef.current()
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
          const [wsOpen, setWsOpen] = React.useState(false)
          const [ssOpen, setSsOpen] = React.useState(false)
          const [sbOpen, setSbOpen] = React.useState(false)
          const wsAnchorRef = React.useRef(null)
          const ssAnchorRef = React.useRef(null)
          // 独立插件：没有外部开关，面包屑始终渲染（曾经的父插件设置桥接已移除）。
          // 自适应图标态：**逐级**判定，且只在「真的放不下 / 被挤到读不出」时才换图标。
          // 判据两条：
          //   ① 整条面包屑溢出（放不下）→ 全部收成图标。这条是兜底，不依赖"文本会被挤"这个前提：
          //      顶栏容器若不可收缩，溢出会直接表现为被窗口边缘裁掉（文本一点没被挤）——
          //      实测过：headerActions 是 flex:0 0 auto + min-width:auto 时就是这个症状，
          //      所以另有 CSS 规则让那三层容器可收缩；这条兜底覆盖残留的溢出状态。
          //   ② 某级文本被截断，且截断后可见宽度 < ICONIC_TEXT_FLOOR（≈5 个汉字宽）→ 该级收成图标。
          //      · 窗口宽、只是标题比上限长 → 可见宽度仍有 ~130px，继续显示截断文本
          //        （截断文本比一个图标信息量大）—— 这就是「这么宽为什么变图标」的修法；
          //      · 顶栏真挤起来、文本只剩几个字 → 换成图标，让位于层级感与点击面积。
          //        单级面包屑本来就很难被挤到，真正会走到这里的是多级链（子智能体会话）。
          // 恢复用与形态无关的滞回：记住折叠时的 header 宽度，宽回来 +180px 才展开
          //（图标态下文本移出文档流，量不到"原本需要多宽"，所以只能拿 header 参照）。
          const [iconic, setIconic] = React.useState('')
          const ref = React.useRef(null)
          // 用 layout effect：首次测量发生在绘制前，于是不会先闪一下文本再变图标。
          React.useLayoutEffect(() => {
            const el = ref.current
            if (!el) return
            const header = el.closest('header') || el
            const flags = {}
            const update = () => {
              try {
                if (header.clientWidth === 0) return
                const keys = []
                // 兜底：整条面包屑已经放不下（溢出）就全部收成图标 —— 不靠"文本被挤"这个前提
                //（顶栏容器若不可收缩，溢出会直接表现为被窗口边缘裁掉，文本一点都没被挤）。
                const rowOverflow = el.scrollWidth > el.clientWidth + 1
                for (const b of el.querySelectorAll('.bst-crumb-btn')) {
                  const key = b.dataset.bstCrumb
                  if (key === undefined) continue
                  const f = flags[key] || (flags[key] = { on: false, at: 0 })
                  const text = b.querySelector('.bst-crumb-text')
                  if (f.on) {
                    if (header.clientWidth >= f.at + 180) f.on = false
                  } else if (rowOverflow || (text !== null
                    && text.scrollWidth > text.clientWidth + 1
                    && text.clientWidth < ICONIC_TEXT_FLOOR)) {
                    f.on = true
                    f.at = header.clientWidth
                  }
                  if (f.on) keys.push(key)
                }
                const next = keys.join(' ')
                setIconic((prev) => (prev === next ? prev : next))
              } catch { /* ignore */ }
            }
            update()
            const ro = new ResizeObserver(update)
            ro.observe(el)
            const onResize = () => update()
            window.addEventListener('resize', onResize)
            const disposeTimer = interval(update, 300)
            return () => {
              ro.disconnect()
              window.removeEventListener('resize', onResize)
              disposeTimer()
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
          const sessionVisible = (s) => s !== undefined
            && s.origin !== 'subagent'
            && !archivedSet.has(s.id)
            && (!s.blank || s.id === sessionId)
          const sessionRows = currentWs
            ? currentWs.sessionIds
                .map((id) => byId[id])
                .filter(sessionVisible)
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
          const newWorkspace = async () => {
            setWsOpen(false)
            if (!workspaces || !uiWorkspace) { fail('dialog.actionErrorTitle', bstT('dialog.serviceNotReady')); return }
            setWsError(null)
            try {
              const path = await uiWorkspace.pickDirectory()
              if (!path) return // 用户在目录选择器中取消：正常，无需反馈
              const view = await workspaces.create({ path })
              await uiWorkspace.openWorkspace(view.workspaceId)
            } catch (e) {
              // 失败必须可见（原生 WorkspacePickFlow 用错误对话框 + 可重试）
              fail('dialog.pickerErrorTitle', e)
            }
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
                  actions: [
                    { id: 'rename', label: bstT('crumb.rename'), icon: React.createElement(IconEditOutlineRegular, null), action: () => openSsRename(s) },
                    { id: 'fork', label: bstT('crumb.fork'), icon: React.createElement(IconBranchOutlineRegular, null), action: () => forkSession(s) },
                    { id: 'archive', label: bstT('crumb.archive'), icon: React.createElement(IconArchiveOutlineRegular, { size: 16 }), action: () => archiveSession(s) },
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
          // 每一级的图标：子智能体级用原生 switcher 字形，普通会话级用会话字形 ——
          // 逐级都有图标是「折叠成图标」在任意链长下都不会变空的前提。
          const crumbIcon = (subagent) => (subagent
            ? React.createElement(IconChevronsUpDownOutlineRegular, null)
            : React.createElement(IconQueueOutlineRegular, null))

          return React.createElement(React.Fragment, null,
            React.createElement('div', { ref: ref, className: 'bst-crumbs' },
              // ---------- 工作区面包屑 ----------
              React.createElement('div', { className: 'bst-crumb' },
                React.createElement('button', {
                  ref: wsAnchorRef, type: 'button',
                  className: 'bst-crumb-btn' + (iconicSet.has('ws') ? ' bst-crumb-iconic' : ''),
                  'data-bst-crumb': 'ws',
                  title: wsTitle,
                  'aria-label': wsTitle,
                  'aria-expanded': wsOpen,
                  onClick: () => { setWsOpen((o) => !o); setSsOpen(false) },
                },
                  React.createElement(IconFolderCloseRegular, null),
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
                const cls = 'bst-crumb-btn bst-crumb-btn-sub' + (node.subagent ? ' bst-crumb-sub' : '')
                // 末级：子智能体会话开同级切换器、普通会话开会话下拉；祖先级：跳回该级会话。
                // 关键不变式：**每级都有图标**，图标态下链不会出现空洞（祖先级原先只有文本，
                // 隐藏文本后就变成一块看不见的可点区域）。
                const opened = last && (ssOpen || sbOpen)
                return [
                  React.createElement('span', { key: 'sep-' + node.id, className: 'bst-sep', 'aria-hidden': true }, '/'),
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
                          crumbIcon(node.subagent),
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
                          crumbIcon(node.subagent),
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
              onMore: openMore,
            }),
            // 同级子代理切换器（仅子智能体会话）：列出父会话的直接子代理，选中即切过去
            React.createElement(BstList, {
              open: sbOpen,
              anchorEl: ssAnchorRef.current,
              items: siblingItems,
              onSelect: (id) => { setSbOpen(false); if (uiWorkspace) uiWorkspace.openSession(id) },
              onClose: () => setSbOpen(false),
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
        insertStyle(`div[data-conversation-title-row]:has(.bst-crumbs) nav{display:none}`)
        insertStyle(`header[data-window-drag] nav:has(~ div .bst-crumbs){display:none}`)
        // 承载面包屑的三层容器默认不可收缩：实测 headerActions 是 `flex: 0 0 auto` +
        // `min-width: auto`，所以顶栏变窄时它不让位，面包屑整条溢出、在窗口边缘被裁掉 ——
        // 文本永远不会被挤出省略号（「文本不会被挤压缩」的根因），逐级图标态也就没有前提。
        // 让这三层回到可收缩（它们本就在原生 minmax(0,1fr) 的列里），文本才会正常省略。
        // 注意：原生头部是 <header>（不是 div），锚点必须限定在 header 上，
        // 写成 div[window-drag] 之类会永远匹配不到（静默失效）。
        insertStyle(`[data-conversation-header] div:has(.bst-crumbs){min-width:0;flex-shrink:1}`)
        insertStyle(`header[data-window-drag] div:has(.bst-crumbs){min-width:0;flex-shrink:1}`)
        // 面包屑 + 下拉列表（复刻原生 Menu.module.css）+ 对话框补充样式
        insertStyle(`.bst-crumbs{display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1}.bst-crumb{position:relative;min-width:0}.bst-crumb-btn{display:flex;align-items:center;gap:5px;border:none;background:transparent;border-radius:10px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;cursor:pointer;max-width:180px;min-width:0;padding:3px 6px;min-height:28px}.bst-crumb-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.bst-crumb-btn:active{background:var(--dsw-alias-interactive-bg-active)}.bst-crumb-btn-sub{color:var(--dsw-alias-label-secondary)}.bst-crumb-btn-sub:hover{color:var(--dsw-alias-label-primary)}.bst-crumb-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-crumb-btn svg{flex-shrink:0;color:var(--dsw-alias-label-tertiary);pointer-events:none}.bst-crumb-btn:hover .bst-chev{color:var(--dsw-alias-label-primary)}.bst-sep{color:var(--dsw-alias-label-tertiary);font-size:12px;user-select:none}.bst-crumb-iconic .bst-crumb-text{position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap}.bst-crumb-sub{font-size:12px;line-height:18px}`)
        // 下拉列表（行内度量与原生 AccountMenu 的 menuitem 一致；卡片沿用原生菜单 surface token）
        insertStyle(`.bst-list{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;min-width:220px;max-width:360px;max-height:calc(100vh - 24px);overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));box-shadow:var(--dsw-elevation-prominent)}.bst-list-sep{height:1px;margin:4px 2px;background:var(--dsw-alias-border-l1);flex:none}.bst-item{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left;box-sizing:border-box}.bst-item:hover:not(:disabled),.bst-item-selected{background:var(--dsw-alias-interactive-bg-hover)}.bst-item:disabled{opacity:.4;cursor:not-allowed}.bst-item-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}.bst-item-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px}.bst-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-item-meta{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.bst-item-more{display:none;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}.bst-item:hover:not(:disabled) .bst-item-more{display:inline-flex}.bst-item:hover:not(:disabled) .bst-item-meta{display:none}.bst-item-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bst-more-menu{display:contents}@media (hover:none){.bst-item-more{display:inline-flex}.bst-item-meta{display:none}}`)
        // 对话框补充样式
        insertStyle(`.bst-dialog-error{font-size:12px;color:var(--dsw-alias-state-error-primary);word-break:break-all}.bst-dialog-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}.bst-btn-danger-outline{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}`)

        // ---------- 注册：会话顶栏 actions 槽 ----------
        // order -40 → 该槽内最前（原生 subagent-catalog 为 -30、agent-team 为 -20、agent-preset 为 -10），
        // 于是面包屑落回「原生标题」所在的位置，成为会话顶栏最前端的元素。
        slots.inject('conversation.session.header.actions', () => slots.register(
          { name: 'conversation.session.header.actions', id: 'bst-breadcrumb', order: -40, label: () => bstT('slot.breadcrumb'), registrant: 'dsh-better-session-title' },
          WorkspaceTitleBreadcrumb,
        ))
      },
    }
    return module.exports
  },
})
