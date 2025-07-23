// Background service worker for Tab Suspender

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'suspendTab') {
    suspendTab(request.tabId);
    sendResponse({ success: true });
  }
  return true;
});

// Function to suspend a tab
async function suspendTab(tabId) {
  try {
    // Get tab information
    const tab = await chrome.tabs.get(tabId);
    
    // Don't suspend chrome:// or extension pages
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.includes('/suspended/suspended.html')) {
      return;
    }
    
    // Get favicon URL
    let faviconUrl = '';
    if (tab.favIconUrl) {
      faviconUrl = tab.favIconUrl;
    } else {
      // Fallback to Google's favicon service
      const url = new URL(tab.url);
      faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
    }
    
    // Store tab information
    const tabInfo = {
      originalUrl: tab.url,
      title: tab.title || 'Untitled',
      favicon: faviconUrl
    };
    
    // Save to storage with tab ID as key
    await chrome.storage.local.set({ [`suspended_${tabId}`]: tabInfo });
    
    // Navigate to suspended page
    const suspendedUrl = chrome.runtime.getURL(`suspended/suspended.html?tabId=${tabId}`);
    await chrome.tabs.update(tabId, { url: suspendedUrl });
    
  } catch (error) {
    console.error('Error suspending tab:', error);
  }
}

 