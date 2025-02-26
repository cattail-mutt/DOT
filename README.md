# DOT - 圆点

DOT 是一款基于 OpenAI [Compatible] API 的即时交互脚本，支持流式输出和 Markdown 渲染，提供简洁高效的文本处理体验。

## 功能特性

- **即时交互**：选中文本后，点击悬浮按钮即可快速与 API 交互
- **流式输出**：实时显示处理结果，提升用户体验
- **Markdown 渲染**：支持将输出内容渲染为 Markdown 格式
- **多 Prompt 支持**：可自定义和管理多个  systemPrompt

## 配置说明

通过菜单中的 "打开配置面板" 选项，可以设置以下参数：

- **API 配置**

| 配置项       | 说明                                                                 |
|--------------|--------------------------------------------------------------------|
| Model        | 采用的模型，例如 `gpt-4o`                    |
| Temperature  | 采用的温度（控制生成文本的随机性，值越高结果越随机，值越低结果越确定）               |
| Endpoint     | API 聊天补全端点，需填写完整如 `https://api.openai.com/v1/chat/completions` |
| API Key      | API 密钥，一般以 `sk-` 开头                                         |

- **Prompt 管理**
  - **新增 Prompt**：添加新的系统 Prompt
  - **编辑 Prompt**：修改现有 Prompt 的标题和内容
  - **删除 Prompt**：移除不再需要的 Prompt

## 文件结构

- `dot.js` - 主脚本文件
- `resources/style.css` - 样式文件
- `resources/prompts.yaml` - Prompt 配置文件

## 依赖项

- [js-yaml.min.js](https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js) - 用于解析 YAML 格式的 Prompt 文件
- [marked.min.js](https://cdn.jsdelivr.net/npm/marked/marked.min.js) - 用于 Markdown 渲染
- [chatCompletion.js](https://raw.githubusercontent.com/cattail-mutt/archive/main/openai/chatCompletion.js) - 用于调用油猴 API `GM_xmlhttpRequest`，与 OpenAI [Compatible] API 交互

## 使用说明

1. 安装脚本后，在任意网页选中文本。
2. 点击悬浮按钮，脚本会根据当前配置的提示词与 API 交互。
3. 处理结果会以流式输出的方式显示在面板中，并自动渲染为 Markdown 格式。
4. 如果需要调整圆点悬浮的时间，请在脚本代码中搜索 `SelectionManager.onTextSelected = () => {` ，然后将其中的 3000 修改为你希望圆点在选中文本后静止的时间（单位：毫秒）。

## 鸽子计划

- **自定义配置**：为不同站点配置默认 Prompt 选项
