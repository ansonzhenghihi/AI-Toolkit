# dsh-balance-chip

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 DSH）加一个小徽标：**在对话输入框的模型选择器旁显示 DeepSeek 账户余额**，带一个刷新按钮。

> **当前只支持 DeepSeek 账号余额。** 详见下面的[支持范围](#支持范围重要)。

## 支持范围（重要）

| 场景 | 是否显示 | 说明 |
| --- | --- | --- |
| 已登录 DeepSeek 账号，模型属于 `deepseek-account` | ✅ 显示 | 充值余额 + 赠送余额 |
| 只用 API Key（`deepseek` 等 provider） | ❌ 不显示 | API Key 没有账户余额可读 |
| 自定义模型 / 第三方模型 / 本地模型 | ❌ 不显示 | 按设计隐藏，位置保留 |
| tokenplan 余额、积分余额 | 🚧 未实现 | 已预留扩展点，见[扩展](#扩展接入-tokenplan--积分) |
| 未登录 | ❌ 不显示 | 无凭据时不渲染任何内容 |

一句话：**这是「DeepSeek 账号余额」的显示件，不是通用的用量面板。**

## 效果

- 位置：输入框工具行里，紧贴模型选择器左侧（`conversation.input.right` 槽，order 10）。
- 内容：`¥12.34 · 赠 ¥5.00` —— 充值余额用主文字色，赠送余额用次要文字色；赠送为 0 时整段省略。
- 刷新：右侧圆形箭头按钮，点击重新读取；读取中图标转圈并禁用。
- 格式：与 DSH 账户设置页一致——千分位分组、正数截断到分、不足一分显示 `<¥0.01`；CNY / USD 各自显示。
- 失败：显示「余额不可用」+ 刷新按钮可原地重试，具体原因放在悬停提示里。
- 换模型即时生效：徽标订阅的是和模型选择器同一个 per-session 模型目录，切到无来源的 provider 会立刻消失，切回来会自动重读一次。

## 安装

### 方式一：DSH 界面（推荐）

1. 把本目录放到本机任意位置；
2. 打开 DSH Web → **设置 → 插件 → 添加插件**，选择本目录；
3. 重启 `dsh web`，然后强制刷新浏览器（Ctrl/Cmd + Shift + R）。

### 方式二：命令行

```sh
dsh plugin --profile web add <本目录的绝对路径>
```

装完同样需要重启 `dsh web` 并强制刷新。

### 从仓库安装

本插件是 AI-Toolkit 仓库的子目录，pnpm 不能直接安装仓库内的子目录，所以先克隆再指向本地路径：

| 平台 | 仓库地址 |
| --- | --- |
| GitHub | https://github.com/ansonzhenghihi/AI-Toolkit |
| Gitee | https://gitee.com/anson654321/AI-Toolkit |

```sh
git clone https://github.com/ansonzhenghihi/AI-Toolkit.git ai-toolkit
# 国内网络可改用 Gitee 镜像
# git clone https://gitee.com/anson654321/AI-Toolkit.git ai-toolkit
dsh plugin --profile web add <克隆后的路径>/dsh-balance-chip
```

### 卸载

**设置 → 插件** 里移除，或用管理命令 `remove_bundle` 删掉 `dsh-balance-chip`。

## 隐私与安全

- **本仓库不包含任何账号信息**：没有账号 ID、UID、手机号/邮箱、令牌、Cookie、余额截图、私有链接，也没有本机绝对路径；README 中的地址仅为公开仓库链接。
- 余额只在本机浏览器渲染层显示；读取经由 DSH Host 已有的 `account` 能力转发到 DeepSeek 官方平台接口，**插件本身不接触凭据、不写入任何文件**。
- 读取失败时只在浏览器控制台输出错误类型与接口名，不输出余额数值；插件不采集、不上报，也没有任何第三方请求。
- 扫描或审核代码时可以直接看 `client.js`：唯一的网络调用是 `ctx.remote.account.getBalance()`。

## 工作原理

| 文件 | 角色 |
| --- | --- |
| `index.js` | Host 半，空的 `apply()`；本插件不在 Node 侧做任何事 |
| `client.js` | Client 半，全部逻辑：读 provider、调余额、渲染 |
| `cordis.patch.yml` | 往插件树插入 `balance-chip` 一行 |
| `locale/*.json` | 插件在「设置 → 插件」里的标题与描述 |

- provider 来自与模型选择器共享的 `modelDirectories.directoryFor(sessionId).store`；
- 余额来自 `ctx.remote.account.getBalance()`，请求携带版本、界面语言、UTC 偏移；
- 样式只使用 `--dsw-*` 主题令牌，跟随明暗外观；文案跟随 Harness 中英文切换。

## 兼容性

- 在 DSH `0.2.2-rc.5` 的 Web profile 上验证通过（Windows 桌面端）。
- 需要 **Web（浏览器）形态**的 DSH，且已登录 DeepSeek 账号。
- 纯 Host 形态（headless / ACP / SDK）没有浏览器界面，本插件不产生效果。

## 已知限制

- 不做轮询：只在进入会话、切回有来源的模型、点击刷新时读取。
- 换了账号需要手动点一次刷新（或刷新页面）。
- 不打开充值/用量页面。
- 依赖 `modelDirectories` 与 `remote.account` 两个客户端服务；任一缺失时该槽位不渲染。
- 工具行较窄时模型名会退化为图标，徽标本身不折叠，极端窄窗口下可能挤压模型名。

## 扩展：接入 tokenplan / 积分

`client.js` 里有一张 provider → 余额来源的映射：

```js
const BALANCE_SOURCES = {
  'deepseek-account': 'account',
}
```

接新的余额类型只需要两步：给目标 provider 加一条映射，再在 `sources` 里补一个 `read()`。徽标本体、provider 判断、刷新逻辑都不用改。

## 目录结构

```
dsh-balance-chip/
├── package.json          # dsh.bundle 与 dsh.client 清单
├── cordis.patch.yml      # 插入 balance-chip 行
├── index.js              # Host 半（空实现）
├── client.js             # Client 半（全部逻辑）
├── icon.svg              # 插件列表图标
├── locale/
│   ├── en.json           # 插件标题与描述（英文）
│   └── zh.json           # 插件标题与描述（中文）
├── docs/
│   └── DETAIL.md         # 插件详情页正文
├── CHANGELOG.md
└── LICENSE
```

## 开发

- 无构建步骤：源码即产物。
- 以本地目录（`link:`）方式安装时，改 `client.js` 后刷新页面即可生效；改 Host 半或包清单需要重启 `dsh web`。
- 改动前建议先读 DSH 的插件契约（slot 注册、locale、主题令牌）。

## License

[MIT](./LICENSE)

---

## English summary

A DeepSeek Harness plugin that shows the DeepSeek **account** balance (recharge + bonus) next to the composer's model selector, with a refresh button.

- **Account balance only for now.** API-key, custom, and local model providers intentionally show nothing; token-plan and credit balances are not implemented yet (the provider-to-source table is the extension point).
- Installs as a bundle: **Settings → Plugins → Add plugin**, or `dsh plugin --profile web add <path>`, then restart `dsh web` and hard-refresh.
- No account identifiers, tokens, screenshots, or local paths are included. The balance is rendered in the browser and read through the Host's existing `account` capability; the plugin never touches credentials or writes files.
