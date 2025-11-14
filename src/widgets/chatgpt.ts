import type { Widget, WidgetContent } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { preventWidgetKeyboardDrag } from '../types/widget';

export interface ChatGPTContent extends WidgetContent {
  apiKey: string;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  systemPrompt: string;
}

class ChatGPTWidgetRenderer implements WidgetRenderer {
  configure(widget: Widget): void {
    const container = document.getElementById(`widget-${widget.id}`)?.querySelector('.widget-content') as HTMLElement;
    if (container) {
      this.showSettings(container, widget);
    }
  }

  render(container: HTMLElement, widget: Widget): void {
    const content = widget.content as ChatGPTContent;
    
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface);
      border-radius: 8px;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      color: white;
      font-weight: bold;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    
    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    headerLeft.innerHTML = `
      <span>🤖</span>
      <span>ChatGPT (${content.model})</span>
    `;
    
    // Settings button - always visible for now to debug
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Settings';
    settingsBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.3);
      border: none;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 18px;
      color: white;
      flex-shrink: 0;
    `;
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSettings(container, widget);
    });
    settingsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    
    header.appendChild(headerLeft);
    header.appendChild(settingsBtn);

    // Messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'chatgpt-messages';
    messagesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    // Render existing messages
    content.messages.forEach(msg => {
      const messageEl = this.createMessageElement(msg);
      messagesContainer.appendChild(messageEl);
    });

    // Show setup message if no API key
    if (!content.apiKey) {
      const setupMsg = document.createElement('div');
      setupMsg.style.cssText = `
        padding: 16px;
        background: rgba(255, 193, 7, 0.2);
        border: 1px solid #FFC107;
        border-radius: 8px;
        color: var(--text);
        text-align: center;
      `;
      setupMsg.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px;">⚠️ API Key Required</div>
        <div style="font-size: 12px; opacity: 0.8;">
          Click the widget to select it, then click the ⚙️ settings button to add your API key.<br>
          Get yours at <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #2196F3;">platform.openai.com</a>
        </div>
      `;
      messagesContainer.appendChild(setupMsg);
    }

    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      padding: 16px;
      border-top: 1px solid var(--border);
      background: var(--surface);
    `;

    const inputWrapper = document.createElement('div');
    inputWrapper.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    const input = document.createElement('textarea');
    input.placeholder = content.apiKey ? 'Type your message...' : 'Add API key to start chatting';
    input.disabled = !content.apiKey;
    input.style.cssText = `
      flex: 1;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--background);
      color: var(--text);
      font-size: 14px;
      resize: none;
      min-height: 40px;
      max-height: 100px;
      font-family: inherit;
    `;

    const sendBtn = document.createElement('button');
    sendBtn.innerHTML = '➤';
    sendBtn.disabled = !content.apiKey;
    sendBtn.style.cssText = `
      padding: 10px 16px;
      background: var(--shadow);
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 18px;
      transition: opacity 0.2s;
      opacity: ${content.apiKey ? '1' : '0.5'};
    `;

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(sendBtn);
    inputContainer.appendChild(inputWrapper);

    container.appendChild(header);
    container.appendChild(messagesContainer);
    container.appendChild(inputContainer);

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Send message function
    const sendMessage = async () => {
      const text = input.value.trim();
      if (!text || !content.apiKey) return;

      // Add user message
      const userMessage = {
        role: 'user' as const,
        content: text,
        timestamp: Date.now()
      };
      content.messages.push(userMessage);
      messagesContainer.appendChild(this.createMessageElement(userMessage));

      // Clear input
      input.value = '';
      input.style.height = '40px';

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Show typing indicator
      const typingIndicator = document.createElement('div');
      typingIndicator.style.cssText = `
        padding: 12px;
        background: var(--surface-hover);
        border-radius: 8px;
        color: var(--text);
        font-size: 14px;
        font-style: italic;
        opacity: 0.7;
      `;
      typingIndicator.textContent = 'ChatGPT is typing...';
      messagesContainer.appendChild(typingIndicator);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      try {
        // Prepare the request payload
        const requestPayload = {
          model: content.model,
          messages: [
            { role: 'system', content: content.systemPrompt },
            ...content.messages.map(m => ({ role: m.role, content: m.content }))
          ],
          temperature: 0.7,
          max_tokens: 1000
        };
        
        console.log('Sending to OpenAI:', {
          model: requestPayload.model,
          messageCount: requestPayload.messages.length,
          apiKeyPrefix: content.apiKey.substring(0, 7) + '...'
        });

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${content.apiKey}`
          },
          body: JSON.stringify(requestPayload)
        });

        typingIndicator.remove();

        const data = await response.json();
        
        // Check for errors in response
        if (!response.ok || data.error) {
          const errorMessage = data.error?.message || `API Error (${response.status})`;
          console.error('OpenAI API Error:', data);
          throw new Error(errorMessage);
        }

        const assistantMessage = {
          role: 'assistant' as const,
          content: data.choices[0].message.content,
          timestamp: Date.now()
        };

        content.messages.push(assistantMessage);
        messagesContainer.appendChild(this.createMessageElement(assistantMessage));
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Trigger save
        const event = new CustomEvent('widget-update', {
          detail: { id: widget.id, content }
        });
        document.dispatchEvent(event);

      } catch (error) {
        typingIndicator.remove();
        
        const errorMsg = {
          role: 'assistant' as const,
          content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
          timestamp: Date.now()
        };
        content.messages.push(errorMsg);
        messagesContainer.appendChild(this.createMessageElement(errorMsg));
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Prevent widget dragging when interacting with input
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('keyup', (e) => e.stopPropagation());
    sendBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  private createMessageElement(message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }): HTMLElement {
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.5;
      ${message.role === 'user' 
        ? 'background: var(--accent); color: white; align-self: flex-end; max-width: 80%;' 
        : 'background: var(--surface-hover); color: var(--text); max-width: 90%;'}
    `;

    const contentDiv = document.createElement('div');
    contentDiv.style.whiteSpace = 'pre-wrap';
    contentDiv.textContent = message.content;

    const timeDiv = document.createElement('div');
    timeDiv.style.cssText = `
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.6;
    `;
    timeDiv.textContent = new Date(message.timestamp).toLocaleTimeString();

    messageEl.appendChild(contentDiv);
    messageEl.appendChild(timeDiv);

    return messageEl;
  }

  private showSettings(container: HTMLElement, widget: Widget): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      color: var(--text);
    `;

    const settingsContainer = document.createElement('div');
    this.renderEditDialog(settingsContainer, widget);

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
      display: flex;
      gap: 12px;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      flex: 1;
      padding: 12px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      cursor: pointer;
      font-size: 14px;
    `;
    closeBtn.onclick = () => {
      overlay.remove();
      // Just update the header text to show the new model
      const widgetContent = widget.content as unknown as ChatGPTContent;
      const header = container.querySelector('div') as HTMLElement;
      if (header) {
        const headerLeft = header.querySelector('div') as HTMLElement;
        if (headerLeft) {
          headerLeft.innerHTML = `
            <span>🤖</span>
            <span>ChatGPT (${widgetContent.model})</span>
          `;
        }
      }
    };

    buttonGroup.appendChild(closeBtn);

    modal.appendChild(settingsContainer);
    modal.appendChild(buttonGroup);
    overlay.appendChild(modal);

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        // Just update the header text to show the new model
        const widgetContent = widget.content as unknown as ChatGPTContent;
        const header = container.querySelector('div') as HTMLElement;
        if (header) {
          const headerLeft = header.querySelector('div') as HTMLElement;
          if (headerLeft) {
            headerLeft.innerHTML = `
              <span>🤖</span>
              <span>ChatGPT (${widgetContent.model})</span>
            `;
          }
        }
      }
    };

    document.body.appendChild(overlay);
  }

  renderEditDialog(container: HTMLElement, widget: Widget): void {
    const content = widget.content as unknown as ChatGPTContent;
    
    container.innerHTML = '';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 20px;
      max-width: 500px;
    `;

    container.innerHTML = `
      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--text);">
          OpenAI API Key <span style="color: #f44336;">*</span>
        </label>
        <input type="password" id="api-key" value="${content.apiKey}" placeholder="sk-..." style="
          width: 100%;
          padding: 10px;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--background);
          color: var(--text);
          font-size: 14px;
        ">
        <small style="display: block; margin-top: 4px; opacity: 0.7; color: var(--text);">
          Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #2196F3;">OpenAI Platform</a>
        </small>
      </div>

      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--text);">
          Model
        </label>
        <select id="model" style="
          width: 100%;
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--background);
          color: var(--text);
          font-size: 14px;
        ">
          <option value="gpt-3.5-turbo" ${content.model === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo (Cheaper, faster)</option>
          <option value="gpt-4" ${content.model === 'gpt-4' ? 'selected' : ''}>GPT-4 (Most capable)</option>
          <option value="gpt-4-turbo" ${content.model === 'gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo (Faster GPT-4)</option>
          <option value="gpt-4o" ${content.model === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Latest, multimodal)</option>
          <option value="gpt-4o-mini" ${content.model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Affordable)</option>
          <option value="o1-preview" ${content.model === 'o1-preview' ? 'selected' : ''}>o1 Preview (Advanced reasoning)</option>
          <option value="o1-mini" ${content.model === 'o1-mini' ? 'selected' : ''}>o1 Mini (Fast reasoning)</option>
        </select>
      </div>

      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--text);">
          System Prompt
        </label>
        <textarea id="system-prompt" rows="3" style="
          width: 100%;
          padding: 10px;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--background);
          color: var(--text);
          font-size: 14px;
          resize: vertical;
          font-family: inherit;
        ">${content.systemPrompt}</textarea>
        <small style="display: block; margin-top: 4px; opacity: 0.7; color: var(--text);">
          Define the assistant's behavior and personality
        </small>
      </div>

      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--text);">
          Chat History
        </label>
        <button id="clear-history" style="
          padding: 8px 16px;
          background: rgba(244, 67, 54, 0.2);
          border: 1px solid #f44336;
          border-radius: 6px;
          color: #f44336;
          cursor: pointer;
          font-size: 14px;
        ">🗑️ Clear All Messages</button>
        <small style="display: block; margin-top: 4px; opacity: 0.7; color: var(--text);" id="message-count">
          ${content.messages.length} message(s) in history
        </small>
      </div>

      <div style="
        padding: 12px;
        background: rgba(33, 150, 243, 0.2);
        border: 1px solid #2196F3;
        border-radius: 6px;
        color: var(--text);
        font-size: 13px;
      ">
        <div style="font-weight: bold; margin-bottom: 4px;">💡 Pricing Info</div>
        <div style="opacity: 0.9;">
          • GPT-3.5: $0.0015/$0.002 per 1K tokens<br>
          • GPT-4o: $0.005/$0.015 per 1K tokens<br>
          • GPT-4: $0.03/$0.06 per 1K tokens<br>
          <a href="https://openai.com/pricing" target="_blank" style="color: #2196F3;">View full pricing</a>
        </div>
      </div>
    `;

    // Get input elements
    const apiKeyInput = container.querySelector('#api-key') as HTMLInputElement;
    const modelSelect = container.querySelector('#model') as HTMLSelectElement;
    const systemPromptInput = container.querySelector('#system-prompt') as HTMLTextAreaElement;
    const clearHistoryBtn = container.querySelector('#clear-history') as HTMLButtonElement;
    const messageCount = container.querySelector('#message-count') as HTMLElement;

    // Update content when inputs change
    const updateContent = () => {
      content.apiKey = apiKeyInput.value.trim();
      content.model = modelSelect.value;
      content.systemPrompt = systemPromptInput.value;
      
      // Dispatch update event to save changes
      const event = new CustomEvent('widget-update', {
        bubbles: true,
        detail: { 
          id: widget.id, 
          content: content 
        }
      });
      document.dispatchEvent(event);
    };

    apiKeyInput.addEventListener('input', updateContent);
    modelSelect.addEventListener('change', updateContent);
    systemPromptInput.addEventListener('input', updateContent);

    // Prevent keyboard events from moving the widget
    preventWidgetKeyboardDrag(apiKeyInput);
    preventWidgetKeyboardDrag(systemPromptInput);
    modelSelect.addEventListener('keydown', (e) => e.stopPropagation());
    modelSelect.addEventListener('keyup', (e) => e.stopPropagation());

    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all chat messages?')) {
        content.messages = [];
        messageCount.textContent = '0 message(s) in history';
        updateContent();
      }
    });
  }
}

export const widget = {
  type: 'chatgpt',
  name: 'ChatGPT',
  icon: '🤖',
  description: 'Chat with OpenAI GPT models',
  renderer: new ChatGPTWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: {
    apiKey: '',
    model: 'gpt-3.5-turbo',
    messages: [],
    systemPrompt: 'You are a helpful assistant.'
  }
};
