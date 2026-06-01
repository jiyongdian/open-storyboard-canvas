# GitHub Repository Setup 建议

这个文件用于公开仓库首发前手动配置 GitHub About、Topics、Release 和可见信息。

## Short Description

推荐中文：

```text
开源的 AI 分镜与导演台画布，支持全景图、摄像机控制、提示词库和多供应商生图工作流。感谢 Linux Do 社区：https://linux.do
```

推荐英文：

```text
Open-source AI storyboard canvas with Director Studio, panorama workflows, prompt library, and multi-provider image generation.
```

## Topics

建议选择 10-15 个，按仓库实际重点取舍：

```text
tauri
react
typescript
rust
ai-image-generation
storyboard
storyboarding
node-editor
infinite-canvas
threejs
zustand
prompt-library
image-editing
panorama
desktop-app
```

## About 设置

- Website: 可以先留空，或填最新 Release 页面。
- Releases: 开启。
- Packages: 暂时不需要。
- Issues: 开启，用于 bug 和需求反馈。
- Discussions: 可选；如果希望收集工作流案例和供应商配置经验，建议开启。
- Wiki: 暂时不需要，优先维护 `README.md` 和 `docs/`。
- Security policy: 开启，并使用仓库根目录 `SECURITY.md`。

## 首发前检查

- README 已包含项目定位、亮点、截图/演示预览、快速开始、供应商/API Key、数据隐私、授权状态、路线图和免责声明。
- `LICENSE`、`NOTICE`、`CONTRIBUTING.md`、`SECURITY.md` 已存在。
- 原作者「痕继痕迹 / henjicc」、原项目链接和授权截图路径保留：
  - <https://github.com/henjicc/Storyboard-Copilot>
  - `docs/legal/upstream-author-authorization-2026-05-31.jpg`
- 新图标文件保留在 `docs/brand/` 和 Tauri icon 目录。
- Release 页面附上安装包、系统要求、WebView2 提示和已知问题。
- 发布前确认仓库中没有真实 API Key、本地数据库、未公开素材、客户资料或个人路径。

## README 媒体建议

当前 README 已接入以下演示素材：

- `prompt-library.gif`：提示词库预览、收藏、详情和应用。
- `provider-settings.png`：添加供应商与 AI 辅助 JSON 导入。
- `prompt-management.gif`：提示词管理与修改。
- `prompt-presets.png`：提示词预设。
- `ai-image-node.png`：AI 图片节点、参数和预设。
- `camera-control.png`：摄像机控制。
- `director-studio.png`：导演台 3D 工作台。
- `image-node-toolbar.png`：图片节点功能栏。
- `panorama-viewer.gif`：全景查看、保存当前视角和四宫格生成。
- `director-panorama-import.png`：导演台导入全景图。
- `dreamina-cli.png`：Dreamina / 即梦 CLI 设置页。
