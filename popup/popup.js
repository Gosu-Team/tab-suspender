document.addEventListener('DOMContentLoaded', async () => {
  const suspendBtn = document.getElementById('suspendBtn');
  const container = document.querySelector('.popup-container');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check if tab can be suspended
  if (tab.url.startsWith('chrome://') || 
      tab.url.startsWith('chrome-extension://') ||
      tab.url.includes('/suspended/suspended.html')) {
    suspendBtn.disabled = true;
    suspendBtn.textContent = 'Cannot suspend this tab';
    
    // Add explanation
    const info = document.querySelector('.info');
    if (tab.url.includes('/suspended/suspended.html')) {
      info.textContent = 'This tab is already suspended';
    } else {
      info.textContent = 'System pages cannot be suspended';
    }
    return;
  }
  
  // Handle suspend button click
  suspendBtn.addEventListener('click', async () => {
    // Clear any previous error messages
    const existingError = container.querySelector('.error');
    if (existingError) {
      existingError.remove();
    }
    
    try {
      // Disable button to prevent double clicks
      suspendBtn.disabled = true;
      suspendBtn.textContent = 'Suspending...';
      suspendBtn.style.background = '#4285f4'; // Reset to default color
      
      // Send message to background script with timeout
      const response = await sendMessageWithTimeout({
        action: 'suspendTab',
        tabId: tab.id
      }, 10000); // 10 second timeout
      
      if (response && response.success) {
        // Show success message briefly
        suspendBtn.textContent = 'Tab suspended!';
        suspendBtn.style.background = '#0d652d';
        
        // Close popup after a short delay
        setTimeout(() => {
          window.close();
        }, 500);
      } else {
        // Handle specific error from background script
        const errorMessage = response && response.error ? response.error : 'Failed to suspend tab';
        throw new Error(errorMessage);
      }
      
    } catch (error) {
      // Re-enable button so user can try again
      suspendBtn.disabled = false;
      suspendBtn.textContent = 'Suspend Current Tab';
      suspendBtn.style.background = '#d93025';
      
      // Show specific error message
      const errorMsg = document.createElement('p');
      errorMsg.className = 'error';
      
      if (error.message.includes('timeout')) {
        errorMsg.textContent = 'Request timed out. Please try again.';
      } else if (error.message.includes('system pages')) {
        errorMsg.textContent = 'This page cannot be suspended.';
      } else if (error.message.includes('already suspended')) {
        errorMsg.textContent = 'Tab is already suspended.';
      } else {
        errorMsg.textContent = error.message || 'Could not suspend this tab. Please try again.';
      }
      
      container.appendChild(errorMsg);
      
      console.error('Error suspending tab:', error);
      
      // Reset button color after a delay
      setTimeout(() => {
        if (!suspendBtn.disabled) {
          suspendBtn.style.background = '#4285f4';
        }
      }, 3000);
    }
  });
});

// Helper function to send message with timeout
async function sendMessageWithTimeout(message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
} 