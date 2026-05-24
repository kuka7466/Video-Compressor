// Element selectors
const uploadSection = document.getElementById('upload-section');
const configSection = document.getElementById('config-section');
const processingSection = document.getElementById('processing-section');
const resultSection = document.getElementById('result-section');

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const changeFileBtn = document.getElementById('change-file-btn');
const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');
const clearTempBtn = document.getElementById('clear-temp-btn');
const shutdownServerBtn = document.getElementById('shutdown-server-btn');
const shutdownOverlay = document.getElementById('shutdown-overlay');

// Form inputs
const targetFormat = document.getElementById('target-format');
const resolutionScale = document.getElementById('resolution-scale');
const audioOption = document.getElementById('audio-option');
const customBitrateContainer = document.getElementById('custom-bitrate-container');
const customBitrateInput = document.getElementById('custom-bitrate');
const videoOptionsRow = document.getElementById('video-options-row');
const compressionGroup = document.getElementById('compression-group');

// State indicators
const radialBar = document.getElementById('radial-bar');
const progressPercentage = document.getElementById('progress-percentage');
const statSpeed = document.getElementById('stat-speed');
const statFps = document.getElementById('stat-fps');
const statEta = document.getElementById('stat-eta');
const terminalContent = document.getElementById('terminal-content');
const statusTitle = document.getElementById('status-title');
const statusSubtitle = document.getElementById('status-subtitle');

// Meta displays
const metaName = document.getElementById('meta-name');
const metaSize = document.getElementById('meta-size');
const metaDuration = document.getElementById('meta-duration');
const metaResolution = document.getElementById('meta-resolution');
const metaFps = document.getElementById('meta-fps');

// Result displays
const sizeBefore = document.getElementById('size-before');
const sizeAfter = document.getElementById('size-after');
const savingsBadge = document.getElementById('savings-badge');
const savingsBarFill = document.getElementById('savings-bar-fill');
const resultFilename = document.getElementById('result-filename');

let currentJobId = null;
let eventSource = null;
let uploadedFileDetails = null;

// Helpers
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function switchView(activeSection) {
  [uploadSection, configSection, processingSection, resultSection].forEach(sec => {
    sec.classList.add('hidden');
    sec.classList.remove('fade-in');
  });
  activeSection.classList.remove('hidden');
  activeSection.classList.add('fade-in');
}

// 1. Drag & Drop Handlers
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    handleFileSelect(files[0]);
  }
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFileSelect(fileInput.files[0]);
  }
});

// File Selection & Upload
function handleFileSelect(file) {
  if (!file.type.startsWith('video/')) {
    alert('Please select a valid video file.');
    return;
  }
  
  // Show uploading status inside drop zone
  dropZone.style.pointerEvents = 'none';
  const originalContent = dropZone.innerHTML;
  
  const uploadProgressHtml = `
    <div class="upload-progress-wrapper">
      <div class="spinner-glow" style="width: 50px; height: 50px;">
        <div class="spinner"></div>
      </div>
      <h3 style="margin-top: 15px;">Uploading video to server...</h3>
      <p id="upload-pct" style="font-size: 24px; font-weight: 800; color: var(--color-cyan); margin-top: 5px;">0%</p>
      <span class="file-limits" id="upload-status-bytes">0 MB of 0 MB</span>
    </div>
  `;
  dropZone.innerHTML = uploadProgressHtml;
  
  const uploadPctEl = document.getElementById('upload-pct');
  const uploadBytesEl = document.getElementById('upload-status-bytes');
  
  const formData = new FormData();
  formData.append('video', file);
  
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);
  
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      uploadPctEl.textContent = `${pct}%`;
      uploadBytesEl.textContent = `${formatBytes(e.loaded)} of ${formatBytes(e.total)}`;
    }
  });
  
  xhr.onreadystatechange = () => {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      dropZone.innerHTML = originalContent;
      dropZone.style.pointerEvents = 'auto';
      
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          currentJobId = response.jobId;
          uploadedFileDetails = response.metadata;
          
          // Populate config fields
          metaName.textContent = uploadedFileDetails.name;
          metaSize.textContent = formatBytes(uploadedFileDetails.size);
          metaDuration.textContent = formatDuration(uploadedFileDetails.duration);
          
          if (uploadedFileDetails.width && uploadedFileDetails.height) {
            metaResolution.textContent = `${uploadedFileDetails.width}x${uploadedFileDetails.height}`;
          } else {
            metaResolution.textContent = 'Unknown';
          }
          
          metaFps.textContent = uploadedFileDetails.fps || 'Unknown';
          
          // Toggle custom sections appropriately
          targetFormat.value = 'mp4';
          toggleFormatSpecificOptions();
          
          switchView(configSection);
        } catch (e) {
          alert('Failed to parse upload response.');
        }
      } else {
        let errMsg = 'Upload failed.';
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.error) errMsg = res.error;
        } catch(e) {}
        alert(errMsg);
      }
    }
  };
  
  xhr.send(formData);
}

