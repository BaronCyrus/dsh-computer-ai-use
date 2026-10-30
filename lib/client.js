// The browser half: a settings section for the plugin's version and updates. DSH serves this file
// to the page as it is, so it stays a plain script around its module loader, with no build step.
window.__ModuleLoader__.load({
  id: 'dsh-computer-ai-use',
  factory: require => {
    const react = require('react')
    const h = react.createElement

    const NS = 'settings.computerAiUse'
    const CHANNEL = '/computer-ai-use'

    const zh = {
      nav: 'Computer AI Use',
      intro: '让 DeepSeek Harness 看屏幕、操作鼠标键盘。这里管理插件的版本和更新。',
      versionTitle: '插件版本',
      check: '检查更新',
      checking: '检查中…',
      update: '立即更新',
      updating: '更新中…',
      upToDate: '已是最新版本',
      available: '有新版本 v{version}',
      checkFailed: '暂时连不上 npm，检查不到新版本。',
      restart: '已安装 v{version}，完全退出并重新打开 DSH 后生效。',
      autoTitle: '自动更新',
      autoHint: '有新版本时在后台安装，重新打开 DSH 后生效。为防范有问题的版本，只自动安装发布满 24 小时、经插件官方仓库的发布流程发布的版本。想马上用新版本，可以点“立即更新”。',
      autoLocked: '这个环境不能在这里修改，请在 cordis.patch.yml 里设置 autoUpdate。',
      linked: '当前是本地开发安装，不会自动更新。',
      manual: '这个环境不能在这里更新，请到“插件”页卸载后重新安装。',
      holdCooling: 'v{version} 发布满 24 小时后会自动安装，大约在 {time}。',
      holdDeprecated: 'v{version} 已被作者标记为废弃，不会自动安装。',
      holdUnverified: 'v{version} 不是经插件官方仓库的发布流程发布的，不会自动安装。',
      holdUnknownRuntime: '读不到当前 DSH 的版本，v{version} 不会自动安装。',
      incompatible: 'v{version} 需要其他版本的 DSH，请先更新 DSH。',
      syncing: '安装源还没同步 v{version}，过几分钟再试。',
      syncingFrom: '安装源 {registry} 还没同步 v{version}，过几分钟再试。',
      unreachable: '连不上安装源，请检查网络或代理。',
      unreachableFrom: '连不上安装源 {registry}，请检查网络或代理。',
      busy: '另一项插件操作正在进行，稍后再试。',
      pending: 'pnpm 的发布冷却策略暂不允许安装 v{version}。',
      pendingUntil: 'pnpm 的发布冷却策略暂不允许安装 v{version}，大约 {time} 后可以更新。',
      failed: '更新没有成功，当前版本不受影响。可以到“插件”页卸载后重新安装。',
      saveFailed: '设置没有保存。',
      requestFailed: '读取版本信息失败。',
    }

    const en = {
      nav: 'Computer AI Use',
      intro: 'Lets DeepSeek Harness see the screen and use the mouse and keyboard. Manage the plugin\'s version and updates here.',
      versionTitle: 'Plugin version',
      check: 'Check for updates',
      checking: 'Checking…',
      update: 'Update now',
      updating: 'Updating…',
      upToDate: 'Up to date',
      available: 'v{version} is available',
      checkFailed: 'Could not reach npm to check for a new version.',
      restart: 'v{version} is installed. Quit and reopen DSH to use it.',
      autoTitle: 'Automatic updates',
      autoHint: 'Installs new versions in the background; they take effect when DSH reopens. To guard against a bad release, only versions at least 24 hours old from the release workflow of the plugin\'s official repository install automatically. Choose Update now to get a new version right away.',
      autoLocked: 'This host cannot save the setting here. Set autoUpdate in cordis.patch.yml.',
      linked: 'This is a local development install, so it does not update automatically.',
      manual: 'This host cannot update from here. Uninstall and reinstall on the Plugins page.',
      holdCooling: 'v{version} installs automatically once it is 24 hours old, around {time}.',
      holdDeprecated: 'The author deprecated v{version}, so it will not install automatically.',
      holdUnverified: 'v{version} did not come from the release workflow of the plugin\'s official repository, so it will not install automatically.',
      holdUnknownRuntime: 'Could not read the DSH version, so v{version} will not install automatically.',
      incompatible: 'v{version} needs a different DSH version. Update DSH first.',
      syncing: 'The install source does not have v{version} yet. Try again in a few minutes.',
      syncingFrom: '{registry} does not have v{version} yet. Try again in a few minutes.',
      unreachable: 'Could not reach the install source. Check your network or proxy.',
      unreachableFrom: 'Could not reach {registry}. Check your network or proxy.',
      busy: 'Another plugin operation is running. Try again shortly.',
      pending: 'pnpm\'s release cooldown does not allow v{version} yet.',
      pendingUntil: 'pnpm\'s release cooldown does not allow v{version} until about {time}.',
      failed: 'The update did not complete and the current version still works. You can uninstall and reinstall on the Plugins page.',
      saveFailed: 'The setting was not saved.',
      requestFailed: 'Could not read the version information.',
    }

    const STYLE = `
.cau{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.cau-intro{margin:0;color:var(--dsw-alias-label-tertiary)}
.cau-card{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l4,rgba(127,127,127,.3)));border-radius:var(--dsw-radius-xl,20px);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-2))}
.cau-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;min-height:28px}
.cau-title{margin:0;font-size:15px;font-weight:600;line-height:22px}
.cau-actions{display:flex;flex-wrap:wrap;gap:8px}
.cau-btn{box-sizing:border-box;display:inline-flex;flex:none;align-items:center;justify-content:center;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}
.cau-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.cau-btn:disabled{opacity:.4;cursor:not-allowed}
.cau-btn[data-variant=primary]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.cau-btn[data-variant=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.cau-status{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.cau-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.cau-note{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.cau-error{margin:0;color:var(--dsw-alias-state-error-primary,#ec1313);font-size:12px;line-height:18px}
.cau-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.cau-row-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.cau-switch{position:relative;flex:none;width:36px;height:20px;padding:0;border:none;border-radius:10px;background:var(--dsw-alias-border-l3);cursor:pointer}
.cau-switch[aria-checked=true]{background:var(--dsw-alias-button-primary-fill)}
.cau-switch:disabled{opacity:.4;cursor:not-allowed}
.cau-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.cau-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.cau-switch[aria-checked=true]::after{background:var(--dsw-alias-label-primary-foreground,#fff);transform:translateX(16px)}
@media (prefers-reduced-motion:reduce){.cau-switch::after{transition:none}}
`

    const fill = (text, values) => String(text).replace(/\{(\w+)\}/gu, (match, key) => values?.[key] ?? match)
    const readTime = at => new Date(at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

    const channelCaller = rpc => (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(response => {
      if (!response?.ok) throw new Error(response?.error?.message ?? 'Request failed')
      return response.value
    })

    const Button = ({ variant, ...rest }) => h('button', { type: 'button', className: 'cau-btn', 'data-variant': variant, ...rest })
    const Note = ({ tone, children }) => h('p', {
      className: tone === 'error' ? 'cau-error' : 'cau-note',
      role: tone === 'error' ? 'alert' : 'status',
    }, children)

    function holdNote(info, t) {
      const version = info.latest
      switch (info.hold?.reason) {
        case 'cooling': return fill(t('holdCooling'), { version, time: readTime(info.hold.availableAt) })
        case 'deprecated': return fill(t('holdDeprecated'), { version })
        case 'unverified': return fill(t('holdUnverified'), { version })
        case 'unknown-runtime': return fill(t('holdUnknownRuntime'), { version })
        default: return undefined
      }
    }

    function resultNote(result, t) {
      if (result === undefined) return undefined
      const values = { version: result.version, registry: result.registry, time: result.availableAt === undefined ? undefined : readTime(result.availableAt) }
      if (result.pending === true) return { text: fill(t(result.availableAt === undefined ? 'pending' : 'pendingUntil'), values) }
      switch (result.failed) {
        case undefined: return undefined
        case 'syncing': return { text: fill(t(result.registry === undefined ? 'syncing' : 'syncingFrom'), values) }
        case 'busy': return { text: t('busy') }
        case 'unreachable': return { tone: 'error', text: fill(t(result.registry === undefined ? 'unreachable' : 'unreachableFrom'), values) }
        case 'incompatible': return { tone: 'error', text: fill(t('incompatible'), values) }
        case 'unsupported': return { tone: 'error', text: t('manual') }
        default: return { tone: 'error', text: t('failed') }
      }
    }

    function UpdateCards({ call, t }) {
      const [info, setInfo] = react.useState()
      const [loading, setLoading] = react.useState(true)
      const [readFailed, setReadFailed] = react.useState(false)
      const [installing, setInstalling] = react.useState(false)
      const [installFailed, setInstallFailed] = react.useState(false)
      const [saving, setSaving] = react.useState(false)
      const [saveFailed, setSaveFailed] = react.useState(false)
      const generation = react.useRef(0)

      const load = force => {
        const current = ++generation.current
        setLoading(true)
        setReadFailed(false)
        return call('update/status', { force }).then(value => {
          if (generation.current === current) setInfo(value)
        }).catch(() => {
          if (generation.current === current) setReadFailed(true)
        }).finally(() => {
          if (generation.current === current) setLoading(false)
        })
      }

      react.useEffect(() => {
        void load(false)
        return () => { generation.current += 1 }
      }, [])

      const install = () => {
        setInstalling(true)
        setInstallFailed(false)
        call('update/install')
          .catch(() => setInstallFailed(true))
          .then(() => load(false))
          .finally(() => setInstalling(false))
      }

      const toggle = () => {
        const enabled = info.auto.enabled !== true
        setSaving(true)
        setSaveFailed(false)
        call('update/auto', { enabled })
          .then(() => setInfo(current => ({ ...current, auto: { ...current.auto, enabled } })))
          .catch(() => setSaveFailed(true))
          .finally(() => setSaving(false))
      }

      const kind = info?.install?.kind
      const canUpdate = info?.updateAvailable === true && info.canInstall && info.compatible
      const status = info === undefined ? undefined : h('div', { className: 'cau-status', role: 'status' },
        h('b', null, `v${info.current}`),
        h('span', { className: 'cau-meta' }, info.updateAvailable
          ? fill(t('available'), { version: info.latest })
          : info.checkFailed ? t('checkFailed') : info.installed === undefined && t('upToDate')))
      const result = info === undefined ? undefined : resultNote(info.lastResult, t)
      const hold = info === undefined || info.auto.enabled !== true ? undefined : holdNote(info, t)

      return h(react.Fragment, null,
        h('section', { className: 'cau-card' },
          h('header', { className: 'cau-head' },
            h('h3', { className: 'cau-title' }, t('versionTitle')),
            h('span', { className: 'cau-actions' },
              canUpdate && h(Button, { variant: 'primary', disabled: installing, onClick: install }, installing ? t('updating') : t('update')),
              h(Button, { disabled: loading || installing, onClick: () => load(true) }, loading ? t('checking') : t('check')))),
          status,
          readFailed && h(Note, { tone: 'error' }, t('requestFailed')),
          info?.installed !== undefined && h(Note, null, fill(t('restart'), { version: info.installed })),
          kind === 'link' && h(Note, null, t('linked')),
          info?.updateAvailable === true && !info.canInstall && kind !== 'link' && h(Note, null, t('manual')),
          info?.updateAvailable === true && !info.compatible && h(Note, { tone: 'error' }, fill(t('incompatible'), { version: info.latest })),
          result !== undefined && h(Note, { tone: result.tone }, result.text),
          installFailed && h(Note, { tone: 'error' }, t('failed'))),
        info !== undefined && h('section', { className: 'cau-card' },
          h('div', { className: 'cau-row' },
            h('div', { className: 'cau-row-text' },
              h('h3', { className: 'cau-title', id: 'cau-auto-title' }, t('autoTitle')),
              h('p', { className: 'cau-note' }, t('autoHint'))),
            h('button', {
              type: 'button',
              role: 'switch',
              className: 'cau-switch',
              'aria-checked': info.auto.enabled === true,
              'aria-labelledby': 'cau-auto-title',
              disabled: saving || !info.auto.writable,
              onClick: toggle,
            })),
          !info.auto.writable && h(Note, null, t('autoLocked')),
          hold !== undefined && h(Note, null, hold),
          saveFailed && h(Note, { tone: 'error' }, t('saveFailed'))))
    }

    function Section({ rpc, t }) {
      const call = react.useMemo(() => channelCaller(rpc), [rpc])
      return h('div', { className: 'cau' },
        h('p', { className: 'cau-intro' }, t('intro')),
        h(UpdateCards, { call, t }))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'computer-ai-use: copy')
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-computer-ai-use'
        tag.textContent = STYLE
        document.head.append(tag)
        return () => tag.remove()
      }, 'computer-ai-use: style')
      const connection = ctx.get('connection')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'computer-ai-use',
        order: 18,
        label: () => t('nav'),
        locale: NS,
        inject: () => ({ rpc: connection.rpc, t }),
      }, Section))
    }

    return { inject: ['slots', 'locale', 'connection'], apply }
  },
})
