# Computer use 方案调研

数据时间：2026-10-30。star 数来自 GitHub API，平台支持来自各仓库 README 和文档。

判断标准：能操作本机桌面（不只是浏览器），同时支持 Windows 和 macOS，然后比 star。

## 结论

**[bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)（39,444 star）是符合条件的 star 最多的方案**，插件基于它的桌面执行层 `@ui-tars/operator-nut-js`。

第二名 [trycua/cua](https://github.com/trycua/cua)（31,324 star）工程上更新更活跃，见下文对比。

## 排除的高 star 项目

| 仓库 | star | 排除原因 |
| --- | ---: | --- |
| openclaw/openclaw | 393,414 | 通用 AI 助手，本身不是 computer use 方案；屏幕能力依赖配套节点 |
| NousResearch/hermes-agent | 258,629 | 通用 agent，README 里的桌面控制只见于第三方 MCP |
| browser-use/browser-use | 119,534 | 只控制浏览器，不能操作桌面应用 |
| openinterpreter/openinterpreter | 68,728 | 已转型为编码 agent，桌面操作由内置 QA skill 调用 trycua 完成 |
| Mintplex-Labs/anything-llm | 67,736 | 本地知识库与聊天应用，README 没有桌面控制 |
| feder-cr/invisible_dots | 32,308 | 不支持 macOS（hosts: Linux、Windows），在虚拟机内运行，且以规避反机器人检测为卖点 |

## 符合条件的候选

| 仓库 | star | Windows | macOS | 许可证 | 最近更新 | 形态 |
| --- | ---: | :---: | :---: | --- | --- | --- |
| bytedance/UI-TARS-desktop | 39,444 | 支持 | 支持 | Apache-2.0 | 执行层 2025-07，应用 2025-08 | Electron 应用 + npm SDK |
| trycua/cua | 31,324 | 支持 | 支持 | MIT | 2026-10（持续发布） | 驱动 + CLI/MCP/npm SDK |
| web-infra-dev/midscene | 15,437 | 支持 | 支持 | MIT | 2026-10 | 视觉 UI 测试框架 |
| simular-ai/Agent-S | 12,824 | 支持 | 支持 | Apache-2.0 | 2026-10 | Python agent |
| asweigart/pyautogui | 12,748 | 支持 | 支持 | BSD-3-Clause | 2024-08 | 键鼠库，不含 agent |
| go-vgo/robotgo | 10,888 | 支持 | 支持 | Apache-2.0 | 2026-10 | Go 键鼠库 |
| OthersideAI/self-operating-computer | 10,296 | 支持 | 支持 | MIT | 2026-10 | Python agent |

只支持单一系统的（CursorTouch/Windows-MCP 10,745 star、openclaw/Peekaboo 5,412 star）未列入。bytebot-ai/bytebot（11,069 star）已归档，且运行在 Docker 虚拟桌面里。

## UI-TARS 与 cua 的取舍

用户要求按 star 选，所以用 UI-TARS。

| | UI-TARS（本插件） | cua |
| --- | --- | --- |
| 接入 Node | npm 包，N-API 原生模块 | npm 包 `@trycua/cua-driver`，Rust 原生库 |
| 操作方式 | 前台，移动真实鼠标 | 可后台投递，不抢焦点（部分路径会拒绝） |
| 观察方式 | 只有截图，模型必须支持图片 | 截图加无障碍树，纯文本模型也能用 |
| 多显示器 | 只有主显示器 | 支持按窗口操作 |
| 维护 | 桌面部分自 2025 年起基本停更 | 几乎每天发版 |
| 签名 | macOS 原生模块为 ad-hoc 签名 | Developer ID 签名 |

如果之后更看重后台操作或纯文本模型，换 cua 的代价不大：`lib/tools.js` 只依赖 `lib/ui-tars-driver.js` 暴露的小接口。

## 已有的同类 DSH 插件

都不基于 UI-TARS，也就没有现成可用的版本：

- [988hj7tczd-oss/dsh-computer-use](https://github.com/988hj7tczd-oss/dsh-computer-use)（63 star，占用了 npm 名 `dsh-computer-use`）：跨平台，调用 cua-driver CLI
- [Anionex/dsh-computer-use](https://github.com/Anionex/dsh-computer-use)（81 star）：仅 macOS
- [momasiku/dsh-pilot](https://github.com/momasiku/dsh-pilot)（130 star）、[copylee711/dsh-computer-use](https://github.com/copylee711/dsh-computer-use)（27 star）：仅 Windows