// 2. Configuration Section Logic
// Radio Card activation listener
const radioCards = document.querySelectorAll('.radio-card');
radioCards.forEach(card => {
  card.addEventListener('click', () => {
    // Remove active class from other card labels
    const siblingCards = card.parentElement.querySelectorAll('.radio-card');
    siblingCards.forEach(c => c.classList.remove('active'));
    
    card.classList.add('active');
    
    // Check radio input value
    const input = card.querySelector('input[type="radio"]');
    input.checked = true;
    
    // Custom bitrate input toggle
    if (input.value === 'custom') {
      customBitrateContainer.classList.remove('hidden');
    } else {
      customBitrateContainer.classList.add('hidden');
    }
  });
});

// Format change listener to hide/show options (MP3 only needs audio settings)
targetFormat.addEventListener('change', toggleFormatSpecificOptions);

function toggleFormatSpecificOptions() {
  const isAudio = targetFormat.value === 'mp3';
  
  if (isAudio) {
    videoOptionsRow.classList.add('hidden');
    // Change compression titles for audio
    document.querySelectorAll('.radio-card').forEach(card => {
      const val = card.querySelector('input[type="radio"]').value;
      const title = card.querySelector('.radio-title');
      const desc = card.querySelector('.radio-desc');
      
      if (val === 'high') {
        title.textContent = '320kbps (Pro Studio)';
        desc.textContent = 'Ultra high-fidelity CD quality audio track.';
      } else if (val === 'balanced') {
        title.textContent = '192kbps (Balanced)';
        desc.textContent = 'Excellent quality suitable for standard listening.';
      } else if (val === 'max') {
        title.textContent = '128kbps (Economy)';
        desc.textContent = 'Saves maximum disk space. Good for voice logs.';
      } else if (val === 'custom') {
        title.textContent = 'Custom Bitrate';
        desc.textContent = 'Manually specify audio bitrate constraints.';
      }
    });
  } else {
    videoOptionsRow.classList.remove('hidden');
    // Change compression titles back to video
    document.querySelectorAll('.radio-card').forEach(card => {
      const val = card.querySelector('input[type="radio"]').value;
      const title = card.querySelector('.radio-title');
      const desc = card.querySelector('.radio-desc');
      
      if (val === 'high') {
        title.textContent = 'High Quality';
        desc.textContent = 'Visually lossless compression. Minimal size reduction.';
      } else if (val === 'balanced') {
        title.textContent = 'Balanced';
        desc.textContent = 'Best trade-off between file size and quality.';
      } else if (val === 'max') {
        title.textContent = 'Max Compression';
        desc.textContent = 'Smallest file size. Some reduction in quality.';
      } else if (val === 'custom') {
        title.textContent = 'Custom Bitrate';
        desc.textContent = 'Specify output video bitrate manually.';
      }
    });
  }
}

