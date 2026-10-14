// ============================================================================
// Better Session Title（dsh-better-session-title）· 浏览器端（Client）
// ----------------------------------------------------------------------------
// 本文件是插件的浏览器半，通过 UMD 包装注册到 DSH 的 clientModules。
//
// 定位：把会话顶栏中央的原生会话标题，替换为「工作区 / 会话」两级面包屑。
//
// 复用原生原则：
//   * 下拉列表 —— 自绘弹出层，但样式逐值复刻原生 Menu.module.css
//     （行高 40、padding 8/10、圆角 10、hover 背景、shadow/边框同款 token）。
//     原生 Menu 的 itemLabel 带 overflow:hidden 且选中态只有对勾，无法承载
//     「与 hover 一致的整行高亮」，故列表层自绘、视觉与原生完全一致。
//     列表行规范：行内不显示工作区/会话图标（仅「添加工作区」「新建会话」
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
// 与 dsh-basic-right-sidebar 的关系：本插件是 dsh-basic-right-sidebar 的子插件（随其 bundle 安装，
// 由 dsh-basic-right-sidebar 的 cordis.patch.yml 插入插件行、package.json 声明依赖）。
// 顶栏面包屑由本插件独占提供；父插件的「启用会话顶栏工作区/会话面包屑」设置
// 通过全局快照 window.__BASRS_SETTINGS__ 与 'basrs:settings' CustomEvent 桥接
// （见 WorkspaceTitleBreadcrumb 中的订阅），关闭时本插件隐藏面包屑并恢复原生标题。
// 本插件也可单独安装使用（无父插件时设置桥接缺省为启用）。
// ============================================================================
window.__ModuleLoader__.load({
  id: 'dsh-better-session-title',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')
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
    } = require('@deepseek-ai/dsh-client-ui-primitives')

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
      'crumb.workspaceNone': '未关联工作区', 'crumb.sessionNone': '新会话',
      'crumb.addWorkspace': '添加工作区', 'crumb.noWorkspaces': '暂无工作区', 'crumb.newSession': '新建会话', 'crumb.noSessions': '当前工作区暂无会话',
      'crumb.rename': '重命名', 'crumb.remove': '删除工作区', 'crumb.fork': '分支', 'crumb.archive': '归档会话',
      'menu.more': '更多',
      'dialog.renameWsTitle': '重命名工作区', 'dialog.renameWsPlaceholder': '工作区名称', 'dialog.renameWsDuplicate': '已存在同名工作区',
      'dialog.renameSessionTitle': '重命名会话', 'dialog.renameSessionPlaceholder': '会话标题',
      'dialog.deleteWsTitle': '删除工作区', 'dialog.deleteWsBody': '确定删除工作区「{name}」吗？其会话将移入未分组。此操作不可撤销。',
      'dialog.pickerErrorTitle': '添加工作区失败', 'dialog.close': '关闭',
      'dialog.confirm': '确定', 'dialog.cancel': '取消',
      'dialog.busy': '处理中…', 'dialog.failed': '操作失败：{error}',
      'rel.justNow': '刚刚', 'rel.minutes': '{n}分钟', 'rel.hours': '{n}小时', 'rel.days': '{n}天', 'rel.months': '{n}个月', 'rel.years': '{n}年',
    }
    const BST_EN = {
      'slot.breadcrumb': 'Workspace/Session',
      'crumb.workspaceNone': 'No workspace', 'crumb.sessionNone': 'New session',
      'crumb.addWorkspace': 'Add workspace', 'crumb.noWorkspaces': 'No workspaces', 'crumb.newSession': 'New session', 'crumb.noSessions': 'No sessions in this workspace',
      'crumb.rename': 'Rename', 'crumb.remove': 'Delete workspace', 'crumb.fork': 'Fork', 'crumb.archive': 'Archive session',
      'menu.more': 'More',
      'dialog.renameWsTitle': 'Rename workspace', 'dialog.renameWsPlaceholder': 'Workspace name', 'dialog.renameWsDuplicate': 'A workspace with this name already exists',
      'dialog.renameSessionTitle': 'Rename session', 'dialog.renameSessionPlaceholder': 'Session title',
      'dialog.deleteWsTitle': 'Delete workspace', 'dialog.deleteWsBody': 'Delete workspace "{name}"? Its sessions move to the ungrouped list. This cannot be undone.',
      'dialog.pickerErrorTitle': 'Add workspace failed', 'dialog.close': 'Close',
      'dialog.confirm': 'Confirm', 'dialog.cancel': 'Cancel',
      'dialog.busy': 'Working…', 'dialog.failed': 'Action failed: {error}',
      'rel.justNow': 'just now', 'rel.minutes': '{n}m', 'rel.hours': '{n}h', 'rel.days': '{n}d', 'rel.months': '{n}mo', 'rel.years': '{n}y',
    }

    module.exports = {
      name: 'Better Session Title',
      apply(ctx) {
        ctx.effect(() => () => { for (const tag of styleTags.splice(0)) tag.remove() }, 'bst: styles')
        const slots = ctx.get('slots')
        if (slots === undefined) return
        const workspaces = ctx.get('workspaces')
        const sessions = ctx.get('sessions')
        // 0.2.0-rc.2：目录选择器与「打开会话 / 打开工作区」搬到 uiWorkspace 服务；
        // workspaces / sessions 只保留列表与 CRUD（rename / delete / create / fork / binding 仍在）。
        // 服务缺失时保持 undefined，各动作静默不执行（与旧行为一致）。
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
          return React.createElement('div', {
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
          const wsAnchorRef = React.useRef(null)
          const ssAnchorRef = React.useRef(null)
          // ---------- 父插件（dsh-basic-right-sidebar）设置桥接 ----------
          // showBreadcrumb=false → 挂 .bst-crumbs-off：面包屑隐藏、原生标题恢复。
          // 单独安装（无父插件）时快照/事件缺失 → 恒为启用，行为与旧版一致。
          // 初始值读全局快照（父插件 apply 时同步写入）；后续变化走 CustomEvent。
          const [enabled, setEnabled] = React.useState(() => {
            try {
              const s = globalThis.__BASRS_SETTINGS__
              return s === undefined || s === null ? true : s.showBreadcrumb !== false
            } catch { return true }
          })
          React.useEffect(() => {
            function onBasrsSettings(e) {
              if (e && e.detail && typeof e.detail.showBreadcrumb === 'boolean') {
                setEnabled(e.detail.showBreadcrumb)
              }
            }
            window.addEventListener('basrs:settings', onBasrsSettings)
            return () => window.removeEventListener('basrs:settings', onBasrsSettings)
          }, [])
          // 空间不足时自动折叠为图标面包屑：内容溢出 → 隐藏文本只留图标（点击仍开菜单）。
          // compact 状态用 ref 同步跟踪（update 闭包需要读最新值，不能依赖 effect 旧闭包）；
          // fullWidthRef 记录完整文本形态的固有宽度，用于「恢复完整形态」的滞回判定。
          const [compact, setCompactState] = React.useState(false)
          const compactRef = React.useRef(false)
          const fullWidthRef = React.useRef(0)
          const setCompact = (v) => { compactRef.current = v; setCompactState(v) }
          const ref = React.useRef(null)
          React.useEffect(() => {
            const el = ref.current
            if (!el) return
            const header = el.closest('header')
            const target = header || el
            const update = () => {
              try {
                if (target.clientWidth === 0) return
                const overflow = target.scrollWidth > target.clientWidth + 2
                if (!compactRef.current) {
                  if (el.scrollWidth > fullWidthRef.current) fullWidthRef.current = el.scrollWidth
                  setCompact(overflow)
                } else {
                  const enough = target.clientWidth >= fullWidthRef.current + 180
                  if (enough && !overflow) setCompact(false)
                }
              } catch { /* ignore */ }
            }
            update()
            const ro = new ResizeObserver(update)
            ro.observe(target)
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
          // 注意：这里不能有全局 mousedown「点击外部关闭」监听——
          // mousedown 先于 click 派发，会把列表先行卸载，行内 click 全部丢失。
          // 点击外部关闭已由 BstList 的 pointerdown 监听负责（且排除了锚按钮）。
          const currentWs = items.find((w) => w.sessionIds.includes(sessionId))
            || items.find((w) => w.workspaceId === bstRecentWorkspaceId(items, byId))
            || null
          const currentSession = byId[sessionId]
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
            if (!uiWorkspace || !sessions) return
            try {
              const members = w.sessionIds
                .map((id) => byId[id])
                .filter(sessionVisible)
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
              if (members.length > 0) {
                uiWorkspace.openSession(members[0].id)
                return
              }
              const sid = await uiWorkspace.connectWorkspace(w.workspaceId)
              uiWorkspace.openSession(sid)
            } catch { /* ignore */ }
          }
          const newWorkspace = async () => {
            setWsOpen(false)
            if (!workspaces || !uiWorkspace) return
            setWsError(null)
            try {
              const path = await uiWorkspace.pickDirectory()
              if (!path) return // 用户在目录选择器中取消：正常，无需反馈
              const view = await workspaces.create({ path })
              const sid = await uiWorkspace.connectWorkspace(view.workspaceId)
              uiWorkspace.openSession(sid)
            } catch (e) {
              // 失败必须可见（原生 WorkspacePickFlow 用错误对话框 + 可重试）
              setWsError((e && e.message) || String(e))
            }
          }
          const newSession = async () => {
            setSsOpen(false)
            if (!uiWorkspace || !currentWs) return
            try {
              const sid = await uiWorkspace.connectWorkspace(currentWs.workspaceId)
              uiWorkspace.openSession(sid)
            } catch { /* ignore */ }
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
            if (!uiWorkspace) return
            try {
              // 原生 forkSession：sessions.fork({sessionId, increaseTitle:true}) → 打开子会话
              const newId = await uiWorkspace.forkSession(s.id)
              uiWorkspace.openSession(newId)
            } catch { /* 与原生一致：fork 失败保持当前选择 */ }
          }
          const archiveSession = async (s) => {
            setSsOpen(false)
            if (!workspaces) return
            try { await workspaces.archiveSession(s.id) } catch { /* 与原生一致：归档失败为控制台诊断 */ }
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
                  // 行内不显示工作区图标（节省空间）；仅「添加工作区」动作行保留图标
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

          return React.createElement(React.Fragment, null,
            React.createElement('div', { ref: ref, className: 'bst-crumbs' + (compact ? ' bst-crumbs-compact' : '') + (enabled ? '' : ' bst-crumbs-off') },
              // ---------- 工作区面包屑 ----------
              React.createElement('div', { className: 'bst-crumb' },
                React.createElement('button', {
                  ref: wsAnchorRef, type: 'button', className: 'bst-crumb-btn',
                  title: currentWs ? currentWs.title : bstT('crumb.workspaceNone'),
                  onClick: () => { setWsOpen((o) => !o); setSsOpen(false) },
                },
                  React.createElement(IconFolderCloseRegular, null),
                  React.createElement('span', { className: 'bst-crumb-text' }, (currentWs && currentWs.title) || bstT('crumb.workspaceNone')),
                  React.createElement(wsOpen ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, null),
                ),
              ),
              React.createElement('span', { className: 'bst-sep', 'aria-hidden': true }, '/'),
              // ---------- 会话面包屑 ----------
              React.createElement('div', { className: 'bst-crumb' },
                React.createElement('button', {
                  ref: ssAnchorRef, type: 'button', className: 'bst-crumb-btn bst-crumb-btn-sub',
                  title: currentSession ? currentSession.displayTitle : bstT('crumb.sessionNone'),
                  onClick: () => { setSsOpen((o) => !o); setWsOpen(false) },
                },
                  React.createElement(IconQueueOutlineRegular, null),
                  React.createElement('span', { className: 'bst-crumb-text' }, currentSession ? currentSession.displayTitle : bstT('crumb.sessionNone')),
                  React.createElement(ssOpen ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, null),
                ),
              ),
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
              title: bstT('dialog.pickerErrorTitle'),
              footer: React.createElement(Button, { variant: 'primary', onClick: () => setWsError(null) }, bstT('dialog.close')),
            },
              wsError !== null ? React.createElement('div', { className: 'bst-dialog-error', role: 'alert' }, wsError) : null,
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
        // bst-crumbs-off：父插件（dsh-basic-right-sidebar）设置关闭面包屑时挂载，此时
        // 不隐藏原生标题（恢复原生顶栏），面包屑自身也隐藏（.bst-crumbs-off）。
        // 0.2.0-rc.2 标题结构：header[data-conversation-header] > div[data-conversation-title-row]
        //   > div.titleCluster > [ nav.crumbs（原生标题）, div.headerActions（本面包屑） ]
        // 用官方稳定 data 属性限定，既隐藏原生标题又不依赖哈希类名；关闭面包屑时规则不命中，
        // 原生标题自动恢复（无需额外 JS）。
        insertStyle(`div[data-conversation-title-row]:has(.bst-crumbs:not(.bst-crumbs-off)) nav{display:none}`)
        // 面包屑 + 下拉列表（复刻原生 Menu.module.css）+ 对话框补充样式
        insertStyle(`.bst-crumbs{display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1}.bst-crumbs-off{display:none}.bst-crumb{position:relative;min-width:0}.bst-crumb-btn{display:flex;align-items:center;gap:5px;border:none;background:transparent;border-radius:10px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;cursor:pointer;max-width:180px;min-width:0;padding:3px 6px;min-height:28px}.bst-crumb-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.bst-crumb-btn:active{background:var(--dsw-alias-interactive-bg-active)}.bst-crumb-btn-sub{color:var(--dsw-alias-label-secondary)}.bst-crumb-btn-sub:hover{color:var(--dsw-alias-label-primary)}.bst-crumb-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-crumb-btn svg{flex-shrink:0;color:var(--dsw-alias-label-tertiary)}.bst-sep{color:var(--dsw-alias-label-tertiary);font-size:12px;user-select:none}.bst-crumbs-compact .bst-crumb-text{display:none}.bst-crumbs-compact .bst-crumb-btn{gap:0;padding:3px 5px;max-width:none;min-height:28px}.bst-crumbs-compact .bst-sep{display:none}`)
        // 下拉列表（复刻原生 Menu 规范：行高 40 / padding 8-10 / 圆角 10 / 同款 token）
        insertStyle(`.bst-list{position:fixed;z-index:1100;box-sizing:border-box;display:flex;flex-direction:column;min-width:220px;max-width:360px;max-height:calc(100vh - 24px);overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));box-shadow:var(--dsw-elevation-prominent)}.bst-list-sep{height:1px;margin:4px 2px;background:var(--dsw-alias-border-l1);flex:none}.bst-item{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);text-align:left;box-sizing:border-box}.bst-item:hover:not(:disabled),.bst-item-selected{background:var(--dsw-alias-interactive-bg-hover)}.bst-item:disabled{opacity:.4;cursor:not-allowed}.bst-item-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}.bst-item-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px}.bst-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bst-item-meta{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}.bst-item-more{display:none;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}.bst-item:hover:not(:disabled) .bst-item-more{display:inline-flex}.bst-item:hover:not(:disabled) .bst-item-meta{display:none}.bst-item-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.bst-more-menu{display:contents}@media (hover:none){.bst-item-more{display:inline-flex}.bst-item-meta{display:none}}`)
        // 对话框补充样式
        insertStyle(`.bst-dialog-error{font-size:12px;color:var(--dsw-alias-state-error-primary);word-break:break-all}.bst-dialog-note{font-size:12px;color:var(--dsw-alias-label-tertiary)}.bst-btn-danger-outline{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}`)

        // ---------- 注册：会话顶栏 actions 槽（order -20 → 顶栏最左侧，成为标题位） ----------
        slots.inject('conversation.session.header.actions', () => slots.register(
          { name: 'conversation.session.header.actions', id: 'bst-breadcrumb', order: -20, label: () => bstT('slot.breadcrumb'), registrant: 'dsh-better-session-title' },
          WorkspaceTitleBreadcrumb,
        ))
      },
    }
    return module.exports
  },
})
