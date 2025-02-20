// ==UserScript==
// @name         Dotrans
// @namespace    https://github.com/cattail-mutt/
// @version      1.0
// @description  圆点翻译：划词翻译，支持 OpenAI API 与流式输出。
// @author       Mukai
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @resource     STYLE https://raw.githubusercontent.com/cattail-mutt/dotrans/refs/heads/main/resources/style.css
// @resource     PROMPTS https://raw.githubusercontent.com/cattail-mutt/dotrans/refs/heads/main/resources/prompts.yaml
// @require      https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js
// ==/UserScript==

(function () {
    'use strict';
    
    const DEFAULT_CONFIG = {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        apiKey: '',
        temperature: 0.7,
        currentPromptIndex: 0,
    };
    const styleText = GM_getResourceText('STYLE');
    const promptsText = GM_getResourceText('PROMPTS');
    GM_addStyle(styleText);
    GM_registerMenuCommand('打开配置面板', () => {
        openConfigPanel();
    });

    console.log(`[Dotrans] Info: CSS 解析完成（前80个字符）： ${styleText.substring(0, 80)}...`);
    console.log('[Dotrans] Info: Prompts 解析完成（前80个字符）：', promptsText.substring(0, 80) + '...');

    function showAlert(message, type = 'success', duration = 3000) {
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
    }

    function getConfig() {
        return {
            endpoint: GM_getValue('endpoint', DEFAULT_CONFIG.endpoint),
            model: GM_getValue('model', DEFAULT_CONFIG.model),
            apiKey: GM_getValue('apiKey', DEFAULT_CONFIG.apiKey),
            temperature: GM_getValue('temperature', DEFAULT_CONFIG.temperature),
            currentPromptIndex: GM_getValue('currentPromptIndex', DEFAULT_CONFIG.currentPromptIndex),
            systemPrompts: GM_getValue('systemPrompts', loadPrompts())
        };
    }

    function setConfig(newConfig) {
        GM_setValue('endpoint', newConfig.endpoint);
        GM_setValue('model', newConfig.model);
        GM_setValue('apiKey', newConfig.apiKey);
        GM_setValue('temperature', newConfig.temperature);
        GM_setValue('currentPromptIndex', newConfig.currentPromptIndex);
        GM_setValue('systemPrompts', newConfig.systemPrompts);
    }

    function loadPrompts() {
        const promptsData = jsyaml.load(promptsText);
        return Object.entries(promptsData).map(([key, value]) => ({
            title: key,
            prompt: value
        }));
    }

    let configPanel = null;

    function renderPromptOptions(prompts) {
        return prompts.map(p => `<option value="${p.title}"></option>`).join('\n');
    }

    function updatePromptDatalist(panel) {
        const curCfg = getConfig();
        const datalist = panel.querySelector('#prompt-selector-list');
        datalist.innerHTML = renderPromptOptions(curCfg.systemPrompts);
    }

    function renderPromptActions(systemPrompts) {
        return systemPrompts.map((p, idx) => `
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
    }

    function handlePromptActions(e) {
        const target = e.target;
        const promptActionsEl = e.currentTarget;
        if (target.matches('button[data-edit]')) {
            const idx = target.getAttribute('data-edit');
            const editDiv = promptActionsEl.querySelector(`#edit-${idx}`);
            editDiv.style.display = 'block';
        } else if (target.matches('button[data-save-edit]')) {
            const idx = parseInt(target.getAttribute('data-save-edit'), 10);
            let cfg = getConfig();
            const newTitle = document.getElementById(`edit-title-${idx}`).value.trim();
            const newText = document.getElementById(`edit-text-${idx}`).value.trim();
            if (!newTitle || !newText) {
                showAlert('标题和内容不能为空！', 'error');
                return;
            }
            cfg.systemPrompts[idx] = { title: newTitle, prompt: newText };
            setConfig(cfg);
            showAlert('Prompt 已更新！', 'success');
            updatePromptDatalist(configPanel);
            promptActionsEl.querySelector(`#edit-${idx}`).style.display = 'none';
        } else if (target.matches('button[data-del]')) {
            const idx = parseInt(target.getAttribute('data-del'), 10);
            let cfg = getConfig();
            if (cfg.systemPrompts[idx]) {
                cfg.systemPrompts.splice(idx, 1);
                if (cfg.currentPromptIndex >= cfg.systemPrompts.length)
                    cfg.currentPromptIndex = 0;
                setConfig(cfg);
                showAlert('Prompt 已删除！', 'warning');
                updatePromptDatalist(configPanel);
                configPanel.querySelector('#manage-prompt-btn').click();
            }
        }
    }

    function openConfigPanel() {
        if (configPanel) {
            configPanel.classList.remove('hide');
            updatePromptDatalist(configPanel);
            return;
        }

        configPanel = document.createElement('div');
        configPanel.className = 'config-panel';
        const currentConfig = getConfig();

        configPanel.innerHTML = `
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
                    <datalist id="prompt-selector-list">
                        ${renderPromptOptions(currentConfig.systemPrompts)}
                    </datalist>
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
                    <input type="text" id="model" value="${currentConfig.model}">
                    <label for="temperature">Temperature</label>
                    <input type="number" id="temperature" step="0.1" value="${currentConfig.temperature}">
                    <label for="endpoint">Endpoint</label>
                    <input type="text" id="endpoint" value="${currentConfig.endpoint}">
                    <label for="apikey">API Key</label>
                    <input type="text" id="apikey" value="${currentConfig.apiKey}">
                </fieldset>
            </div>
            <div class="config-footer">
                <button class="config-save">Save Config</button>
            </div>
        `;
        document.body.appendChild(configPanel);

        configPanel.querySelector('.config-close').addEventListener('click', () => {
            configPanel.classList.add('hide');
        });

        const promptActionsEl = configPanel.querySelector('#prompt-actions');
        if (!promptActionsEl._eventsBound) {
            promptActionsEl.addEventListener('click', handlePromptActions);
            promptActionsEl._eventsBound = true;
        }

        configPanel.querySelector('#prompt-selector').addEventListener('change', (e) => {
            const sel = e.target.value;
            const cfg = getConfig();
            const idx = cfg.systemPrompts.findIndex(p => p.title === sel);
            if (idx >= 0) {
                configPanel.dataset.currentPromptIndex = idx;
            } else {
                delete configPanel.dataset.currentPromptIndex;
            }
        });

        configPanel.querySelector('#new-prompt-btn').addEventListener('click', () => {
            const promptActions = configPanel.querySelector('#prompt-actions');
            promptActions.style.display = 'block';
            promptActions.innerHTML = `
                <label for="new-prompt-title">Title</label>
                <input type="text" id="new-prompt-title" placeholder="Prompt 标题">
                <label for="new-prompt-text">Content</label>
                <textarea id="new-prompt-text" placeholder="Prompt 内容"></textarea>
                <button id="save-new-prompt-btn">Save</button>
            `;
            configPanel.querySelector('#save-new-prompt-btn').addEventListener('click', () => {
                const title = promptActions.querySelector('#new-prompt-title').value.trim();
                const text = promptActions.querySelector('#new-prompt-text').value.trim();
                if (!title || !text) {
                    showAlert('标题和内容不能为空！', 'error');
                    return;
                }
                let cfg = getConfig();
                cfg.systemPrompts.push({ title, prompt: text });
                cfg.currentPromptIndex = cfg.systemPrompts.length - 1;
                setConfig(cfg);
                showAlert('Prompt 已添加', 'success');
                updatePromptDatalist(configPanel);
                promptActions.style.display = 'none';
            });
        });

        configPanel.querySelector('#manage-prompt-btn').addEventListener('click', () => {
            const promptActions = configPanel.querySelector('#prompt-actions');
            promptActions.style.display = 'block';
            let cfg = getConfig();
            promptActions.innerHTML = renderPromptActions(cfg.systemPrompts);
        });

        configPanel.querySelector('.config-save').addEventListener('click', () => {
            const endpoint = configPanel.querySelector('#endpoint').value.trim();
            const model = configPanel.querySelector('#model').value.trim();
            const temperature = parseFloat(configPanel.querySelector('#temperature').value);
            const apiKey = configPanel.querySelector('#apikey').value.trim();
            let cfg = getConfig();
            cfg.endpoint = endpoint;
            cfg.model = model;
            cfg.temperature = temperature;
            cfg.apiKey = apiKey;
            setConfig(cfg);
            showAlert('配置已保存！', 'success');
            configPanel.classList.add('hide');
        });
    }

    let floatingBtn = document.createElement('div');
    floatingBtn.className = 'float-btn';
    document.body.appendChild(floatingBtn);

    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;
    let freezeBtn = false;

    document.addEventListener('mousemove', (e) => {
        if (!freezeBtn) {
            targetX = e.clientX + 30;
            targetY = e.clientY + 30;
        }
    });

    function animateBtn() {
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        currentX += dx * 0.1;
        currentY += dy * 0.1;
        floatingBtn.style.left = `${currentX}px`;
        floatingBtn.style.top = `${currentY}px`;
        requestAnimationFrame(animateBtn);
    }
    requestAnimationFrame(animateBtn);

    let selectionTimer = null;
    let lastSelectedText = '';

    document.addEventListener('mouseup', () => {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            console.log('[Dotrans] Info: 当前选中内容:', selectedText);
            lastSelectedText = selectedText;
            freezeBtn = true;
            if (selectionTimer) {
                clearTimeout(selectionTimer);
            }
            selectionTimer = setTimeout(() => {
                freezeBtn = false;
            }, 5000);
        }
    });

    let translatePanel = null;

    floatingBtn.addEventListener('click', () => {
        const selectedText = lastSelectedText;
        console.log('[Dotrans] Info: 当前选中内容:', selectedText);

        if (!selectedText) {
            console.log('[Dotrans] Info: 未收到任何文本，不执行翻译流程');
            return;
        }

        showTranslatePanel();

        const translateBody = translatePanel.querySelector('.translate-body');
        translateBody.innerHTML = `
            <div class="translate-loading" id="gmLoadingText">🔍翻译中.</div>
            <div class="translate-text" id="gmTranslateContent"></div>
        `;

        let dotCount = 1;
        const loadingEl = document.getElementById('gmLoadingText');
        const loadingTimer = setInterval(() => {
            dotCount = (dotCount % 3) + 1;
            loadingEl.textContent = '🔍翻译中' + '.'.repeat(dotCount);
        }, 500);

        const cfg = getConfig();
        if (!cfg.apiKey) {
            clearInterval(loadingTimer);
            translateBody.innerHTML = `<div class="translate-error">未设置 API Key</div>`;
            return;
        }

        const selectedPrompt = cfg.systemPrompts[cfg.currentPromptIndex];
        if (!selectedPrompt) {
            clearInterval(loadingTimer);
            translateBody.innerHTML = `<div class="translate-error">未找到指定的 System Prompt</div>`;
            return;
        }

        const translateContent = document.getElementById('gmTranslateContent');
        fetchStreamTranslation({
            endpoint: cfg.endpoint,
            model: cfg.model,
            apiKey: cfg.apiKey,
            systemPrompt: selectedPrompt.prompt,
            text: selectedText
        }, (chunk) => {
            translateContent.textContent += chunk;
        }).then(() => {
            clearInterval(loadingTimer);
            loadingEl.remove();
            console.log('[Dotrans] Info: 翻译完成');
        }).catch(err => {
            clearInterval(loadingTimer);
            loadingEl.remove();
            translateContent.innerHTML = `<div class="translate-error">${err.message}</div>`;
            console.error('[Dotrans] Error: 请求错误:', err);
        });
    });

    function showTranslatePanel() {
        console.log('[Dotrans] Info: 正在打开翻译面板...');
        if (!translatePanel) {
            translatePanel = document.createElement('div');
            translatePanel.className = 'translate-panel';
            translatePanel.innerHTML = `
                <div class="translate-header">
                    <div class="translate-title">翻译结果</div>
                    <div class="translate-close">&times;</div>
                </div>
                <div class="translate-body"></div>
            `;
            document.body.appendChild(translatePanel);

            translatePanel.querySelector('.translate-close').addEventListener('click', () => {
                translatePanel.classList.add('hide');
                setTimeout(() => {
                    translatePanel.remove();
                    translatePanel = null;
                }, 300);
            });
        } else {
            translatePanel.classList.remove('hide');
        }
    }
    
    async function fetchStreamTranslation({ endpoint, model, apiKey, systemPrompt, text }, onChunk) {
        console.log(`[Dotrans] Info: 系统提示词：${systemPrompt}`);
        console.log(`[Dotrans] Info: 用户输入：${text}`);
        const payload = {
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            stream: true
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorText = await response.text();
            throw new Error(`翻译请求失败: ${errorText}`);
        }

        const reader = response.body.getReader();
        let partial = '';
        let doneFlag = false;
        while (!doneFlag) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = new TextDecoder('utf-8').decode(value);
            const lines = chunkText.split('\n').filter(line => line.trim());
            for (let line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.replace(/^data: /, '');
                    if (jsonStr === '[DONE]') {
                        doneFlag = true;
                        break;
                    }
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const delta = parsed.choices[0].delta.content || '';
                        if (delta) {
                            partial += delta;
                            onChunk(delta);
                        }
                    } catch (e) {
                        console.error('[Dotrans] Error: SSE解析出错', e);
                    }
                }
            }
        }
        return partial;
    }
})();