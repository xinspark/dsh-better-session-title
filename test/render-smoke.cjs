// 渲染冒烟：用桩 React / primitives 执行工厂与组件渲染体。
// 目的不是验证外观，而是让「删了代码但还有悬空引用」在提交前就炸出来：
// 真实的 primitives / React 在宿主里才有，所以这里只做最小的执行环境。
// 用法：npm test（或 node test/render-smoke.cjs）
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const file = path.join(__dirname, '..', 'lib', 'client.js')
const src = fs.readFileSync(file, 'utf8')

let captured = null
const win = { __ModuleLoader__: { load: (def) => { captured = def } } }
// eslint-disable-next-line no-new-func
new Function('window', src)(win)
if (!captured || typeof captured.factory !== 'function') throw new Error('factory not captured')

const ReactStub = {
  createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
  Fragment: Symbol('Fragment'),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useRef: (init) => ({ current: init }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useSyncExternalStore: (sub, get) => get(),
  useReducer: (reducer, init) => [init, () => {}],
}
const primitives = new Proxy({}, {
  get: () => (props) => ({ type: 'stub', props }),
})

const modules = {
  react: ReactStub,
  'react-dom': { createPortal: (el) => el },
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}
const exportsObj = captured.factory((name) => {
  if (name in modules) return modules[name]
  throw new Error('unexpected require: ' + name)
})

const registered = []
const list = { items: [], archivedSessionIds: [], pinnedSessionIds: [], byId: {} }
const slots = {
  register: (options, Comp) => { registered.push({ options, Comp }); return () => {} },
  inject: (key, cb) => { cb(); return () => {} },
  entries: () => [],
  subscribe: () => () => {},
}
const locale = { register: () => {}, subscribe: () => () => {}, bind: () => (key) => key }
const shortcuts = { invoke: () => {}, catalog: { subscribe: () => () => {}, getSnapshot: () => [] } }
const configForms = {
  get: () => ({
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, value: { narrowMode: 'crumb', probeLog: false } }),
    set: async () => true,
  }),
}
const ctx = {
  effect: (fn) => { const c = fn(); return typeof c === 'function' ? c : () => {} },
  get: (name) => ({
    slots, workspaces: {}, sessions: {}, uiWorkspace: { pickDirectory: async () => null },
    locale, shortcuts, configForms,
  })[name],
  inject: (names, cb) => { cb(ctx); return () => {} },
}

exportsObj.apply(ctx)

const find = (name) => registered.find((r) => r.options && r.options.name === name)
const crumb = find('conversation.session.header.actions')
const settings = find('plugins.row.config')
if (!crumb) throw new Error('breadcrumb slot not registered')
if (!settings) throw new Error('settings slot not registered')

// 面包屑渲染体（含子智能体链、chip 引用、下拉 items 构建）
const props = {
  sessionId: 's1',
  useWorkspaces: (sel) => sel(list),
  useSessions: (sel) => sel({ byId: {}, projectionsBySession: {} }),
}
const tree = crumb.Comp(props)
if (!tree || typeof tree !== 'object') throw new Error('breadcrumb returned nothing')

// 设置页渲染体
const page = settings.Comp({ view: 'page' })
const summary = settings.Comp({ view: 'summary' })
if (!page || !summary) throw new Error('settings page returned nothing')

console.log('smoke OK: breadcrumb + settings rendered; registered =',
  registered.map((r) => (r.options && (r.options.name + (r.options.key ? '#' + r.options.key : ''))) || '?'))
