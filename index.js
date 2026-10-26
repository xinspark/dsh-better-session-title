// dsh-better-session-title · host 半
// 本插件是纯客户端 UI 插件：界面逻辑全在浏览器半（lib/client.js）。
// host 半只承担一件事 —— **声明两项配置的 schema**，让浏览器端插件详情页
// （`plugins.row.config`）有可读写的东西：
//   · narrowTitle：顶栏放不下完整面包屑时，改用原生会话标题（关＝保留面包屑图标态）；
//   · probeLog   ：探针日志开关（默认关）。
//
// 两条硬规则来自 dsh-settings：
//   ① 只有标了 `.volatile()` 的字段才会进设置表单（`volatileForm()` 递归取 volatile 字段，
//      一个都没有时整行不出现）——所以两个字段都标上；
//   ② 写入落在当前 profile 的 Cordis patch（`profiles/<name>/cordis.patch.yml`），
//      对 volatile 字段而言下一次读取即生效，无需重启。
import z from '@deepseek-ai/schemastery'

export const name = 'Better Session Title'

// 命名空间 = bundle 行的 id（`cordis.patch.yml` 里 insert 的 `dsh-better-session-title`）。
// 默认值必须与 lib/client.js 里的 `bstSettings` 初值一致：面包屑 + 日志关 ——
// 老用户升级后行为与 1.3.2 完全相同，控制台也保持安静。
export const Config = z.object({
  narrowTitle: z.boolean().default(false).volatile(),
  probeLog: z.boolean().default(false).volatile(),
})

export function apply(ctx) {
  // 本插件自带详情页（lib/client.js 注册 `plugins.row.config`），所以把「按 schema 自动
  // 生成的表单」关掉，免得同一个页面上出现两份设置。官方约定：在 `ctx.inject(['settings'], …)`
  // 子级里注册 `configure({ auto: false }, ctx.fiber)`，并交给 ctx.effect 管理生命周期；
  // 组合里没有 settings 服务时这段根本不执行，插件照常工作。
  ctx.inject(['settings'], (ctx) => {
    ctx.effect(
      () => ctx.settings.configure({ auto: false }, ctx.fiber),
      'better-session-title: settings presentation',
    )
  })
}
