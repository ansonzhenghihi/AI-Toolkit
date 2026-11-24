# 账户余额徽标 / Account balance chip

## 功能

在对话输入框的工具行里、模型选择器左侧，显示当前 DeepSeek 账户的**充值余额**与**赠送余额**，右侧带一个刷新按钮，点击后重新读取余额。

- 充值余额以主文字颜色显示，赠送余额以次要文字颜色显示，前缀「赠」/「Bonus」。
- 赠送余额为 0 时整段省略，避免长期占位。
- 未登录（没有已保存的账户凭据）时不渲染任何内容。
- 读取失败时显示「余额不可用」并保留刷新按钮，可原地重试；失败细节在悬停提示里。
- 金额格式与账户设置页一致：千分位分组、正数截断到分、不足一分显示 `<¥0.01`；多币种（CNY/USD）各自显示。

## 支持范围

**当前仅支持 DeepSeek 账号余额。**

| provider | 余额来源 | 显示 |
| --- | --- | --- |
| `deepseek-account` | DeepSeek 账户余额（`remote.account.getBalance`） | 充值 + 赠送 |
| 其他（API Key、自定义模型、本地模型等） | 暂无来源 | 不渲染，位置保留 |

- provider 来自与模型选择器**同一个** per-session 模型目录（`modelDirectories.directoryFor(sessionId).store`），所以在菜单里换模型会立刻生效，不需要刷新。
- provider 未知时（目录还在加载）按「无来源」处理：宁可不显示，也不拿账号余额冒充别的路由的余额。
- tokenplan 余额与积分余额尚未实现；将来接入时，只需在 `BALANCE_SOURCES` 里给对应 provider 加一条映射，并在 `sources` 里补一个 `read()`。

## 实现

- Host 半只有空的 `apply()`；界面全部由 Client 模块承担。
- Client 注册到 `conversation.input.right`（输入框工具行里、提交键之前的列表槽），id 为 `balance-chip`，order 为 10。
- 余额通过已有的 `ctx.remote.account.getBalance()` 读取，请求带版本、界面语言、UTC 偏移；浏览器不直接访问平台接口，也不接触凭据。
- 文案走 Client locale 服务（`balanceChip` 命名空间，中英两套），样式只用 `--dsw-*` 主题令牌，跟随明暗外观。

## 已知限制

- 需要 **DeepSeek 账户登录**：只用 API Key 的场景没有账户余额，徽标不显示。
- 只在进入会话（或 provider 回到有来源的模型）时和点击刷新时读取，不做轮询；换账号后需要点一次刷新。
- 不打开用量/充值页面（账户链接由账户状态流提供，本版未接）。
- 依赖 `modelDirectories` 与 `remote.account` 两个客户端服务；任一缺失时该槽位不渲染。
- 工具行较窄时，模型名会退化为图标；徽标本身不折叠，极端窄窗口下可能挤压模型名。
