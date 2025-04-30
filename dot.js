// ==UserScript==
// @name         DOT
// @namespace    https://github.com/cattail-mutt/
// @version      1.0
// @description  圆点：选中文本，与 OpenAI [Compatible] API 交互，支持 Markdown 渲染、流式输出。
// @author       Mukai
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @resource     STYLE https://raw.githubusercontent.com/cattail-mutt/DOT/refs/heads/main/resources/style.css
// @resource     PROMPTS https://raw.githubusercontent.com/cattail-mutt/DOT/refs/heads/main/resources/prompts.yaml
// @resource     MARKDOWNSTYLES https://raw.githubusercontent.com/cattail-mutt/DOT/refs/heads/main/resources/github-markdown.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://raw.githubusercontent.com/cattail-mutt/archive/refs/heads/main/openai/chatCompletion.js
// ==/UserScript==

(function () {
    'use strict';

    const ConfigManager = {
        DEFAULT_CONFIG: {
            endpoint: 'https://api.closeai.com/v1/chat/completions',
            model: 'cheatgpt-4o-latest',
            apiKey: '',
            temperature: 0.0,
            currentPromptIndex: 0,
            dotPanelWidth: 300,
            dotPanelHeight: null,
            dotPanelLeft: 20,
            dotPanelTop: null
        },
        getConfig() {
            return {
                endpoint: GM_getValue('endpoint', this.DEFAULT_CONFIG.endpoint),
                model: GM_getValue('model', this.DEFAULT_CONFIG.model),
                apiKey: GM_getValue('apiKey', this.DEFAULT_CONFIG.apiKey),
                temperature: GM_getValue('temperature', this.DEFAULT_CONFIG.temperature),
                currentPromptIndex: GM_getValue('currentPromptIndex', this.DEFAULT_CONFIG.currentPromptIndex),
                systemPrompts: GM_getValue('systemPrompts', PromptManager.loadPrompts()),
                dotPanelWidth: GM_getValue('dotPanelWidth', this.DEFAULT_CONFIG.dotPanelWidth),
                dotPanelHeight: GM_getValue('dotPanelHeight', this.DEFAULT_CONFIG.dotPanelHeight),
                dotPanelLeft: GM_getValue('dotPanelLeft', this.DEFAULT_CONFIG.dotPanelLeft),
                dotPanelTop: GM_getValue('dotPanelTop', this.DEFAULT_CONFIG.dotPanelTop)
            };
        },
        saveConfig(newConfig) {
            GM_setValue('endpoint', newConfig.endpoint);
            GM_setValue('model', newConfig.model);
            GM_setValue('apiKey', newConfig.apiKey);
            GM_setValue('temperature', newConfig.temperature);
            GM_setValue('currentPromptIndex', newConfig.currentPromptIndex);
            GM_setValue('systemPrompts', newConfig.systemPrompts);
        },
        savePanelPosition(left, top) {
            GM_setValue('dotPanelLeft', left);
            GM_setValue('dotPanelTop', top);
        },
        savePanelSize(width, height) {
            GM_setValue('dotPanelWidth', width);
            GM_setValue('dotPanelHeight', height);
        }
    };

    const PromptManager = {
        loadPrompts() {
            const promptsText = GM_getResourceText('PROMPTS');
            try {
                const promptsData = jsyaml.load(promptsText);
                return Object.entries(promptsData).map(([key, value]) => ({ title: key, prompt: value }));
            } catch (error) {
                UIManager.showAlert(`加载 Prompts 失败: ${error.message}`, 'error');
                return [];
            }
        },
        getPromptByIndex(index) {
            const config = ConfigManager.getConfig();
            return config.systemPrompts[index];
        },
        getCurrentPrompt() {
            const config = ConfigManager.getConfig();
            return this.getPromptByIndex(config.currentPromptIndex);
        },
        addPrompt(title, prompt) {
            const config = ConfigManager.getConfig();
            config.systemPrompts.push({ title, prompt });
            config.currentPromptIndex = config.systemPrompts.length - 1;
            ConfigManager.saveConfig(config);
            return config.currentPromptIndex;
        },
        updatePrompt(index, title, prompt) {
            const config = ConfigManager.getConfig();
            if (index >= 0 && index < config.systemPrompts.length) {
                config.systemPrompts[index] = { title, prompt };
                ConfigManager.saveConfig(config);
                return true;
            }
            return false;
        },
        deletePrompt(index) {
            const config = ConfigManager.getConfig();
            if (index >= 0 && index < config.systemPrompts.length) {
                config.systemPrompts.splice(index, 1);
                if (config.currentPromptIndex >= config.systemPrompts.length) {
                    config.currentPromptIndex = Math.max(0, config.systemPrompts.length - 1);
                }
                ConfigManager.saveConfig(config);
                return true;
            }
            return false;
        },
        setCurrentPromptIndex(index) {
            const config = ConfigManager.getConfig();
            if (index >= 0 && index < config.systemPrompts.length) {
                config.currentPromptIndex = index;
                ConfigManager.saveConfig(config);
                return true;
            }
            return false;
        }
    };

    const ApiService = {
        async processText(text) {
            const config = ConfigManager.getConfig();
            if (!config.apiKey) throw new Error('未设置 API Key');

            const selectedPrompt = PromptManager.getCurrentPrompt();
            if (!selectedPrompt) throw new Error('未找到指定的 System Prompt');

            let respText = '';
            await window.chatCompletion({
                endpoint: config.endpoint,
                model: config.model,
                apiKey: config.apiKey,
                temperature: config.temperature,
                messages: [
                    { role: 'system', content: selectedPrompt.prompt },
                    { role: 'user', content: text }
                ]
            }, (chunk) => {
                respText += chunk;
                const dotContent = UIManager.shadowRoot?.getElementById('DotContent');
                if (dotContent) {
                     const codeElement = dotContent.querySelector('code');
                     if (codeElement) {
                         codeElement.textContent = respText;
                     } else {
                        dotContent.innerHTML = `<div class="markdown-body"><pre><code>${respText}</code></pre></div>`;
                     }
                }
            });
            return respText;
        }
    };

    const UIManager = {
        configPanel: null,
        dotPanel: null,
        floatingBtn: null,
        shadowRoot: null,
        shadowHost: null,

        adjustContentHeight(panel) {
            if (!panel) return;
            const header = panel.querySelector('.dot-header');
            const body = panel.querySelector('.dot-body');
            if (!header || !body) return;
            const panelHeight = panel.offsetHeight;
            const headerHeight = header.offsetHeight;
            const paddingTop = parseInt(getComputedStyle(body).paddingTop, 10) || 0;
            const paddingBottom = parseInt(getComputedStyle(body).paddingBottom, 10) || 0;
            const bodyHeight = panelHeight - headerHeight - paddingTop - paddingBottom;
            body.style.height = `${Math.max(bodyHeight, 50)}px`;
        },

        init() {
            GM_registerMenuCommand('打开配置面板', () => this.openConfigPanel());

            this.shadowHost = document.createElement('div');
            this.shadowHost.id = 'dot-shadow-host';
            document.body.appendChild(this.shadowHost);
            this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

            try {
                const baseStyleText = GM_getResourceText('STYLE');
                const markdownStyleText = GM_getResourceText('MARKDOWNSTYLES');
                if (baseStyleText) {
                    const baseStyleEl = document.createElement('style');
                    baseStyleEl.textContent = baseStyleText;
                    this.shadowRoot.appendChild(baseStyleEl);
                } else {
                    console.error('[DOT] Error: Failed to load base styles (STYLE resource).');
                }
                if (markdownStyleText) {
                    const mdStyleEl = document.createElement('style');
                    mdStyleEl.textContent = markdownStyleText;
                    this.shadowRoot.appendChild(mdStyleEl);
                } else {
                    console.error('[DOT] Error: Failed to load markdown styles (MARKDOWNSTYLES resource).');
                }
            } catch (error) {
                console.error('[DOT] Error loading styles:', error);
                this.showAlert(`加载样式失败: ${error.message}`, 'error');
            }
            this.createFloatingButton();
        },

        showAlert(message, type = 'success', duration = 3000) {
            this.shadowRoot?.querySelector('.alert')?.remove();

            const alertEl = document.createElement('div');
            alertEl.className = `alert alert-${type}`;
            alertEl.textContent = message;

            if (this.shadowRoot) {
                this.shadowRoot.appendChild(alertEl);
            } else {
                 console.error("[DOT] Error: Shadow root not available for alert.");
                 document.body.appendChild(alertEl);
            }
            setTimeout(() => {
                alertEl.classList.add('hide');
                setTimeout(() => alertEl.remove(), 300);
            }, duration);
        },

        createFloatingButton() {
            this.floatingBtn = document.createElement('div');
            this.floatingBtn.className = 'float-btn';
            this.shadowRoot.appendChild(this.floatingBtn);

            let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
            let isButtonFrozen = false;

            document.addEventListener('mousemove', (e) => {
                if (!isButtonFrozen) {
                    targetX = e.clientX + 30;
                    targetY = e.clientY + 30;
                }
            });

            const animateBtn = () => {
                const dx = targetX - currentX, dy = targetY - currentY;
                currentX += dx * 0.1;
                currentY += dy * 0.1;
                this.floatingBtn.style.left = `${currentX}px`;
                this.floatingBtn.style.top = `${currentY}px`;
                requestAnimationFrame(animateBtn);
            };
            requestAnimationFrame(animateBtn);

            this.floatingBtn.addEventListener('click', () => SelectionManager.processSelectedText());

            SelectionManager.onTextSelected = () => {
                isButtonFrozen = true;
                setTimeout(() => { isButtonFrozen = false; }, 3000);
            };
        },

        openConfigPanel() {
             if (this.configPanel && this.shadowRoot?.contains(this.configPanel)) {
                  this.configPanel.classList.remove('hide');
                  this.updatePromptDatalist();
                  return;
             } else if (this.configPanel) {
                 this.configPanel.remove();
                 this.configPanel = null;
             }

             if (!this.shadowRoot) {
                  console.error("[DOT] Error: Shadow root not available for config panel.");
                  this.showAlert("无法打开配置面板：内部错误", 'error');
                  return;
             }

            this.configPanel = document.createElement('div');
            this.configPanel.className = 'config-panel';
            const config = ConfigManager.getConfig();

            this.configPanel.innerHTML = `
                <div class="config-header">
                    <div class="config-title">配置面板</div>
                    <div class="config-close">×</div>
                </div>
                <div class="config-body">
                    <fieldset style="margin-bottom:16px;">
                        <legend>Prompt 管理</legend>
                        <label for="prompt-selector">选择 Prompt</label>
                        <input list="prompt-selector-list" id="prompt-selector" placeholder="选择或搜索 Prompt">
                        <datalist id="prompt-selector-list"></datalist>
                        <div class="prompt-btn-group">
                            <button id="new-prompt-btn">New Prompt</button>
                            <button id="manage-prompt-btn">Manage</button>
                        </div>
                        <div id="prompt-actions" style="display:none; border:1px solid #666; padding:8px; margin-top:8px;"></div>
                    </fieldset>
                    <fieldset>
                        <legend>API 配置</legend>
                        <label for="model">Model</label> <input type="text" id="model" value="${config.model}">
                        <label for="temperature">Temperature</label> <input type="number" id="temperature" step="0.1" value="${config.temperature}">
                        <label for="endpoint">Endpoint</label> <input type="text" id="endpoint" value="${config.endpoint}">
                        <label for="apikey">API Key</label> <input type="text" id="apikey" value="${config.apiKey}">
                    </fieldset>
                </div>
                <div class="config-footer"><button class="config-save">Save Config</button></div>`;
            this.shadowRoot.appendChild(this.configPanel);
            this.updatePromptDatalist();
            this.bindConfigPanelEvents();
        },

        updatePromptDatalist() {
            if (!this.configPanel) return;
            const config = ConfigManager.getConfig();
            const datalist = this.configPanel.querySelector('#prompt-selector-list');
            datalist.innerHTML = config.systemPrompts.map(p => `<option value="${p.title}"></option>`).join('');
        },

        bindConfigPanelEvents() {
            const configPanel = this.configPanel;
            configPanel.querySelector('.config-close').addEventListener('click', () => configPanel.classList.add('hide'));

            const promptSelector = configPanel.querySelector('#prompt-selector');
            promptSelector.addEventListener('change', (e) => {
                const selTitle = e.target.value;
                const config = ConfigManager.getConfig();
                const idx = config.systemPrompts.findIndex(p => p.title === selTitle);
                if (idx >= 0) {
                    configPanel.dataset.currentPromptIndex = idx;
                    PromptManager.setCurrentPromptIndex(idx);
                    this.showAlert(`已切换至 ${selTitle}`, 'success', 1500);
                } else {
                    delete configPanel.dataset.currentPromptIndex;
                }
            });
            promptSelector.addEventListener('click', (e) => { e.target.value = ''; });

            const currentPromptTitle = PromptManager.getCurrentPrompt()?.title;
            if (currentPromptTitle) promptSelector.value = currentPromptTitle;

            configPanel.querySelector('#new-prompt-btn').addEventListener('click', () => this.showNewPromptForm());
            configPanel.querySelector('#manage-prompt-btn').addEventListener('click', () => this.showManagePromptsUI());
            configPanel.querySelector('.config-save').addEventListener('click', () => this.saveConfigFromForm());
            configPanel.querySelector('#prompt-actions').addEventListener('click', (e) => this.handlePromptActions(e));
        },

        showNewPromptForm() {
            const promptActions = this.configPanel.querySelector('#prompt-actions');
            promptActions.style.display = 'block';
            promptActions.innerHTML = `
                <label for="new-prompt-title">Title</label>
                <input type="text" id="new-prompt-title" placeholder="Prompt 标题">
                <label for="new-prompt-text">Content</label>
                <textarea id="new-prompt-text" placeholder="Prompt 内容"></textarea>
                <button id="save-new-prompt-btn">Save</button>`;

            promptActions.querySelector('#save-new-prompt-btn').addEventListener('click', () => {
                const titleInput = promptActions.querySelector('#new-prompt-title');
                const textInput = promptActions.querySelector('#new-prompt-text');
                const title = titleInput.value.trim();
                const text = textInput.value.trim();

                if (!title || !text) return this.showAlert('标题和内容不能为空！', 'error');

                const newIndex = PromptManager.addPrompt(title, text);
                this.showAlert('Prompt 已添加', 'success');
                this.updatePromptDatalist();
                this.configPanel.querySelector('#prompt-selector').value = title;
                this.configPanel.dataset.currentPromptIndex = newIndex;
                promptActions.style.display = 'none';
                promptActions.innerHTML = '';
            });
        },

        showManagePromptsUI() {
            const promptActions = this.configPanel.querySelector('#prompt-actions');
            promptActions.style.display = 'block';
            const config = ConfigManager.getConfig();
            const canDelete = config.systemPrompts.length > 1;

            promptActions.innerHTML = config.systemPrompts.map((p, idx) => `
                <div style="margin-bottom:4px; border-bottom:1px dashed #666; padding-bottom:4px;">
                    <strong>${p.title}</strong>
                    <button data-edit="${idx}" style="margin-left: 5px;">Edit</button>
                    <button data-del="${idx}" ${!canDelete ? 'disabled title="不能删除唯一的 Prompt"' : ''}>Del</button>
                    <div id="edit-${idx}" style="display:none; margin-top:4px;">
                        <input type="text" value="${p.title}" id="edit-title-${idx}">
                        <textarea id="edit-text-${idx}">${p.prompt}</textarea>
                        <button data-save-edit="${idx}">Save</button>
                    </div>
                </div>`).join('');
        },

        handlePromptActions(e) {
            const target = e.target;
            const promptActions = this.configPanel.querySelector('#prompt-actions');
            const config = ConfigManager.getConfig();

            if (target.matches('button[data-edit]')) {
                const idx = target.getAttribute('data-edit');
                const editDiv = promptActions.querySelector(`#edit-${idx}`);
                if (editDiv) {
                    editDiv.style.display = 'block';
                    target.style.display = 'none';
                    target.nextElementSibling.style.display = 'none';
                } else {
                     console.error(`[DOT] Error: Cannot find edit div for index ${idx}`);
                     this.showAlert(`无法加载编辑表单 (index: ${idx})`, 'error');
                }
            }
            else if (target.matches('button[data-save-edit]')) {
                const idx = parseInt(target.getAttribute('data-save-edit'), 10);
                if (idx < 0 || idx >= config.systemPrompts.length) return this.showAlert('无效的 Prompt 索引', 'error');

                const titleInput = promptActions.querySelector(`#edit-title-${idx}`);
                const textArea = promptActions.querySelector(`#edit-text-${idx}`);
                if (!titleInput || !textArea) return this.showAlert('编辑表单未正确加载', 'error');

                const newTitle = titleInput.value.trim();
                const newText = textArea.value.trim();
                if (!newTitle || !newText) return this.showAlert('标题和内容不能为空！', 'error');

                PromptManager.updatePrompt(idx, newTitle, newText);
                this.showAlert('Prompt 已更新！', 'success');
                this.updatePromptDatalist();
                const currentSelectedTitle = PromptManager.getCurrentPrompt()?.title;
                if (currentSelectedTitle) this.configPanel.querySelector('#prompt-selector').value = currentSelectedTitle;

                promptActions.style.display = 'none';
                promptActions.innerHTML = '';
            }
            else if (target.matches('button[data-del]')) {
                if (config.systemPrompts.length <= 1) return this.showAlert('无法删除唯一的 Prompt', 'error');

                const idx = parseInt(target.getAttribute('data-del'), 10);
                if (idx < 0 || idx >= config.systemPrompts.length) return this.showAlert('无效的 Prompt 索引', 'error');

                const deletedTitle = config.systemPrompts[idx].title;
                PromptManager.deletePrompt(idx);
                this.showAlert(`Prompt '${deletedTitle}' 已删除！`, 'warning');
                this.updatePromptDatalist();

                const newConfig = ConfigManager.getConfig();
                const currentPrompt = newConfig.systemPrompts[newConfig.currentPromptIndex];
                if (currentPrompt) {
                    this.configPanel.querySelector('#prompt-selector').value = currentPrompt.title;
                    this.configPanel.dataset.currentPromptIndex = newConfig.currentPromptIndex;
                } else {
                    this.configPanel.querySelector('#prompt-selector').value = '';
                    delete this.configPanel.dataset.currentPromptIndex;
                }
                this.showManagePromptsUI();
            }
        },

        saveConfigFromForm() {
            const endpoint = this.configPanel.querySelector('#endpoint').value.trim();
            const model = this.configPanel.querySelector('#model').value.trim();
            const temperature = parseFloat(this.configPanel.querySelector('#temperature').value);
            const apiKey = this.configPanel.querySelector('#apikey').value.trim();

            let cfg = ConfigManager.getConfig();
            const promptSelectorValue = this.configPanel.querySelector('#prompt-selector').value;
            const selectedIndex = cfg.systemPrompts.findIndex(p => p.title === promptSelectorValue);

            cfg.currentPromptIndex = (selectedIndex >= 0) ? selectedIndex
                                     : (this.configPanel.dataset.currentPromptIndex !== undefined ? parseInt(this.configPanel.dataset.currentPromptIndex, 10)
                                     : cfg.currentPromptIndex);

            cfg.endpoint = endpoint;
            cfg.model = model;
            cfg.temperature = isNaN(temperature) ? cfg.temperature : temperature;
            cfg.apiKey = apiKey;

            ConfigManager.saveConfig(cfg);
            this.showAlert('配置已保存！', 'success');
            this.configPanel.classList.add('hide');
        },

        showDotPanel() {
             if (!this.shadowRoot) {
                 console.error("[DOT] Error: Shadow root not available for dot panel.");
                 this.showAlert("无法打开面板：内部错误", 'error');
                 return null;
             }
             if (!this.dotPanel || !this.shadowRoot.contains(this.dotPanel)) {
                 if (this.dotPanel) this.dotPanel.remove();

                this.dotPanel = document.createElement('div');
                this.dotPanel.className = 'dot-panel hide';
                this.dotPanel.innerHTML = `
                    <div class="dot-header">
                        <div class="dot-title">请稍候</div>
                        <div class="dot-close">×</div>
                    </div>
                    <div class="dot-body"></div>
                    <div class="resize-handle resize-handle-e"></div>
                    <div class="resize-handle resize-handle-s"></div>
                    <div class="resize-handle resize-handle-se"></div>`;
                this.shadowRoot.appendChild(this.dotPanel);

                const config = ConfigManager.getConfig();
                if (config.dotPanelWidth) this.dotPanel.style.width = `${config.dotPanelWidth}px`;
                if (config.dotPanelHeight) this.dotPanel.style.height = `${config.dotPanelHeight}px`;

                if (config.dotPanelLeft !== null) {
                    this.dotPanel.style.left = `${config.dotPanelLeft}px`;
                    if (config.dotPanelTop !== null) {
                        this.dotPanel.style.bottom = 'auto';
                        this.dotPanel.style.top = `${config.dotPanelTop}px`;
                    } else {
                        this.dotPanel.style.bottom = '20px';
                        this.dotPanel.style.top = 'auto';
                    }
                } else {
                    this.dotPanel.style.left = '20px';
                    this.dotPanel.style.bottom = '20px';
                    this.dotPanel.style.top = 'auto';
                }
                requestAnimationFrame(() => this.dotPanel.classList.remove('hide'));

                this.dotPanel.querySelector('.dot-close').addEventListener('click', () => {
                    this.dotPanel.classList.add('hide');
                    setTimeout(() => { this.dotPanel?.remove(); this.dotPanel = null; }, 300);
                });

                this.setupResizeHandlers(this.dotPanel);
                this.setupDragHandlers(this.dotPanel);
                this.adjustContentHeight(this.dotPanel);
                window.addEventListener('resize', () => {
                    if (this.dotPanel && !this.dotPanel.classList.contains('hide')) {
                       this.adjustContentHeight(this.dotPanel);
                    }
                });
            } else {
                 this.dotPanel.classList.remove('hide');
            }
            this.adjustContentHeight(this.dotPanel);
            return this.dotPanel;
        },

        setupResizeHandlers(panel) {
            const handles = panel.querySelectorAll('.resize-handle');
            let isResizing = false, startX, startY, startWidth, startHeight, activeHandle = null;

            const startResize = (e) => {
                isResizing = true;
                activeHandle = e.target;
                startX = e.clientX; startY = e.clientY;
                startWidth = panel.offsetWidth; startHeight = panel.offsetHeight;
                panel.classList.add('resizing');
                e.stopPropagation(); e.preventDefault();
                document.addEventListener('mousemove', resizePanel);
                document.addEventListener('mouseup', stopResize);
            };

            const resizePanel = (e) => {
                if (!isResizing) return;
                const dx = e.clientX - startX, dy = e.clientY - startY;
                let newWidth = startWidth, newHeight = startHeight;

                if (activeHandle.classList.contains('resize-handle-e') || activeHandle.classList.contains('resize-handle-se')) {
                    newWidth = startWidth + dx;
                }
                if (activeHandle.classList.contains('resize-handle-s') || activeHandle.classList.contains('resize-handle-se')) {
                    newHeight = startHeight + dy;
                }
                if (newWidth >= 200) panel.style.width = `${newWidth}px`;
                if (newHeight >= 100) {
                    panel.style.height = `${newHeight}px`;
                    this.adjustContentHeight(panel);
                }
                e.stopPropagation(); e.preventDefault();
            };

            const stopResize = () => {
                if (isResizing) {
                    isResizing = false;
                    panel.classList.remove('resizing');
                    ConfigManager.savePanelSize(panel.offsetWidth, panel.offsetHeight);
                    this.adjustContentHeight(panel);
                    document.removeEventListener('mousemove', resizePanel);
                    document.removeEventListener('mouseup', stopResize);
                    activeHandle = null;
                }
            };

            handles.forEach(handle => handle.addEventListener('mousedown', startResize));
        },

        setupDragHandlers(panel) {
            const header = panel.querySelector('.dot-header');
            let isDragging = false, offsetX, offsetY;

            header.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('dot-close')) return;

                isDragging = true;
                const rect = panel.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                panel.classList.add('dragging');
                document.addEventListener('mousemove', movePanel);
                document.addEventListener('mouseup', stopDrag);
                e.preventDefault();
            });

            const movePanel = (e) => {
                if (!isDragging) return;
                let x = e.clientX - offsetX, y = e.clientY - offsetY;
                x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
                y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));
                panel.style.left = `${x}px`;
                panel.style.top = `${y}px`;
                panel.style.bottom = 'auto';
                e.preventDefault();
            };

            const stopDrag = () => {
                if (isDragging) {
                    isDragging = false;
                    panel.classList.remove('dragging');
                    ConfigManager.savePanelPosition(parseInt(panel.style.left, 10), parseInt(panel.style.top, 10));
                    document.removeEventListener('mousemove', movePanel);
                    document.removeEventListener('mouseup', stopDrag);
                }
            };
        },

        prepareDotPanel() {
            const panel = this.showDotPanel();
            if (!panel) return { panel: null, dotTitle: null, loadingTimer: null, DotContent: null };

            const dotBody = panel.querySelector('.dot-body');
            const dotTitle = panel.querySelector('.dot-title');
            dotBody.innerHTML = `<div class="dot-text" id="DotContent"><div class="markdown-body"><pre><code></code></pre></div></div>`;
            const DotContent = panel.querySelector('#DotContent');

            let dotCount = 1;
            dotTitle.textContent = '请稍候';
            const loadingTimer = setInterval(() => {
                dotCount = (dotCount % 3) + 1;
                dotTitle.textContent = '请稍候' + '.'.repeat(dotCount);
            }, 500);

            return { panel, dotTitle, loadingTimer, DotContent };
        },

        updateDotPanelWithResult(dotTitle, loadingTimer, DotContent, rawText) {
            clearInterval(loadingTimer);
            if (dotTitle) dotTitle.textContent = '输出结果';
            if (DotContent) {
                const reasoningMatch = rawText.match(/<(?:reasoning|thinking)>((?:.|\n|\r)*?)<\/(?:reasoning|thinking)>/i);
                if (reasoningMatch && reasoningMatch[1] !== undefined) {
                    const reasoningContent = reasoningMatch[1];
                    const otherContent = rawText.replace(reasoningMatch[0], '').trim();
                    DotContent.innerHTML = `<div class="markdown-body">${marked.parse(otherContent)}<br><br><details><summary>推理过程</summary><pre><code>${reasoningContent}</code></pre></details></div>`;
                } else {
                    DotContent.innerHTML = `<div class="markdown-body">${marked.parse(rawText)}</div>`;
                }
            }
        },
    };

    const SelectionManager = {
        lastSelectedText: '',
        selectionTimer: null,
        onTextSelected: null,

        init() {
            document.addEventListener('mouseup', () => {
                const selText = window.getSelection().toString().trim();
                if (selText && selText.length > 0 && !UIManager.shadowHost?.contains(window.getSelection().anchorNode)) {
                    console.log('[DOT] Info: 当前选中内容:', selText);
                    this.lastSelectedText = selText;
                    this.onTextSelected?.(selText);
                    if (this.selectionTimer) clearTimeout(this.selectionTimer);
                    this.selectionTimer = setTimeout(() => { this.lastSelectedText = ''; }, 5000);
                }
            });
        },
        getSelectedText() {
            return this.lastSelectedText;
        },
        async processSelectedText() {
            const selText = this.getSelectedText();
            if (!selText) {
                console.log('[DOT] Info: 未收到任何文本，不执行 API 调用流程');
                return;
            }
            let loadingTimer = null;
            let dotTitle = null;
            let DotContent = null;
            try {
                const panelElements = UIManager.prepareDotPanel();
                if (!panelElements.panel) throw new Error("无法显示结果面板");
                ({ dotTitle, loadingTimer, DotContent } = panelElements);

                const respText = await ApiService.processText(selText);
                UIManager.updateDotPanelWithResult(dotTitle, loadingTimer, DotContent, respText);

            } catch (error) {
                if(loadingTimer) clearInterval(loadingTimer);
                if(dotTitle) dotTitle.textContent = '出错了';
                if(DotContent) DotContent.innerHTML = `<div class="markdown-body"><div class="error-message">${error.message || '未知错误'}</div></div>`;
                UIManager.showAlert(error.message || '处理失败', 'error');
            }
        }
    };

    const DOTApp = {
        init() {
            try {
                UIManager.init();
                SelectionManager.init();
                console.log('[DOT] Info: 初始化完成');
            } catch (error) {
                console.error('[DOT] Error in initialization:', error);
                UIManager.showAlert(`初始化失败: ${error.message}`, 'error', 5000);
            }
        }
    };

    DOTApp.init();
})();
