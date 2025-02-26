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
                return Object.entries(promptsData).map(([key, value]) => ({
                    title: key,
                    prompt: value
                }));
            } catch (error) {
                UIManager.showAlert('加载 Prompts 失败: ' + error.message, 'error');
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
            return config.systemPrompts.length - 1;
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
            if (!config.apiKey) {
                throw new Error('未设置 API Key');
            }

            const selectedPrompt = PromptManager.getCurrentPrompt();
            if (!selectedPrompt) {
                throw new Error('未找到指定的 System Prompt');
            }

            let responseText = '';
            
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
                responseText += chunk;
                const dotContent = document.getElementById('DotContent');
                if (dotContent && dotContent.querySelector('code')) {
                    dotContent.querySelector('code').textContent = responseText;
                }
            });

            return responseText;
        }
    };
    
    const UIManager = {
        styleText: GM_getResourceText('STYLE'),
        configPanel: null,
        dotPanel: null,
        floatingBtn: null,
        
        adjustContentHeight(panel) {
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
            GM_addStyle(this.styleText);
            GM_registerMenuCommand('打开配置面板', () => this.openConfigPanel());
            
            this.createFloatingButton();
        },

        showAlert(message, type = 'success', duration = 3000) {
            const existingAlert = document.querySelector('.alert');
            if (existingAlert) existingAlert.remove();

            const alertEl = document.createElement('div');
            alertEl.className = `alert alert-${type}`;
            alertEl.textContent = message;

            document.body.appendChild(alertEl);

            setTimeout(() => {
                alertEl.classList.add('hide');
                setTimeout(() => alertEl.remove(), 300);
            }, duration);
        },

        createFloatingButton() {
            this.floatingBtn = document.createElement('div');
            this.floatingBtn.className = 'float-btn';
            document.body.appendChild(this.floatingBtn);
            
            let targetX = 0, targetY = 0;
            let currentX = 0, currentY = 0;
            let isButtonFrozen = false;

            document.addEventListener('mousemove', (e) => {
                if (!isButtonFrozen) {
                    targetX = e.clientX + 30;
                    targetY = e.clientY + 30;
                }
            });

            const animateBtn = () => {
                const dx = targetX - currentX;
                const dy = targetY - currentY;
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
                setTimeout(() => {
                    isButtonFrozen = false;
                }, 3000);
            };
        },

        openConfigPanel() {
            if (this.configPanel) {
                this.configPanel.classList.remove('hide');
                this.updatePromptDatalist();
                return;
            }

            this.configPanel = document.createElement('div');
            this.configPanel.className = 'config-panel';
            const config = ConfigManager.getConfig();

            this.configPanel.innerHTML = `
                <div class="config-header">
                    <div class="config-title">配置面板</div>
                    <div class="config-close">&times;</div>
                </div>
                <div class="config-body">
                    <!-- Prompt 管理区域 -->
                    <fieldset style="margin-bottom:16px;">
                        <legend>Prompt 管理</legend>
                        <label for="prompt-selector">选择 Prompt</label>
                        <input list="prompt-selector-list" id="prompt-selector" placeholder="选择已有 Prompt">
                        <datalist id="prompt-selector-list"></datalist>
                        <div class="prompt-btn-group">
                            <button id="new-prompt-btn">New Prompt</button>
                            <button id="manage-prompt-btn">Manage</button>
                        </div>
                        <div id="prompt-actions" style="display:none; border:1px solid #666; padding:8px; margin-top:8px;">
                        </div>
                    </fieldset>
                    <!-- API 配置区域 -->
                    <fieldset>
                        <legend>API 配置</legend>
                        <label for="model">Model</label>
                        <input type="text" id="model" value="${config.model}">
                        <label for="temperature">Temperature</label>
                        <input type="number" id="temperature" step="0.1" value="${config.temperature}">
                        <label for="endpoint">Endpoint</label>
                        <input type="text" id="endpoint" value="${config.endpoint}">
                        <label for="apikey">API Key</label>
                        <input type="text" id="apikey" value="${config.apiKey}">
                    </fieldset>
                </div>
                <div class="config-footer">
                    <button class="config-save">Save Config</button>
                </div>
            `;
            document.body.appendChild(this.configPanel);
            
            this.updatePromptDatalist();
            this.bindConfigPanelEvents();
        },

        updatePromptDatalist() {
            if (!this.configPanel) return;
            
            const config = ConfigManager.getConfig();
            const datalist = this.configPanel.querySelector('#prompt-selector-list');
            datalist.innerHTML = config.systemPrompts.map(p => 
                `<option value="${p.title}"></option>`).join('\n');
        },

        bindConfigPanelEvents() {
            this.configPanel.querySelector('.config-close').addEventListener('click', () => {
                this.configPanel.classList.add('hide');
            });

            this.configPanel.querySelector('#prompt-selector').addEventListener('change', (e) => {
                const sel = e.target.value;
                const config = ConfigManager.getConfig();
                const idx = config.systemPrompts.findIndex(p => p.title === sel);
                if (idx >= 0) {
                    this.configPanel.dataset.currentPromptIndex = idx;
                } else {
                    delete this.configPanel.dataset.currentPromptIndex;
                }
            });

            this.configPanel.querySelector('#new-prompt-btn').addEventListener('click', () => {
                this.showNewPromptForm();
            });

            this.configPanel.querySelector('#manage-prompt-btn').addEventListener('click', () => {
                this.showManagePromptsUI();
            });

            this.configPanel.querySelector('.config-save').addEventListener('click', () => {
                this.saveConfigFromForm();
            });

            const promptActionsEl = this.configPanel.querySelector('#prompt-actions');
            promptActionsEl.addEventListener('click', (e) => this.handlePromptActions(e));
        },

        showNewPromptForm() {
            const promptActions = this.configPanel.querySelector('#prompt-actions');
            promptActions.style.display = 'block';
            promptActions.innerHTML = `
                <label for="new-prompt-title">Title</label>
                <input type="text" id="new-prompt-title" placeholder="Prompt 标题">
                <label for="new-prompt-text">Content</label>
                <textarea id="new-prompt-text" placeholder="Prompt 内容"></textarea>
                <button id="save-new-prompt-btn">Save</button>
            `;
            
            this.configPanel.querySelector('#save-new-prompt-btn').addEventListener('click', () => {
                const title = promptActions.querySelector('#new-prompt-title').value.trim();
                const text = promptActions.querySelector('#new-prompt-text').value.trim();
                
                if (!title || !text) {
                    this.showAlert('标题和内容不能为空！', 'error');
                    return;
                }
                
                PromptManager.addPrompt(title, text);
                this.showAlert('Prompt 已添加', 'success');
                this.updatePromptDatalist();
                promptActions.style.display = 'none';
            });
        },

        showManagePromptsUI() {
            const promptActions = this.configPanel.querySelector('#prompt-actions');
            promptActions.style.display = 'block';
            
            const config = ConfigManager.getConfig();
            promptActions.innerHTML = config.systemPrompts.map((p, idx) => `
                <div style="margin-bottom:4px; border-bottom:1px dashed #666; padding-bottom:4px;">
                    <strong>${p.title}</strong>
                    <button data-edit="${idx}">Edit</button>
                    <button data-del="${idx}">Del</button>
                    <div id="edit-${idx}" style="display:none; margin-top:4px;">
                        <input type="text" value="${p.title}" id="edit-title-${idx}">
                        <textarea id="edit-text-${idx}">${p.prompt}</textarea>
                        <button data-save-edit="${idx}">Save</button>
                    </div>
                </div>
            `).join('');
        },

        handlePromptActions(e) {
            const target = e.target;
            
            if (target.matches('button[data-edit]')) {
                const idx = target.getAttribute('data-edit');
                const editDiv = this.configPanel.querySelector(`#edit-${idx}`);
                editDiv.style.display = 'block';
            } 
            else if (target.matches('button[data-save-edit]')) {
                const idx = parseInt(target.getAttribute('data-save-edit'), 10);
                const newTitle = document.getElementById(`edit-title-${idx}`).value.trim();
                const newText = document.getElementById(`edit-text-${idx}`).value.trim();
                
                if (!newTitle || !newText) {
                    this.showAlert('标题和内容不能为空！', 'error');
                    return;
                }
                
                PromptManager.updatePrompt(idx, newTitle, newText);
                this.showAlert('Prompt 已更新！', 'success');
                this.updatePromptDatalist();
                this.configPanel.querySelector(`#edit-${idx}`).style.display = 'none';
            } 
            else if (target.matches('button[data-del]')) {
                const idx = parseInt(target.getAttribute('data-del'), 10);
                PromptManager.deletePrompt(idx);
                this.showAlert('Prompt 已删除！', 'warning');
                this.updatePromptDatalist();
                this.configPanel.querySelector('#manage-prompt-btn').click();
            }
        },

        saveConfigFromForm() {
            const endpoint = this.configPanel.querySelector('#endpoint').value.trim();
            const model = this.configPanel.querySelector('#model').value.trim();
            const temperature = parseFloat(this.configPanel.querySelector('#temperature').value);
            const apiKey = this.configPanel.querySelector('#apikey').value.trim();
            
            let cfg = ConfigManager.getConfig();
            const newPromptIndex = this.configPanel.dataset.currentPromptIndex;
            
            if (newPromptIndex !== undefined) {
                cfg.currentPromptIndex = parseInt(newPromptIndex, 10);
            }
            
            cfg.endpoint = endpoint;
            cfg.model = model;
            cfg.temperature = temperature;
            cfg.apiKey = apiKey;
            
            ConfigManager.saveConfig(cfg);
            this.showAlert('配置已保存！', 'success');
            this.configPanel.classList.add('hide');
        },

        showDotPanel() {
            if (!this.dotPanel) {
                this.dotPanel = document.createElement('div');
                this.dotPanel.className = 'dot-panel';
                this.dotPanel.innerHTML = `
                    <div class="dot-header">
                        <div class="dot-title">请稍候</div>
                        <div class="dot-close">&times;</div>
                    </div>
                    <div class="dot-body"></div>
                    <div class="resize-handle resize-handle-e"></div>
                    <div class="resize-handle resize-handle-s"></div>
                    <div class="resize-handle resize-handle-se"></div>
                `;
                document.body.appendChild(this.dotPanel);

                const config = ConfigManager.getConfig();
                if (config.dotPanelWidth) {
                    this.dotPanel.style.width = config.dotPanelWidth + 'px';
                }

                if (config.dotPanelLeft !== undefined) {
                    this.dotPanel.style.left = config.dotPanelLeft + 'px';
                    if (config.dotPanelTop !== undefined && config.dotPanelTop !== null) {
                        this.dotPanel.style.bottom = 'auto';
                        this.dotPanel.style.top = config.dotPanelTop + 'px';
                    }
                }

                this.dotPanel.querySelector('.dot-close').addEventListener('click', () => {
                    this.dotPanel.classList.add('hide');
                    setTimeout(() => {
                        this.dotPanel.remove();
                        this.dotPanel = null;
                    }, 300);
                });

                this.setupResizeHandlers(this.dotPanel);
                this.setupDragHandlers(this.dotPanel);
                this.adjustContentHeight(this.dotPanel);
                window.addEventListener('resize', () => {
                    if (this.dotPanel) {
                        this.adjustContentHeight(this.dotPanel);
                    }
                });
            } else {
                this.dotPanel.classList.remove('hide');
                this.adjustContentHeight(this.dotPanel);
            }

            return this.dotPanel;
        },

        setupResizeHandlers(panel) {
            const handles = panel.querySelectorAll('.resize-handle');
            let isResizing = false;
            let startX, startY, startWidth, startHeight;
            let activeHandle = null;
            
            handles.forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    isResizing = true;
                    activeHandle = handle;
                    startX = e.clientX;
                    startY = e.clientY;
                    startWidth = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
                    startHeight = parseInt(document.defaultView.getComputedStyle(panel).height, 10);
                    
                    panel.classList.add('resizing');
                    e.stopPropagation();
                    e.preventDefault();
                    
                    document.addEventListener('mousemove', resizePanel);
                    document.addEventListener('mouseup', stopResize);
                });
            });
            
            const resizePanel = (e) => {
                if (!isResizing) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                if (activeHandle.classList.contains('resize-handle-e') || 
                    activeHandle.classList.contains('resize-handle-se')) {
                    const newWidth = startWidth + dx;
                    if (newWidth >= 200) {
                        panel.style.width = newWidth + 'px';
                    }
                }
                
                if (activeHandle.classList.contains('resize-handle-s') || 
                    activeHandle.classList.contains('resize-handle-se')) {
                    const newHeight = startHeight + dy;
                    if (newHeight >= 100) {
                        panel.style.height = newHeight + 'px';
                        this.adjustContentHeight(panel);
                    }
                }
                
                e.stopPropagation();
                e.preventDefault();
            };
            
            const stopResize = () => {
                if (isResizing) {
                    isResizing = false;
                    panel.classList.remove('resizing');
                    
                    const width = parseInt(document.defaultView.getComputedStyle(panel).width, 10);
                    const height = parseInt(document.defaultView.getComputedStyle(panel).height, 10);
                    ConfigManager.savePanelSize(width, height);
                    this.adjustContentHeight(panel);
                    
                    document.removeEventListener('mousemove', resizePanel);
                    document.removeEventListener('mouseup', stopResize);
                    activeHandle = null;
                }
            };
        },

        setupDragHandlers(panel) {
            const header = panel.querySelector('.dot-header');
            let isDragging = false;
            let offsetX, offsetY;
            
            header.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('dot-close')) {
                    return;
                }
                
                isDragging = true;
                offsetX = e.clientX - panel.getBoundingClientRect().left;
                offsetY = e.clientY - panel.getBoundingClientRect().top;
                
                panel.classList.add('dragging');
                
                document.addEventListener('mousemove', movePanel);
                document.addEventListener('mouseup', stopDrag);
                
                e.preventDefault();
            });
            
            const movePanel = (e) => {
                if (!isDragging) return;
                
                const x = e.clientX - offsetX;
                const y = e.clientY - offsetY;
                
                const maxX = window.innerWidth - panel.offsetWidth;
                const maxY = window.innerHeight - panel.offsetHeight;
                
                panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
                panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
                panel.style.bottom = 'auto';
                
                e.preventDefault();
            };
            
            const stopDrag = () => {
                if (isDragging) {
                    isDragging = false;
                    panel.classList.remove('dragging');
                    
                    const left = parseInt(panel.style.left, 10);
                    const top = parseInt(panel.style.top, 10);
                    ConfigManager.savePanelPosition(left, top);
                    
                    document.removeEventListener('mousemove', movePanel);
                    document.removeEventListener('mouseup', stopDrag);
                }
            };
        },

        prepareDotPanel() {
            const panel = this.showDotPanel();
            const dotBody = panel.querySelector('.dot-body');
            dotBody.innerHTML = `
                <div class="dot-text" id="DotContent"></div>
            `;

            let dotCount = 1;
            const dotTitle = panel.querySelector('.dot-title');
            dotTitle.textContent = '请稍候';
            
            const loadingTimer = setInterval(() => {
                dotCount = (dotCount % 3) + 1;
                dotTitle.textContent = '请稍候' + '.'.repeat(dotCount);
            }, 500);
            const DotContent = document.getElementById('DotContent');
            DotContent.innerHTML = '<pre><code></code></pre>';

            return { panel, dotTitle, loadingTimer, DotContent };
        },

        updateDotPanelWithResult(dotTitle, loadingTimer, DotContent, rawText) {
            clearInterval(loadingTimer);
            dotTitle.textContent = '输出结果';
            DotContent.innerHTML = marked.parse(this.escapeHtml(rawText));
        },

        escapeHtml(str) {
            return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
    };

    const SelectionManager = {
        lastSelectedText: '',
        selectionTimer: null,
        onTextSelected: null,
        
        init() {
            document.addEventListener('mouseup', () => {
                const selectedText = window.getSelection().toString().trim();
                if (selectedText) {
                    console.log('[DOT] Info: 当前选中内容:', selectedText);
                    this.lastSelectedText = selectedText;

                    if (typeof this.onTextSelected === 'function') {
                        this.onTextSelected(selectedText);
                    }
                    
                    if (this.selectionTimer) {
                        clearTimeout(this.selectionTimer);
                    }
                    this.selectionTimer = setTimeout(() => {
                    }, 5000);
                }
            });
        },
        
        getSelectedText() {
            return this.lastSelectedText;
        },
        
        async processSelectedText() {
            try {
                const selectedText = this.getSelectedText();
                if (!selectedText) {
                    console.log('[DOT] Info: 未收到任何文本，不执行 API 调用流程');
                    return;
                }

                const { panel, dotTitle, loadingTimer, DotContent } = UIManager.prepareDotPanel();
                
                try {
                    const responseText = await ApiService.processText(selectedText);
                    UIManager.updateDotPanelWithResult(dotTitle, loadingTimer, DotContent, responseText);
                } catch (error) {
                    clearInterval(loadingTimer);
                    dotTitle.textContent = '出错了';
                    DotContent.innerHTML = `<div class="error-message">${error.message || '未知错误'}</div>`;
                    UIManager.showAlert(error.message || '处理失败', 'error');
                }
            } catch (error) {
                UIManager.showAlert(error.message || '操作失败', 'error');
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
            }
        }
    };

    DOTApp.init();
})();
