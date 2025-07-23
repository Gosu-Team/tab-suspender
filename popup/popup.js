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
    try {
      // Disable button to prevent double clicks
      suspendBtn.disabled = true;
      suspendBtn.textContent = 'Suspending...';
      
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        action: 'suspendTab',
        tabId: tab.id
      });
      
      if (response && response.success) {
        // Show success message briefly
        suspendBtn.textContent = 'Tab suspended!';
        suspendBtn.style.background = '#0d652d';
        
        // Close popup after a short delay
        setTimeout(() => {
          window.close();
        }, 500);
      } else {
        throw new Error('Failed to suspend tab');
      }
      
    } catch (error) {
      // Show error message
      suspendBtn.textContent = 'Error occurred';
      suspendBtn.style.background = '#d93025';
      
      const errorMsg = document.createElement('p');
      errorMsg.className = 'error';
      errorMsg.textContent = 'Could not suspend this tab';
      container.appendChild(errorMsg);
      
      console.error('Error suspending tab:', error);
    }
  });
}); 