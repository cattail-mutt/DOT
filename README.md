# Dotrans - 圆点翻译

Dotrans 是一款基于 OpenAI [Compatible] API 的划词翻译小工具，支持流式输出，提供简洁高效的翻译体验。

## 功能特性

- **划词翻译**：选中文本后，点击悬浮按钮即可快速翻译
- **流式输出**：实时显示翻译结果，提升用户体验
- **多 Prompt 支持**：可自定义和管理多个翻译 Prompt

## 配置说明

通过菜单中的 "打开配置面板" 选项，可以设置以下参数：

- **API 配置**

| 配置项       | 说明                                                                 |
|--------------|--------------------------------------------------------------------|
| Model        | 采用的模型                                                           |
| Temperature  | 采用的温度（控制生成文本的随机性，值越高结果越随机，值越低结果越确定）               |
| Endpoint     | API 聊天补全端点，需填写完整如 `https://api.openai.com/v1/chat/completions` |
| API Key      | API 密钥，一般以 `sk-` 开头                                 |

## 文件结构

- `Dotrans.js` - 主脚本文件
- `resources/style.css` - 样式文件
- `resources/prompts.yaml` - Prompt 配置文件

## 依赖项

- [js-yaml.min.js](https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js) - 用于解析 YAML 格式的 Prompt 文件

## 鸽子计划

- 自定义配置：为不同站点配置默认提示词选项。
- ...