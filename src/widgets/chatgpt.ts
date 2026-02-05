import type { Widget } from '../types/types';
import type { WidgetRenderer } from '../types/base-widget';
import { preventWidgetKeyboardDrag } from '../types/widget';
import { credentialsService } from '../services/credentials';
import { authService } from '../services/auth';

export interface ChatGPTContent {
  apiKey?: string; // Deprecated - use credentialId
  credentialId?: number;
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
    const content = (widget.content || {}) as ChatGPTContent;
    
    // Ensure messages array exists (may be removed by sanitizer)
    if (!content.messages) {
      content.messages = [];
    }
    
    // Ensure required fields exist
    if (!content.model) {
      content.model = 'gpt-3.5-turbo';
    }
    if (!content.systemPrompt) {
      content.systemPrompt = 'You are a helpful assistant.';
    }

    container.className = 'chatgpt-container';

    // Header
    const header = document.createElement('div');
    header.className = 'chatgpt-header';
    
    const headerLeft = document.createElement('div');
    headerLeft.className = 'chatgpt-header-left';
    headerLeft.innerHTML = `
      <span><i class="fas fa-robot"></i></span>
      <span>ChatGPT (${content.model})</span>
    `;
    
    // Settings button - always visible for now to debug
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
    settingsBtn.title = 'Settings';
    settingsBtn.className = 'chatgpt-settings-button';
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

    // Render existing messages (if any)
    if (content.messages && Array.isArray(content.messages)) {
      content.messages.forEach(msg => {
        const messageEl = this.createMessageElement(msg);
        messagesContainer.appendChild(messageEl);
      });
    }

    // Show setup message if no credential
    if (!content.credentialId && !content.apiKey) {
      const setupMsg = document.createElement('div');
      setupMsg.className = 'chatgpt-setup-message';
      setupMsg.innerHTML = `
        <div class="chatgpt-setup-message-title"><i class="fas fa-exclamation-triangle"></i> API Key Required</div>
        <div class="chatgpt-setup-message-content">
          Click the widget to select it, then click the <i class="fas fa-cog"></i> settings button to add your API key.<br>
          Get yours at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>
        </div>
      `;
      messagesContainer.appendChild(setupMsg);
    }

    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'chatgpt-input-container';

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'chatgpt-input-wrapper';

    const input = document.createElement('textarea');
    input.placeholder = content.apiKey ? 'Type your message...' : 'Add API key to start chatting';
    input.disabled = !content.apiKey;
    input.className = 'chatgpt-input';