// Start processing event listener
startBtn.addEventListener('click', async () => {
  const activeRadio = document.querySelector('input[name="compression-mode"]:checked');
  const compressionMode = activeRadio ? activeRadio.value : 'balanced';
  const customBitrate = customBitrateInput.value;
  
  if (compressionMode === 'custom' && (!customBitrate || isNaN(customBitrate))) {
    alert('Please enter a valid custom bitrate.');
    return;
  }

  const customSavePath = document.getElementById('custom-save-path').value.trim();

  const payload = {
    targetFormat: targetFormat.value,
    compressionMode: compressionMode,
    resolutionScale: resolutionScale.value,
    audioOption: audioOption.value,
    customBitrate: compressionMode === 'custom' ? parseInt(customBitrate, 10) : null,
    customSavePath: customSavePath || null
  };

  try {
    const res = await fetch(`/api/jobs/${currentJobId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.status === 200 && data.success) {
      startProgressSSE();
      switchView(processingSection);
    } else {
      alert(data.error || 'Failed to start compression job.');
    }
  } catch (error) {
    alert('Network error while starting the compression.');
  }
});

// Change File click
changeFileBtn.addEventListener('click', () => {
  currentJobId = null;
  uploadedFileDetails = null;
  fileInput.value = '';
  switchView(uploadSection);
});

// 3. Progress Tracking and SSE Stream
function startProgressSSE() {
  // Clear logs and reset progress dials
  terminalContent.innerHTML = '<div class="log-line system">[system] Launching FFmpeg compiler backend...</div>';
  radialBar.style.strokeDashoffset = '283';
  progressPercentage.textContent = '0%';
  statSpeed.textContent = '0.00x';
  statFps.textContent = '0 fps';
  statEta.textContent = 'calculating...';
  
  statusTitle.textContent = 'Compressing Video...';
  statusSubtitle.textContent = 'Spawning child processes and allocating system hooks';

  eventSource = new EventSource(`/api/jobs/${currentJobId}/progress`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'processing') {
      const pct = data.progress || 0;
      
      // Update dials & bars
      progressPercentage.textContent = `${pct}%`;
      const offset = 283 - (pct / 100) * 283;
      radialBar.style.strokeDashoffset = offset;

      // Stats
      statSpeed.textContent = data.speed || '1.00x';
      statFps.textContent = `${data.fps || 0} fps`;
      statEta.textContent = data.eta || 'calculating...';

      statusTitle.textContent = `Processing Video File (${pct}%)`;
      statusSubtitle.textContent = 'FFmpeg rendering active. Writing frames to storage.';

      // Terminal Logs
      const logMsg = `[ffmpeg] progress=${pct}% speed=${data.speed || '1.00x'} fps=${data.fps || 0} time_remaining=${data.eta || 'calc...'}`;
      appendTerminalLog(logMsg);
    } 
    
    else if (data.status === 'completed') {
      eventSource.close();
      eventSource = null;
      if (data.copyError) {
        alert(`Compression finished, but direct export failed:\n${data.copyError}\n\nYou can still download the file using the button below.`);
      }
      showSuccessState(data);
    } 
    
    else if (data.status === 'failed') {
      eventSource.close();
      eventSource = null;
      alert(`Encoding Failed: ${data.error || 'Check server logs.'}`);
      switchView(configSection);
    }
  };

  eventSource.onerror = () => {
    // SSE disconnected or errored
    console.log('SSE connection closed or reset.');
  };
}

function appendTerminalLog(message, isError = false) {
  const line = document.createElement('div');
  line.className = `log-line ${isError ? 'error' : ''}`;
  line.textContent = message;
  
  terminalContent.appendChild(line);
  // Auto scroll
  terminalContent.scrollTop = terminalContent.scrollHeight;
}

// 4. Success / Result State Presentation
function showSuccessState(data) {
  sizeBefore.textContent = formatBytes(data.originalSize);
  sizeAfter.textContent = formatBytes(data.compressedSize);
  
  // Calculate percentage savings
  const savedRatio = (data.originalSize - data.compressedSize) / data.originalSize;
  const savedPercent = Math.max(0, Math.round(savedRatio * 100));
  
  savingsBadge.textContent = `-${savedPercent}%`;
  
  // Set filling bar width
  const filledWidth = Math.max(5, 100 - savedPercent);
  savingsBarFill.style.width = `${filledWidth}%`;
  
  // Result name
  const originalExt = uploadedFileDetails.name.split('.').pop();
  const outExt = data.downloadUrl.split('.').pop() || originalExt;
  const origNameBase = uploadedFileDetails.name.substring(0, uploadedFileDetails.name.lastIndexOf('.'));
  
  resultFilename.textContent = `${origNameBase}_compressed.${outExt}`;
  
  downloadBtn.href = data.downloadUrl;
  
  switchView(resultSection);
}

// 5. Cancel Operation
cancelBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to cancel the encoding?')) return;
  
  try {
    const res = await fetch(`/api/jobs/${currentJobId}/cancel`, {
      method: 'POST'
    });
    
    if (res.status === 200) {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      alert('Conversion cancelled.');
      currentJobId = null;
      uploadedFileDetails = null;
      fileInput.value = '';
      switchView(uploadSection);
    } else {
      alert('Could not cancel conversion process.');
    }
  } catch(err) {
    alert('Error connecting to backend.');
  }
});

// 6. Reset & Start Over
resetBtn.addEventListener('click', () => {
  currentJobId = null;
  uploadedFileDetails = null;
  fileInput.value = '';
  switchView(uploadSection);
});

// 7. Clear Server Temporary Cache
clearTempBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete all temporary files from the server? This will clear all uploaded and compressed videos that are not currently being processed.')) {
    return;
  }
  
  clearTempBtn.disabled = true;
  const originalText = clearTempBtn.innerHTML;
  clearTempBtn.innerHTML = '<span>🧹 Clearing...</span>';
  
  try {
    const res = await fetch('/api/clean', { method: 'POST' });
    const data = await res.json();
    
    if (res.status === 200) {
      alert(`Success! Cleared ${data.deletedCount} temporary file(s).`);
    } else {
      alert('Failed to clear temporary files from server.');
    }
  } catch(err) {
    alert('Error connecting to the backend server.');
  } finally {
    clearTempBtn.disabled = false;
    clearTempBtn.innerHTML = originalText;
  }
});

// 8. Shut Down Server API Connection
shutdownServerBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to shut down the AeroCompress server? This will terminate the Node.js process and release port 3000.')) {
    return;
  }
  
  shutdownServerBtn.disabled = true;
  shutdownServerBtn.innerHTML = '<span>🛑 Shutting down...</span>';
  
  try {
    const res = await fetch('/api/shutdown', { method: 'POST' });
    if (res.status === 200) {
      shutdownOverlay.classList.remove('hidden');
    } else {
      alert('Failed to shut down server.');
      shutdownServerBtn.disabled = false;
      shutdownServerBtn.innerHTML = '<span>🛑 Shutdown Server</span>';
    }
  } catch(err) {
    // If the server drops the socket immediately upon shutdown, it's successful!
    shutdownOverlay.classList.remove('hidden');
  }
});


