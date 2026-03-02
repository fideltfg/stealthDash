import type { BackgroundPattern, BackgroundSettings } from '../types/types';

export class BackgroundSettingsUI {
  private onApplyCallback?: (pattern: BackgroundPattern, settings?: BackgroundSettings) => void;

  /**
   * Set the callback to be invoked when background settings are applied
   */
  onApply(callback: (pattern: BackgroundPattern, settings?: BackgroundSettings) => void): void {
    this.onApplyCallback = callback;
  }

  /**
   * Show the background settings dialog
   */
  showDialog(currentPattern: BackgroundPattern, currentSettings?: BackgroundSettings): void {
    const dialog = document.createElement('div');
    dialog.id = 'background-settings-dialog';
    dialog.className = 'dialog';

    const settings = currentSettings || {
      opacity: 100,
      blur: 0,
      brightness: 100,
      objectFit: 'cover',
      playbackRate: 1,
      loop: true,
      muted: true
    };

    dialog.innerHTML = `
      <div class="dialog-container settings-container">
        <div class="dialog-header">
          <h2 class="dialog-title"><i class="fa-solid fa-image"></i> Background Settings</h2>
          <button id="close-background-settings" class="dialog-close-button">×</button>
        </div>

        <!-- Pattern Selection -->
        <div class="section">
          <h3 class="section-title settings-section-title-success"><i class="fa-solid fa-border-all"></i> Background Pattern</h3>
          
          <div class="background-pattern-grid">
            <button class="background-pattern-option ${currentPattern === 'grid' ? 'active' : ''}" data-pattern="grid">
              <i class="fa-solid fa-border-all"></i>
              <span>Grid</span>
            </button>
            <button class="background-pattern-option ${currentPattern === 'dots' ? 'active' : ''}" data-pattern="dots">
              <i class="fa-solid fa-circle"></i>
              <span>Dots</span>
            </button>
            <button class="background-pattern-option ${currentPattern === 'lines' ? 'active' : ''}" data-pattern="lines">
              <i class="fa-solid fa-grip-lines"></i>
              <span>Lines</span>
            </button>
            <button class="background-pattern-option ${currentPattern === 'solid' ? 'active' : ''}" data-pattern="solid">
              <i class="fa-solid fa-square"></i>
              <span>Solid</span>
            </button>
            <button class="background-pattern-option ${currentPattern === 'image' ? 'active' : ''}" data-pattern="image">
              <i class="fa-solid fa-image"></i>
              <span>Image</span>
            </button>
            <button class="background-pattern-option ${currentPattern === 'video' ? 'active' : ''}" data-pattern="video">
              <i class="fa-solid fa-video"></i>
              <span>Video</span>
            </button>
          </div>
        </div>

        <!-- Custom Background Section (shown for image/video) -->
        <div class="section" id="custom-background-section" style="display: ${currentPattern === 'image' || currentPattern === 'video' ? 'block' : 'none'};">
          <h3 class="section-title settings-section-title-info"><i class="fa-solid fa-photo-film"></i> Custom Background</h3>
          
          <div class="form-group">
            <label class="form-label">Background URL</label>
            <input type="text" id="background-url" value="${settings.url || ''}" class="form-input" placeholder="https://example.com/background.${currentPattern === 'video' ? 'mp4' : 'jpg'}">
            <small class="form-hint">Enter a direct URL to ${currentPattern === 'video' ? 'a video file (MP4, WebM)' : 'an image file'}</small>
          </div>

          <div class="form-group">
            <label class="form-label">Or Upload File</label>
            <input type="file" id="background-upload" class="form-input" accept="${currentPattern === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/jpg,image/png,image/gif,image/webp'}">
            <small class="form-hint">Uploaded files are stored locally in your browser</small>
          </div>

          <div class="background-preview" id="background-preview">
            ${settings.url ? (currentPattern === 'video' ? `<video src="${settings.url}" loop muted autoplay playsinline style="width: 100%; height: 200px; object-fit: cover;"></video>` : `<img src="${settings.url}" alt="Background preview" style="width: 100%; height: 200px; object-fit: cover;">`) : '<div class="background-preview-placeholder"><i class="fa-solid fa-image"></i><span>No background selected</span></div>'}
          </div>
        </div>

        <!-- Display Settings -->
        <div class="section" id="display-settings-section" style="display: ${currentPattern === 'image' || currentPattern === 'video' ? 'block' : 'none'};">
          <h3 class="section-title settings-section-title-warning"><i class="fa-solid fa-sliders"></i> Display Settings</h3>
          
          <div class="form-group">
            <label class="form-label">Opacity: <span id="opacity-value">${settings.opacity}%</span></label>
            <input type="range" id="background-opacity" min="0" max="100" value="${settings.opacity}" class="form-range">
          </div>

          <div class="form-group">
            <label class="form-label">Blur: <span id="blur-value">${settings.blur}px</span></label>
            <input type="range" id="background-blur" min="0" max="10" value="${settings.blur}" class="form-range">
          </div>

          <div class="form-group">
            <label class="form-label">Brightness: <span id="brightness-value">${settings.brightness}%</span></label>
            <input type="range" id="background-brightness" min="0" max="200" value="${settings.brightness}" class="form-range">
          </div>

          <div class="form-group">
            <label class="form-label">Fit</label>
            <select id="background-fit" class="form-input">
              <option value="cover" ${settings.objectFit === 'cover' ? 'selected' : ''}>Cover (Fill Screen)</option>
              <option value="contain" ${settings.objectFit === 'contain' ? 'selected' : ''}>Contain (Fit Screen)</option>
              <option value="fill" ${settings.objectFit === 'fill' ? 'selected' : ''}>Fill (Stretch)</option>
            </select>
          </div>
        </div>

        <!-- Video Settings -->
        <div class="section" id="video-settings-section" style="display: ${currentPattern === 'video' ? 'block' : 'none'};">
          <h3 class="section-title settings-section-title-info"><i class="fa-solid fa-play-circle"></i> Video Settings</h3>
          
          <div class="form-group">
            <label class="form-label">Playback Speed: <span id="playback-value">${settings.playbackRate || 1}x</span></label>
            <input type="range" id="video-playback" min="0.25" max="2" step="0.25" value="${settings.playbackRate || 1}" class="form-range">
          </div>

          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" id="video-loop" ${settings.loop !== false ? 'checked' : ''}>
              <span>Loop video</span>
            </label>
          </div>

          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" id="video-muted" ${settings.muted !== false ? 'checked' : ''}>
              <span>Muted (recommended to avoid memory issues)</span>
            </label>
          </div>
        </div>

        <div class="dialog-actions">
          <button id="apply-background-btn" class="btn btn-success">
            <i class="fa-solid fa-check"></i> Apply Background
          </button>
          <button id="reset-background-btn" class="btn btn-secondary">
            <i class="fa-solid fa-undo"></i> Reset to Default
          </button>
        </div>

        <div id="background-message" class="message"></div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Get references
    const customSection = dialog.querySelector('#custom-background-section') as HTMLElement;
    const displaySection = dialog.querySelector('#display-settings-section') as HTMLElement;
    const videoSection = dialog.querySelector('#video-settings-section') as HTMLElement;
    const patternButtons = dialog.querySelectorAll('.background-pattern-option');
    const urlInput = dialog.querySelector('#background-url') as HTMLInputElement;
    const uploadInput = dialog.querySelector('#background-upload') as HTMLInputElement;
    const preview = dialog.querySelector('#background-preview') as HTMLElement;
    const opacitySlider = dialog.querySelector('#background-opacity') as HTMLInputElement;
    const blurSlider = dialog.querySelector('#background-blur') as HTMLInputElement;
    const brightnessSlider = dialog.querySelector('#background-brightness') as HTMLInputElement;
    const fitSelect = dialog.querySelector('#background-fit') as HTMLSelectElement;
    const playbackSlider = dialog.querySelector('#video-playback') as HTMLInputElement;
    const loopCheckbox = dialog.querySelector('#video-loop') as HTMLInputElement;
    const mutedCheckbox = dialog.querySelector('#video-muted') as HTMLInputElement;
    const applyBtn = dialog.querySelector('#apply-background-btn') as HTMLButtonElement;
    const resetBtn = dialog.querySelector('#reset-background-btn') as HTMLButtonElement;

    let selectedPattern: BackgroundPattern = currentPattern;
    let backgroundUrl: string | undefined = settings.url;

    // Pattern selection
    patternButtons.forEach(button => {
      button.addEventListener('click', () => {
        patternButtons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        selectedPattern = button.getAttribute('data-pattern') as BackgroundPattern;

        // Show/hide relevant sections
        const isCustom = selectedPattern === 'image' || selectedPattern === 'video';
        customSection.style.display = isCustom ? 'block' : 'none';
        displaySection.style.display = isCustom ? 'block' : 'none';
        videoSection.style.display = selectedPattern === 'video' ? 'block' : 'none';

        // Update file input accept and placeholder
        if (selectedPattern === 'video') {
          uploadInput.accept = 'video/mp4,video/webm';
          urlInput.placeholder = 'https://example.com/background.mp4';
        } else if (selectedPattern === 'image') {
          uploadInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
          urlInput.placeholder = 'https://example.com/background.jpg';
        }
      });
    });

    // URL input
    urlInput.addEventListener('input', () => {
      backgroundUrl = urlInput.value.trim() || undefined;
      this.updatePreview(preview, selectedPattern, backgroundUrl, settings);
    });

    // File upload
    uploadInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Convert to base64 data URL for storage
      const reader = new FileReader();
      reader.onload = (event) => {
        backgroundUrl = event.target?.result as string;
        urlInput.value = file.name; // Show filename
        this.updatePreview(preview, selectedPattern, backgroundUrl, settings);
      };
      reader.readAsDataURL(file);
    });

    // Sliders with live preview
    opacitySlider.addEventListener('input', () => {
      const value = opacitySlider.value;
      document.getElementById('opacity-value')!.textContent = `${value}%`;
      settings.opacity = parseInt(value);
    });

    blurSlider.addEventListener('input', () => {
      const value = blurSlider.value;
      document.getElementById('blur-value')!.textContent = `${value}px`;
      settings.blur = parseInt(value);
    });

    brightnessSlider.addEventListener('input', () => {
      const value = brightnessSlider.value;
      document.getElementById('brightness-value')!.textContent = `${value}%`;
      settings.brightness = parseInt(value);
    });

    fitSelect.addEventListener('change', () => {
      settings.objectFit = fitSelect.value as 'cover' | 'contain' | 'fill';
      this.updatePreview(preview, selectedPattern, backgroundUrl, settings);
    });

    // Video settings
    playbackSlider.addEventListener('input', () => {
      const value = playbackSlider.value;
      document.getElementById('playback-value')!.textContent = `${value}x`;
      settings.playbackRate = parseFloat(value);
    });

    loopCheckbox.addEventListener('change', () => {
      settings.loop = loopCheckbox.checked;
    });

    mutedCheckbox.addEventListener('change', () => {
      settings.muted = mutedCheckbox.checked;
    });

    // Apply button
    applyBtn.addEventListener('click', () => {
      // Validate custom backgrounds have a URL
      if ((selectedPattern === 'image' || selectedPattern === 'video') && !backgroundUrl) {
        this.showMessage(dialog, 'Please provide a background URL or upload a file', false);
        return;
      }

      const finalSettings: BackgroundSettings = {
        url: backgroundUrl,
        opacity: settings.opacity,
        blur: settings.blur,
        brightness: settings.brightness,
        objectFit: settings.objectFit,
        playbackRate: settings.playbackRate,
        loop: settings.loop,
        muted: settings.muted
      };

      if (this.onApplyCallback) {
        this.onApplyCallback(selectedPattern, finalSettings);
      }

      dialog.remove();
    });

    // Reset button
    resetBtn.addEventListener('click', () => {
      if (this.onApplyCallback) {
        this.onApplyCallback('grid', undefined);
      }
      dialog.remove();
    });

    // Close button
    const closeBtn = dialog.querySelector('#close-background-settings') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => dialog.remove());

    // Click outside to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });
  }

  private updatePreview(preview: HTMLElement, pattern: BackgroundPattern, url?: string, settings?: BackgroundSettings): void {
    if (!url || (pattern !== 'image' && pattern !== 'video')) {
      preview.innerHTML = '<div class="background-preview-placeholder"><i class="fa-solid fa-image"></i><span>No background selected</span></div>';
      return;
    }

    const fit = settings?.objectFit || 'cover';
    
    if (pattern === 'video') {
      preview.innerHTML = `<video src="${url}" loop muted autoplay playsinline style="width: 100%; height: 200px; object-fit: ${fit};"></video>`;
    } else {
      preview.innerHTML = `<img src="${url}" alt="Background preview" style="width: 100%; height: 200px; object-fit: ${fit};">`;
    }
  }

  private showMessage(dialog: HTMLElement, message: string, success: boolean): void {
    const messageEl = dialog.querySelector('#background-message') as HTMLElement;
    messageEl.textContent = message;
    messageEl.className = `message ${success ? 'message-success' : 'message-error'}`;
    messageEl.style.display = 'block';

    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 3000);
  }
}