    const sendBtn = document.createElement('button');
    sendBtn.innerHTML = '➤';
    sendBtn.disabled = !content.apiKey;
    sendBtn.className = 'chatgpt-send-button';

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
      typingIndicator.className = 'chatgpt-typing';
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
          messageCount: requestPayload.messages.length
        });

        // Call OpenAI API via proxy if using credentialId, otherwise direct
        let response;
        if (content.credentialId) {
          // Use proxy with credential
          const proxyUrl = new URL('/api/openai/chat', window.location.origin.replace(':3000', ':3001'));
          proxyUrl.searchParams.set('credentialId', content.credentialId.toString());
          
          response = await fetch(proxyUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authService.getToken() || ''}`
            },
            body: JSON.stringify(requestPayload)
          });
        } else if (content.apiKey) {
          // Legacy: direct call with API key
          response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${content.apiKey}`
            },
            body: JSON.stringify(requestPayload)
          });
        } else {
          throw new Error('No credential configured');
        }

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
          content: `<i class=\"fas fa-times\"></i> Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
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
    messageEl.className = message.role === 'user' 
      ? 'chatgpt-message chatgpt-message-user'
      : 'chatgpt-message chatgpt-message-assistant';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chatgpt-message-content';
    contentDiv.textContent = message.content;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'chatgpt-message-time';
    timeDiv.textContent = new Date(message.timestamp).toLocaleTimeString();

    messageEl.appendChild(contentDiv);
    messageEl.appendChild(timeDiv);

    return messageEl;
  }

  private showSettings(container: HTMLElement, widget: Widget): void {
    const overlay = document.createElement('div');
    overlay.className = 'chatgpt-settings-overlay';

    const modal = document.createElement('div');
    modal.className = 'chatgpt-settings-modal';

    const settingsContainer = document.createElement('div');
    this.renderEditDialog(settingsContainer, widget);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'chatgpt-button-group';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'chatgpt-close-button';
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
    container.className = 'chatgpt-settings-container';

    container.innerHTML = `
      <div class="chatgpt-settings-field">
        <label class="chatgpt-settings-label">
          OpenAI Credentials <span class="chatgpt-settings-label-required">*</span>
        </label>
        <select id="credential-select" class="chatgpt-settings-select">
          <option value="">Select saved credential...</option>
        </select>
        <small class="chatgpt-settings-hint">
          💡 Tip: Create OpenAI credentials from the user menu (🔐 Credentials). Use type: Generic, store your API key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>
        </small>
      </div>

      <div class="chatgpt-settings-field">
        <label class="chatgpt-settings-label">
          Model
        </label>
        <select id="model" class="chatgpt-settings-select">
          <option value="gpt-3.5-turbo" ${content.model === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo (Cheaper, faster)</option>
          <option value="gpt-4" ${content.model === 'gpt-4' ? 'selected' : ''}>GPT-4 (Most capable)</option>
          <option value="gpt-4-turbo" ${content.model === 'gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo (Faster GPT-4)</option>
          <option value="gpt-4o" ${content.model === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Latest, multimodal)</option>
          <option value="gpt-4o-mini" ${content.model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Affordable)</option>
          <option value="o1-preview" ${content.model === 'o1-preview' ? 'selected' : ''}>o1 Preview (Advanced reasoning)</option>
          <option value="o1-mini" ${content.model === 'o1-mini' ? 'selected' : ''}>o1 Mini (Fast reasoning)</option>
        </select>
      </div>

      <div class="chatgpt-settings-field">
        <label class="chatgpt-settings-label">
          System Prompt
        </label>
        <textarea id="system-prompt" rows="3" class="chatgpt-settings-textarea">${content.systemPrompt}</textarea>
        <small class="chatgpt-settings-hint">
          Define the assistant's behavior and personality
        </small>
      </div>

      <div class="chatgpt-settings-field">
        <label class="chatgpt-settings-label">
          Chat History
        </label>
        <button id="clear-history" class="chatgpt-clear-button">🗑️ Clear All Messages</button>
        <small class="chatgpt-settings-hint" id="message-count">
          ${content.messages.length} message(s) in history
        </small>
      </div>

      <div class="chatgpt-pricing-info">
        <div class="chatgpt-pricing-info-title">💡 Pricing Info</div>
        <div class="chatgpt-pricing-info-content">
          • GPT-3.5: $0.0015/$0.002 per 1K tokens<br>
          • GPT-4o: $0.005/$0.015 per 1K tokens<br>
          • GPT-4: $0.03/$0.06 per 1K tokens<br>
          <a href="https://openai.com/pricing" target="_blank">View full pricing</a>
        </div>
      </div>
    `;

    // Load credentials into the select
    const credentialSelect = container.querySelector('#credential-select') as HTMLSelectElement;
    (async () => {
      try {
        const credentials = await credentialsService.getAll();
        // For now, show all generic credentials - could filter by service_type in future
        credentials.forEach(cred => {
          const option = document.createElement('option');
          option.value = cred.id.toString();
          option.textContent = `🔑 ${cred.name}${cred.description ? ` - ${cred.description}` : ''}`;
          credentialSelect.appendChild(option);
        });

        // Set current credential if exists
        if (content.credentialId) {
          credentialSelect.value = content.credentialId.toString();
        }
      } catch (error) {
        console.error('Failed to load credentials:', error);
      }
    })();

    // Get input elements
    const modelSelect = container.querySelector('#model') as HTMLSelectElement;
    const systemPromptInput = container.querySelector('#system-prompt') as HTMLTextAreaElement;
    const clearHistoryBtn = container.querySelector('#clear-history') as HTMLButtonElement;
    const messageCount = container.querySelector('#message-count') as HTMLElement;

    // Update content when inputs change
    const updateContent = () => {
      const credId = credentialSelect.value;
      content.credentialId = credId ? parseInt(credId) : undefined;
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

    credentialSelect.addEventListener('change', updateContent);
    modelSelect.addEventListener('change', updateContent);
    systemPromptInput.addEventListener('input', updateContent);

    // Prevent keyboard events from moving the widget
    credentialSelect.addEventListener('keydown', (e) => e.stopPropagation());
    credentialSelect.addEventListener('keyup', (e) => e.stopPropagation());
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
  icon: '<i class="fas fa-robot"></i>',
  description: 'Chat with OpenAI GPT models',
  renderer: new ChatGPTWidgetRenderer(),
  defaultSize: { w: 400, h: 500 },
  defaultContent: {
    credentialId: undefined,
    model: 'gpt-3.5-turbo',
    messages: [],
    systemPrompt: 'You are a helpful assistant.'
  }
};
