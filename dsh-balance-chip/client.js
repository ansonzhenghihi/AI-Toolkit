window.__ModuleLoader__.load({
  id: '@local/dsh-balance-chip',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // The account Remote carries this build identity to the Host, which derives the Platform
    // client headers from it. The shipped client inlines the same version string.
    const CLIENT_VERSION = '0.2.2-rc.5'

    // Which balance a provider's models are billed against. Only the signed-in DeepSeek account
    // has a source today; a custom model (API key, local model, ...) has none, so the chip keeps
    // its seat but renders nothing. Token-plan and credit balances extend this table with their own
    // provider ids and readers.
    const BALANCE_SOURCES = {
      'deepseek-account': 'account',
    }

    const ZH = {
      'balance.label': '余额',
      'balance.bonus': '赠送',
      'balance.unavailable': '余额不可用',
      'balance.refresh': '刷新余额',
    }
    const EN = {
      'balance.label': 'Balance',
      'balance.bonus': 'Bonus',
      'balance.unavailable': 'Balance unavailable',
      'balance.refresh': 'Refresh balance',
    }

    // Theme tokens only, so the chip follows light and dark appearance. This chip opens no fixed
    // overlay, so nothing needs to portal out of the docked composer.
    const STYLE = `
.dsh-balance-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 2px;
  font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;
  font-variant-numeric:tabular-nums}
.dsh-balance-chip__amount{color:var(--dsw-alias-label-primary)}
.dsh-balance-chip__separator{color:var(--dsw-alias-border-l4)}
.dsh-balance-chip__bonus{color:var(--dsw-alias-label-secondary)}
.dsh-balance-chip__refresh{display:inline-flex;align-items:center;justify-content:center;
  width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-md,6px);
  background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-balance-chip__refresh:hover{background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-primary)}
.dsh-balance-chip__refresh:disabled{cursor:default;opacity:.5}
.dsh-balance-chip__spinning{animation:dsh-balance-chip-spin 900ms linear infinite}
@keyframes dsh-balance-chip-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dsh-balance-chip__spinning{animation:none}}
`

    /**
     * Format a Platform wallet balance the way the account settings page does: grouped digits,
     * two decimals truncated for positive amounts, and a sub-cent floor.
     */
    function formatAmount(amount, symbol) {
      const value = Number(amount)
      if (!Number.isFinite(value)) return symbol + String(amount)
      if (value === 0) return symbol + '0.00'
      if (value < 0) {
        const magnitude = Math.floor(Math.abs(value) * 100) / 100
        return '-' + symbol + (magnitude < 0.01 ? '0.01' : group(magnitude.toFixed(2)))
      }
      if (value < 0.01) return '<' + symbol + '0.01'
      return symbol + group((Math.floor(value * 100) / 100).toFixed(2))
    }

    function group(text) {
      const [integer, fraction] = text.split('.')
      return Number(integer).toLocaleString('en-US') + '.' + fraction
    }

    function symbolOf(currency) {
      return currency === 'CNY' ? '¥' : '$'
    }

    function walletText(wallets) {
      return wallets.map(wallet => formatAmount(wallet.balance, symbolOf(wallet.currency))).join(' ')
    }

    function codeError(code, message, detail) {
      const error = new Error(message)
      error.balanceCode = code
      error.balanceDetail = detail
      return error
    }

    function detailOf(error) {
      const detail = error?.balanceDetail
      const text = detail === undefined ? (error?.message ?? String(error)) : JSON.stringify(detail)
      return String(text).slice(0, 240)
    }

    function createChip(ctx) {
      const activeLocale = () => {
        try {
          const snapshot = ctx.locale.getSnapshot()
          return typeof snapshot?.active === 'string' && snapshot.active !== '' ? snapshot.active : 'en'
        } catch {
          return 'en'
        }
      }

      /** Read the signed-in DeepSeek account's recharge and bonus wallets. */
      const readAccountBalance = async () => {
        const account = ctx.remote?.account
        if (typeof account?.getBalance !== 'function') {
          throw codeError('E1', 'account remote unavailable', {
            hasRemote: Boolean(ctx.remote),
            accountType: typeof account,
          })
        }
        const raw = await account.getBalance({
          version: CLIENT_VERSION,
          locale: activeLocale(),
          // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        })
        const wrapped = raw !== null && typeof raw === 'object' && 'ok' in raw
        if (wrapped && raw.ok !== true) throw codeError('E2', 'account balance read failed', raw)
        const value = wrapped ? raw.value : raw
        if (value && value.status === 'failed') throw codeError('E3', 'account balance unavailable')
        if (value === undefined) throw codeError('E4', 'empty balance result')
        return value
      }

      const sources = {
        account: { read: readAccountBalance },
      }

      return function BalanceChip(props) {
        const dictionary = activeLocale().toLowerCase().startsWith('zh') ? ZH : EN
        const t = typeof props.t === 'function'
          ? props.t
          : (key) => dictionary[key] ?? key

        // The composer's model seat and this chip share one per-session model directory, so the
        // selected provider - including a switch made in the menu - is already here.
        const store = props.directoryStore
        const subscribe = React.useCallback(
          (listener) => (store === undefined ? () => {} : store.subscribe(listener)),
          [store],
        )
        const getSnapshot = React.useCallback(
          () => (store === undefined ? undefined : store.getSnapshot()),
          [store],
        )
        const directory = React.useSyncExternalStore(subscribe, getSnapshot)
        const provider = directory?.current?.provider
        // No provider (catalog still loading) is treated like no source: never claim a balance the
        // selected route does not spend.
        const sourceName = provider === undefined ? undefined : BALANCE_SOURCES[provider]
        const source = sourceName === undefined ? undefined : sources[sourceName]

        const [state, setState] = React.useState({
          phase: 'idle', value: undefined, busy: false, code: '', message: '', detail: '',
        })
        const mounted = React.useRef(true)
        const sourceRef = React.useRef(source)
        sourceRef.current = source

        React.useEffect(() => () => { mounted.current = false }, [])

        const load = React.useCallback(async () => {
          const current = sourceRef.current
          if (current === undefined) return
          setState(previous => ({ ...previous, phase: 'loading', busy: true }))
          try {
            const value = await current.read()
            if (mounted.current) setState({ phase: 'ready', value, busy: false, code: '', message: '', detail: '' })
          } catch (error) {
            if (mounted.current) {
              setState({
                phase: 'failed',
                value: undefined,
                busy: false,
                code: error?.balanceCode ?? 'E5',
                message: typeof error?.message === 'string' ? error.message : String(error),
                detail: detailOf(error),
              })
            }
            console.error('[balance-chip] balance read failed', error)
          }
        }, [])

        // Read on entry and whenever the selected provider starts having a source; a route without
        // one leaves the seat empty and issues no request.
        React.useEffect(() => {
          if (source === undefined) return
          mounted.current = true
          void load()
        }, [source, load])

        if (source === undefined) return null

        const value = state.value
        const walletList = value && value.status === 'ready' ? value.value : []
        const bonusList = value && value.status === 'ready'
          ? value.bonusWallets.filter(wallet => Number(wallet.balance) > 0)
          : []
        const failed = state.phase === 'failed' || (value !== undefined && value !== null && value.status === 'failed')
        const ready = state.phase === 'ready' && value !== undefined && value !== null && !failed

        // Signed out, or nothing to report yet: stay out of the composer toolbar entirely.
        if (!failed && !ready) return null

        const rechargeText = walletList.length > 0 ? walletText(walletList) : undefined
        const bonusText = bonusList.length > 0 ? walletText(bonusList) : undefined
        const label = t('balance.label')
        const bonusLabel = t('balance.bonus')

        const summary = failed
          ? t('balance.unavailable')
            + (state.code ? ' · ' + state.code : '')
            + (state.message ? ' ' + state.message : '')
            + (state.detail ? '\n' + state.detail : '')
          : [label + ' ' + (rechargeText ?? '—'), bonusText ? bonusLabel + ' ' + bonusText : undefined]
            .filter(Boolean).join('  ')

        return h(React.Fragment, null,
          h('style', { key: 'style' }, STYLE),
          h('div', {
            key: 'chip',
            className: 'dsh-balance-chip',
            title: summary,
            'data-provider': provider,
            'data-error-code': failed ? state.code : undefined,
          },
            failed
              ? h('span', { className: 'dsh-balance-chip__bonus' }, t('balance.unavailable'))
              : h(React.Fragment, null,
                h('span', { className: 'dsh-balance-chip__amount' }, rechargeText ?? '—'),
                bonusText
                  ? h('span', { className: 'dsh-balance-chip__separator', 'aria-hidden': true }, '·')
                  : null,
                bonusText
                  ? h('span', { className: 'dsh-balance-chip__bonus' }, bonusLabel + ' ' + bonusText)
                  : null,
              ),
            h('button', {
              type: 'button',
              className: 'dsh-balance-chip__refresh',
              title: t('balance.refresh'),
              'aria-label': t('balance.refresh'),
              disabled: state.busy,
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                void load()
              },
            }, h('svg', {
              className: state.busy ? 'dsh-balance-chip__spinning' : undefined,
              viewBox: '0 0 12 12',
              width: 12,
              height: 12,
              'aria-hidden': true,
            },
            h('path', {
              d: 'M10.1 6a4.1 4.1 0 1 1-1.35-3.02',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.3,
              strokeLinecap: 'round',
            }),
            h('path', {
              d: 'M10.3 2.2v2.6H7.7',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.3,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }))),
          ),
        )
      }
    }

    return {
      // `remote.account` and `modelDirectories` are nested Cordis services: reading their members
      // without injecting them throws, so both are declared exactly as the shipped plugins do.
      inject: ['slots', 'locale', 'remote', 'remote.account', 'modelDirectories'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('balanceChip', { zh: ZH, en: EN }), 'balance-chip: dictionaries')
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'balance-chip',
          order: 10,
          locale: 'balanceChip',
          // The seat learns its Session's selected provider from the shared model directory.
          // A session the directory refuses (addressed subagents) keeps the seat but has no source.
          inject: (sessionId) => {
            let directoryStore
            try {
              directoryStore = ctx.modelDirectories.directoryFor(sessionId).store
            } catch {
              directoryStore = undefined
            }
            return { directoryStore }
          },
        }, createChip(ctx)))
      },
    }
  },
})
