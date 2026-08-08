# 内置浏览器与页面控制

让 OpenCode 控制插件内嵌的 JCEF 浏览器。**不新增端口**，完全复用插件现有的 HTTP 服务。

## 为什么不是工具窗口

第一版把浏览器做成了第二个 ToolWindow，并且在助手面板里提前配置 CEF 调试端口。结果是助手面板被牵连
（前端 404、无法回到助手），因为两个面板抢同一个 JCEF 初始化时机。现在改成：

- 浏览器在**独立窗口**（`FrameWrapper`）中打开，入口是菜单「工具 → 打开水豚浏览器」；
- 助手面板**完全不引用**浏览器相关代码，浏览器出问题不会影响助手；
- 页面控制默认走 **JS 桥接**（`JBCefJSQuery`），开箱即用，不需要调试端口、不需要重启 IDEA。

## 组成

| 文件 | 作用 |
| --- | --- |
| `ui/CapybaraBrowserPanel.kt` | `JBCefBrowser` + 地址栏 + 前进/后退/刷新 + DevTools；持有 JS 桥接 |
| `ui/CapybaraBrowserWindow.kt` | 用 `FrameWrapper` 承载面板，每个项目一个窗口，重复调用会置顶已有窗口 |
| `actions/OpenCapybaraBrowserAction.kt` | 「工具」菜单入口 |
| `services/BrowserControlService.kt` | 指令分发、状态查询，`@Service(Service.Level.PROJECT)` |
| `services/CdpClient.kt` | JDK 原生 CDP 客户端，**仅**用于截图 |
| `server/HttpServerManager.kt` | `/browser` context：`POST /browser/control`、`GET /browser/status` |
| `services/IdeaExecutionService.kt` | 桥接插件中的 `idea_browser` 工具 |

无新增第三方依赖。

## JS 桥接如何工作

1. 面板创建时 `JBCefJSQuery.create(browser)` 建立 JS→Java 回调通道。
2. 每次 `evaluate` 生成一个请求 id，注入脚本：把表达式包进 `Promise.resolve(...)`，
   成功/失败都通过 `bridge.inject(...)` 回调 `JSON.stringify({id, ok, value})`。
3. Java 侧按 id 匹配 `CompletableFuture` 并在超时后清理。

对象类型的返回值会先 `JSON.stringify`，所以回传的永远是扁平 JSON。

### 点击为什么不用 `el.click()`

实测中 `el.click()` **无法**驱动 Radix / React 的 Tab、Select 等组件——它们监听的是
`pointerdown` / `mousedown`。所以 `click` 指令按顺序派发
`pointerdown → mousedown → pointerup → mouseup → click`（`bubbles: true`，带真实坐标）。
已验证能正确切换 Radix Tab。

同理 `type` 指令通过 `HTMLInputElement.prototype.value` 的原生 setter 赋值再派发 `input`/`change`，
否则 React 受控组件不会更新。

## HTTP 接口

`POST /browser/control`：

```jsonc
{
  "action": "navigate",   // 必填
  "url": "https://…",     // navigate / listenSSE
  "selector": "#submit",  // click / getText / getHtml / type / waitFor
  "script": "1 + 1",      // executeScript
  "text": "hello",        // type
  "timeoutMs": 20000,     // 可选，1000–120000
  "maxEvents": 5          // listenSSE，可选，1–200
}
```

| action | 说明 | 需要调试端口 |
| --- | --- | --- |
| `status` | 窗口是否打开、桥接是否就绪、当前地址、截图是否可用 | 否 |
| `navigate` | 加载地址并轮询到 `readyState === "complete"` | 否 |
| `click` | 合成 pointer+mouse 事件序列 | 否 |
| `getText` / `getHtml` | `innerText` / `outerHTML`，不传 selector 取 `document.body` | 否 |
| `type` | 原生 setter 赋值 + `input`/`change` | 否 |
| `waitFor` | `MutationObserver` 等待元素出现 | 否 |
| `executeScript` | 任意表达式，自动 await Promise | 否 |
| `listenSSE` | 页面内 `EventSource`，收满 `maxEvents` 或超时返回 | 否 |
| `openDevTools` | `openDevtools()` 独立窗口 | 否 |
| `screenshot` | `Page.captureScreenshot`，返回 data URI | **是** |

`GET /browser/status` 返回同样的状态对象。

未打开窗口时任何指令都会返回
`内置浏览器未打开。请在 IDEA 菜单「工具 → 打开水豚浏览器」中打开后再试。`

### 安全约束

- `navigate` / `listenSSE` 只接受 `http`、`https`、`about:blank`。
- selector、URL、文本都先编码成 JS 字符串字面量再拼接。

## 截图与调试端口

CEF 只在创建第一个 `JBCefBrowser` 时读一次 `CefSettings`。`BrowserControlService.tryEnableDebugPort()`
只在**打开浏览器窗口时**尝试写入 9222，且如果 JCEF 已启动就直接放弃（不抛错、不影响任何功能）。

因此：如果你先打开了助手面板，调试端口通常不可用，`screenshot` 会返回明确提示，其余指令照常工作。
想用截图就先打开水豚浏览器再打开助手，或重启 IDEA。

## plugin.xml 配置改动

```xml
<!-- JCEF 模块：2025.3.1+ 要求声明，2023.x–2025.2 不存在该模块，所以必须是 optional -->
<depends optional="true" config-file="capybara-jcef.xml">com.intellij.modules.jcef</depends>

<actions>
    <!-- 新增：浏览器入口。没有新增 toolWindow。 -->
    <action id="com.aicoding.plugin.OpenCapybaraBrowserAction"
            class="com.aicoding.plugin.actions.OpenCapybaraBrowserAction"
            text="打开水豚浏览器"
            description="打开可被 OpenCode 控制的内置浏览器窗口">
        <add-to-group group-id="ToolsMenu" anchor="last" />
    </action>
</actions>
```

配套空配置文件 `META-INF/capybara-jcef.xml`。

## 兼容性

| 项 | 实现 |
| --- | --- |
| 2025.3.1+ 的 JCEF 依赖 | optional `<depends>` + config-file |
| `onRenderProcessTerminated` 签名差异 | `java.lang.reflect.Proxy` 按方法名分发 `CefRequestHandler`（SDK 中并不存在 `@AvailableForIdeRevision`，已核实） |
| 内嵌 DevTools | 不使用，统一 `openDevtools()` 独立窗口 |
| 2023.2+ 右键/输入 | `setOffScreenRendering(false)` |

## OpenCode 侧调用

在设置页「IDEA」中打开「OpenCode 工具桥接」后，`~/.config/opencode/plugins/capybara-idea.ts`
会包含 `idea_browser` 工具。工具描述里明确要求先 `action: "status"` 检查窗口是否打开，
避免模型在窗口没开时反复失败。

## 验证情况

- 注入的 JS 载荷（click / type / waitFor / getText / executeScript 错误传递）已在真实 Chrome 中
  针对本项目前端跑通 8/8，其中包含"合成事件能驱动 Radix Tab"这一关键项。
- `CdpClient` 曾以真实 Chrome 验证 9/9（navigate、click、getText、executeScript、screenshot、listenSSE、错误传递）。
- **未验证**：`JBCefJSQuery` 在 IDEA 运行时中的实际注入、独立窗口的显示与关闭、2025.3+ 兼容性。
  这些需要在运行中的 IDEA 里测试。
