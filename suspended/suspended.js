// Minimal JavaScript for suspended page
(async function() {
  // Get tab ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const tabId = urlParams.get('tabId');
  
  if (!tabId) {
    showError('Invalid suspended page');
    return;
  }
  
  try {
    // Retrieve tab information from storage
    const storageKey = `suspended_${tabId}`;
    const result = await chrome.storage.local.get(storageKey);
    const tabInfo = result[storageKey];
    
    if (!tabInfo) {
      // Try waiting a bit and retrying once (in case of timing issues)
      console.warn('Tab information not found on first try, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const retryResult = await chrome.storage.local.get(storageKey);
      const retryTabInfo = retryResult[storageKey];
      
      if (!retryTabInfo) {
        // Debug: Show what keys exist in storage
        console.error('Tab information not found for key:', storageKey);
        console.error('Available storage keys:', Object.keys(await chrome.storage.local.get()));
        showError(`Tab information not found (ID: ${tabId}). This may be a corrupted suspended tab.`);
        return;
      }
      
      // If retry succeeded, use the retry data
      tabInfo = retryTabInfo;
    }
    
    // Update page with saved information
    document.title = tabInfo.title + ' - Suspended';
    
    // Set favicon in head with 50% opacity
    if (tabInfo.favicon) {
      // Create a semi-transparent favicon using canvas
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        // Set global alpha for 50% opacity
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, 0, 0, 32, 32);
        
        // Convert to data URL and set as favicon
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = dataUrl;
        document.head.appendChild(link);
      };
      
      img.onerror = function() {
        // Fallback to original favicon if canvas fails
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = tabInfo.favicon;
        document.head.appendChild(link);
      };
      
      img.src = tabInfo.favicon;
    }
    
    // Set favicon image in body
    const faviconEl = document.getElementById('favicon');
    if (tabInfo.favicon) {
      faviconEl.src = tabInfo.favicon;
      faviconEl.classList.add('show');
      faviconEl.onerror = () => {
        faviconEl.classList.remove('show');
      };
    }
    
    // Set title
    document.getElementById('title').textContent = tabInfo.title;
    
    // Handle unsuspend functionality
    const unsuspendAction = async () => {
      try {
        // Navigate to original URL
        window.location.href = tabInfo.originalUrl;
        
        // Clean up storage (will happen even if navigation fails)
        setTimeout(() => {
          chrome.storage.local.remove(storageKey);
        }, 100);
        
      } catch (error) {
        showError('Failed to restore tab');
        console.error('Error unsuspending:', error);
      }
    };

    // Handle unsuspend button click
    const unsuspendBtn = document.getElementById('unsuspendBtn');
    unsuspendBtn.addEventListener('click', unsuspendAction);
    
    // Make entire page clickable for better UX
    document.body.addEventListener('click', unsuspendAction);
    
    // Keyboard shortcut - Enter key to unsuspend
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        unsuspendAction();
      }
    });
    
  } catch (error) {
    showError('Error loading tab information');
    console.error('Error:', error);
  }
})();

function showError(message) {
  const container = document.querySelector('.content');
  const errorEl = document.createElement('div');
  errorEl.className = 'error';
  errorEl.innerHTML = `
    <p>${message}</p>
    <button onclick="window.location.reload()" class="retry-btn">
      Retry Loading
    </button>
  `;
  container.appendChild(errorEl);
  
  // Hide unsuspend button on error
  document.getElementById('unsuspendBtn').style.display = 'none';
} 