# DSH Computer AI Use

Computer use for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) on macOS and Windows: the agent sees the screen and drives the mouse and keyboard. Built on the desktop operator of [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop). Early version; see [verification status](#验证状态).

让 DSH 看屏幕、操作鼠标键盘，支持 macOS 和 Windows。

桌面执行层用的是字节跳动 [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) 的 `@ui-tars/operator-nut-js`。它是同时支持 Windows 和 macOS 的桌面 computer use 方案里 star 最多的，调研过程见 [docs/research.md](docs/research.md)。

决策由 DSH 当前会话的模型负责，不需要额外的 UI-TARS 模型或 API Key，但模型必须支持图片输入。

## 工具

| 工具 | 作用 |
| --- | --- |
| `computer_screenshot` | 截主显示器；传 `region` 可放大某块区域来读小字 |
| `computer_action` | `click`、`double_click`、`right_click`、`middle_click`、`move`、`drag`、`scroll`、`type`、`key`、`wait`；默认操作后返回新截图 |

坐标就是最近一张完整截图里的像素，插件负责换算成屏幕坐标，并适配 Retina 和 DSH 对图片的缩放。

## 安全边界

- **首次使用要批准。** 每个会话第一次调用时走 DSH 审批，批准后本会话不再询问。
- **完全访问预设不询问。** 审批策略是 `never` 时，只有 `danger-full-access` 预设能用，其他预设直接拒绝。
- **你动了鼠标，它就停手。** 如果指针在上次观察之后移动过，或屏幕尺寸变了，操作会被拒绝，模型必须重新截图。
- **随时可停。** DSH 的停止按钮会中断等待和后续步骤，但已经发出的单次点击或按键无法撤回。
- **截图会发给模型服务商。** 屏幕上的私密内容也会一起发送，请在合适的屏幕状态下使用。
- **自动更新可以关闭。** 新版本的权限和当前版本一样大，所以自动更新有严格条件，见[更新](#更新)。

## 安装

**桌面版：** 在侧边栏打开“插件”，点“添加插件”，填包名，点“安装”，再点“立即启用”。不需要重启。

```text
dsh-computer-ai-use
```

版本发布不满 24 小时的时候，要带上版本号，比如 `dsh-computer-ai-use@0.2.0`。只填包名的话，pnpm 的发布冷却策略会跳过它，可能装上旧版本，或者直接报错。

**命令行版：**

```bash
dsh plugin --profile web add dsh-computer-ai-use
```

装好后重启 DSH。

## 更新

打开“设置 > Computer AI Use”：

- **检查更新、立即更新：** 显示当前版本，有新版本时可以马上安装。
- **自动更新：** 默认开启。打开 DSH 约一分钟后检查一次，之后每 6 小时检查一次，在后台安装新版本。

新版本安装后，完全退出并重新打开 DSH 就会生效；有时 DSH 重新加载配置时也会直接换上。

为防范有问题的版本，自动更新只安装同时满足这些条件的版本，不满足时设置页会说明原因：

- 发布满 24 小时。
- 由本仓库的 GitHub Actions 发布，带 npm 来源证明。
- 没有被标记为废弃。
- 兼容当前的 DSH。

“立即更新”不受前三条限制，因为这是你自己的决定。不兼容当前 DSH 的版本不能从这里安装。

更新和“插件”页共用同一把 profile 锁，不会互相干扰。更新失败时，profile 的文件会恢复原样，当前版本继续可用。

如果新版本加载失败，插件就没法再更新自己。这时到“插件”页卸载，再用带版本号的包名重新安装。通过本地路径（`link:`、`file:`）安装的不会更新。

详情见 [SECURITY.md](SECURITY.md)。

## 系统权限

**macOS：** 在“系统设置 > 隐私与安全性”里给运行 DSH 的应用（DeepSeek Harness，命令行运行时是对应的终端）打开“屏幕录制”和“辅助功能”，然后重启该应用。缺少权限时，工具会明确报错，并弹出系统授权提示。

**Windows：** 不需要额外授权，但无法操作以管理员身份运行的窗口，除非 DSH 也以管理员身份运行。

## 限制

- 只支持主显示器，其他显示器上的窗口模型看不到。
- 前台操作：会移动真实鼠标、切换焦点，运行时你和模型共用一套键鼠。
- 只靠截图观察，纯文本模型用不了。
- `type` 通过剪贴板粘贴，这样中文输入法不会干扰。文本内容的剪贴板会恢复，图片等非文本内容会丢失。
- 截图存在 DSH 附件目录（`~/.dsh/attachments`），长期大量使用会占用系统盘。
- UI-TARS 的桌面代码自 2025 年起基本停更，npm 上的版本还缺上游的拖动修复（#909），本插件已自行绕过。未来的 macOS 版本可能需要替换执行层。

## 配置

在 profile 的 `cordis.patch.yml` 里调整：

```yaml
- id: computer-ai-use
  name: dsh-computer-ai-use
  config:
    maxImageEdge: 1568   # 截图最长边，像素
    jpegQuality: 80      # 截图 JPEG 质量
    settleMs: 400        # 操作后等多久再截图，毫秒
    autoUpdate: true     # 自动更新，也可以在设置页修改
```

## 验证状态

版本 0.2.0：

| 项目 | 环境 | 结果 |
| --- | --- | --- |
| 单元测试（假驱动） | macOS、Windows CI | 通过 |
| 更新流程：DSH 同款 pnpm 11.28.5、本地测试源、真实的 profile 锁 | macOS、Windows CI | 通过 |
| 插件页安装、不重启启用、设置页、立即更新、启动后无人值守更新、开关跨重启生效、卸载重装 | 桌面版 0.2.1-rc.5 的宿主入口 + 临时数据目录，macOS | 通过 |
| 真实键鼠自检 `scripts/smoke.mjs --input`：点击、双击、右键、拖选、滚动、移动、按键、中英文输入、截图 | macOS 27 arm64（TextEdit，DSH 内置 Node 24.21） | 0.1.0 通过，之后驱动没有改动 |
| 同上 | Windows x64 CI（记事本，Node 24） | 通过 |
| 真实模型 + 真实键鼠的完整任务：在 TextEdit 里切到窗口、输入中英文、拖选、打开菜单、放大读字、关闭不保存、退出 | DSH 0.2.1-rc.3 web 模式（从 Terminal 启动），Kimi K3.1 Pro，macOS 27 | 0.1.0 通过，11 次工具调用，之后工具没有改动 |
| 审批弹窗：新会话询问一次，之后不再询问 | 同上 | 0.1.0 通过 |
| 在桌面版窗口里操作屏幕 | | **尚未验证** |
| 插件页安装和设置页在 Windows 上的实际界面 | | **尚未验证** |
| 真实模型在 Windows 上操作 | | **尚未验证** |

## 开发

```bash
pnpm install
```

```bash
pnpm test
```

测试用假驱动，不碰真实屏幕；更新流程用本地测试源和桌面版同款的 pnpm。发版流程见 [AGENTS.md](AGENTS.md)。实机自检：

```bash
node scripts/smoke.mjs
```

```bash
node scripts/smoke.mjs --input
```

`--input` 会移动真实鼠标，并打开 TextEdit 或记事本输入文字。编辑器已在运行时它会拒绝启动；前台窗口一变就中止；结束时直接关闭编辑器，不保存。
