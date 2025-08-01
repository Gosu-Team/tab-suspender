// Background service worker for Tab Suspender

// Listen for tab removal events to clean up storage
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    // Check if this was a suspended tab and clean up its storage
    await cleanupSuspendedTabStorage(tabId);
  } catch (error) {
    console.error('Error cleaning up removed tab storage:', error);
  }
});

// Listen for tab updates to detect when suspended tabs are navigated away from
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    // If tab URL changed and it's no longer a suspended page, clean up storage
    if (changeInfo.url && !changeInfo.url.includes('/suspended/suspended.html')) {
      // Check if we have storage for this tab ID (from direct unsuspending)
      const directStorageKey = `suspended_${tabId}`;
      const directResult = await chrome.storage.local.get(directStorageKey);
      if (directResult[directStorageKey]) {
        await chrome.storage.local.remove(directStorageKey);
        console.log(`Cleaned up storage for directly unsuspended tab: ${tabId}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up updated tab storage:', error);
  }
});

// Listen for messages from popup and options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'suspendTab') {
    suspendTab(request.tabId)
      .then(() => {
    sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Error suspending tab:', error);
        sendResponse({ success: false, error: error.message });
      });
  } else if (request.action === 'exportBackup') {
    exportSuspendedTabsBackup()
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('Error exporting backup:', error);
        sendResponse({ success: false, error: error.message });
      });
  } else if (request.action === 'importBackup') {
    importSuspendedTabsBackup(request.backupData)
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('Error importing backup:', error);
        sendResponse({ success: false, error: error.message });
      });
  } else if (request.action === 'recreateSuspendedTabs') {
    recreateSuspendedTabs()
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('Error recreating suspended tabs:', error);
        sendResponse({ success: false, error: error.message });
      });
  } else if (request.action === 'suspendAllButActive') {
    suspendAllButActiveTab()
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('Error suspending all tabs:', error);
        sendResponse({ success: false, error: error.message });
      });
  } else if (request.action === 'unsuspendAllTabs') {
    unsuspendAllTabs()
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error('Error unsuspending all tabs:', error);
        sendResponse({ success: false, error: error.message });
      });
  }
  return true; // Keep message channel open for async response
});

// Function to suspend a tab with timeout and retry logic
async function suspendTab(tabId) {
    // Get tab information
    const tab = await chrome.tabs.get(tabId);
    
    // Don't suspend chrome:// or extension pages
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.includes('/suspended/suspended.html')) {
    throw new Error('Cannot suspend system pages or already suspended tabs');
    }
    
    // Get favicon URL
    let faviconUrl = '';
    if (tab.favIconUrl) {
      faviconUrl = tab.favIconUrl;
    } else {
      // Fallback to Google's favicon service
    try {
      const url = new URL(tab.url);
      faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
    } catch (urlError) {
      // If URL parsing fails, use a default icon
      faviconUrl = chrome.runtime.getURL('icons/icon32.png');
    }
    }
    
      // Get tab group information if the tab is in a group
  let groupInfo = null;
  if (tab.groupId !== -1) {
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      groupInfo = {
        id: group.id,
        title: group.title || '',
        color: group.color,
        collapsed: group.collapsed
      };
    } catch (error) {
      console.warn('Error getting tab group info:', error);
    }
    }
    
    // Store tab information
    const tabInfo = {
      originalUrl: tab.url,
      title: tab.title || 'Untitled',
    favicon: faviconUrl,
    suspendedAt: Date.now(),
    groupInfo: groupInfo,
    index: tab.index
    };
    
    // Save to storage with tab ID as key
    await chrome.storage.local.set({ [`suspended_${tabId}`]: tabInfo });
    
  // Navigate to suspended page with timeout and retry
    const suspendedUrl = chrome.runtime.getURL(`suspended/suspended.html?tabId=${tabId}`);
  await updateTabWithTimeout(tabId, suspendedUrl);
}

// Helper function to update tab with timeout and retry logic
async function updateTabWithTimeout(tabId, url, maxRetries = 3, timeoutMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tab update timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      
      // Race between tab update and timeout
      await Promise.race([
        chrome.tabs.update(tabId, { url }),
        timeoutPromise
      ]);
      
      // If we get here, the update succeeded
      return;
      
    } catch (error) {
      console.warn(`Tab update attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to suspend tab after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait briefly before retry
      await new Promise(resolve => setTimeout(resolve, 200 * attempt));
    }
  }
}

// Create context menu and cleanup on startup/install
chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
  cleanupOldSuspendedTabs();
});
chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
  cleanupOldSuspendedTabs();
});

// Create context menu for backup and bulk operations
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'backup-suspended-tabs',
      title: 'Backup Suspended Tabs',
      contexts: ['action']
    });
    
    chrome.contextMenus.create({
      id: 'separator1',
      type: 'separator',
      contexts: ['action']
    });
    
    chrome.contextMenus.create({
      id: 'suspend-all-but-active',
      title: 'Suspend All Tabs (Except Active)',
      contexts: ['action']
    });
    
    chrome.contextMenus.create({
      id: 'unsuspend-all-tabs',
      title: 'Unsuspend All Tabs',
      contexts: ['action']
    });
    
    chrome.contextMenus.create({
      id: 'separator2',
      type: 'separator',
      contexts: ['action']
    });
    
    chrome.contextMenus.create({
      id: 'open-full-page',
      title: 'Open Tab Suspender Dashboard',
      contexts: ['action']
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'backup-suspended-tabs') {
    exportSuspendedTabsBackup()
      .then((result) => {
        console.log('Backup created successfully:', result);
      })
      .catch((error) => {
        console.error('Error creating backup:', error);
      });
  } else if (info.menuItemId === 'suspend-all-but-active') {
    suspendAllButActiveTab()
      .then((result) => {
        console.log('Suspended all tabs except active:', result);
      })
      .catch((error) => {
        console.error('Error suspending all tabs:', error);
      });
  } else if (info.menuItemId === 'unsuspend-all-tabs') {
    unsuspendAllTabs()
      .then((result) => {
        console.log('Unsuspended all tabs:', result);
      })
      .catch((error) => {
        console.error('Error unsuspending all tabs:', error);
      });
  } else if (info.menuItemId === 'open-full-page') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options/options.html')
    });
  }
});

// Export suspended tabs backup
async function exportSuspendedTabsBackup() {
  try {
    const storage = await chrome.storage.local.get();
    
    // Filter suspended tab data
    const suspendedTabs = {};
    let count = 0;
    
    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith('suspended_') && value.originalUrl) {
        suspendedTabs[key] = value;
        count++;
      }
    }
    
    if (count === 0) {
      throw new Error('No suspended tabs found to backup');
    }
    
    // Get all tab groups information to preserve group structure
    let tabGroups = {};
    try {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups) {
        tabGroups[group.id] = {
          id: group.id,
          title: group.title || '',
          color: group.color,
          collapsed: group.collapsed
        };
      }
    } catch (error) {
      console.warn('Error getting tab groups:', error);
    }
    
    // Create backup object
    const backup = {
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version,
      suspendedTabs: suspendedTabs,
      tabGroups: tabGroups,
      count: count
    };
    
    // Create filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `tab-suspender-backup-${timestamp}.json`;
    
    // Convert to data URL for download (service worker compatible)
    const jsonString = JSON.stringify(backup, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    
    return {
      count: count,
      filename: filename,
      timestamp: backup.timestamp
    };
    
  } catch (error) {
    console.error('Error exporting backup:', error);
    throw error;
  }
}

// Import suspended tabs backup
async function importSuspendedTabsBackup(backupData) {
  try {
    // Validate backup data structure
    if (!backupData || typeof backupData !== 'object') {
      throw new Error('Invalid backup data format');
    }
    
    if (!backupData.suspendedTabs || typeof backupData.suspendedTabs !== 'object') {
      throw new Error('No suspended tabs found in backup');
    }
    
    const suspendedTabs = backupData.suspendedTabs;
    let restoredCount = 0;
    
    // Store backup group information if available
    if (backupData.tabGroups && Object.keys(backupData.tabGroups).length > 0) {
      await chrome.storage.local.set({ 
        'backup_groups': backupData.tabGroups,
        'backup_imported_at': Date.now()
      });
      console.log('Stored backup group information:', Object.keys(backupData.tabGroups).length, 'groups');
    }
    
    // Store each suspended tab entry
    for (const [key, tabInfo] of Object.entries(suspendedTabs)) {
      if (key.startsWith('suspended_') && tabInfo.originalUrl) {
        // Add restoration timestamp
        tabInfo.restoredAt = Date.now();
        await chrome.storage.local.set({ [key]: tabInfo });
        restoredCount++;
      }
    }
    
    if (restoredCount === 0) {
      throw new Error('No valid suspended tab data found in backup');
    }
    
    const groupCount = backupData.tabGroups ? Object.keys(backupData.tabGroups).length : 0;
    
    return {
      restoredCount: restoredCount,
      groupsAvailable: groupCount,
      backupVersion: backupData.version || 'unknown',
      backupTimestamp: backupData.timestamp || 'unknown'
    };
    
  } catch (error) {
    console.error('Error importing backup:', error);
    throw error;
  }
}

// Recreate suspended tabs as actual browser tabs with group preservation
async function recreateSuspendedTabs() {
  try {
    const storage = await chrome.storage.local.get();
    const suspendedTabs = {};
    let count = 0;
    
    // Filter suspended tab data
    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith('suspended_') && value.originalUrl) {
        suspendedTabs[key] = value;
        count++;
      }
    }
    
    if (count === 0) {
      throw new Error('No suspended tabs found to recreate');
    }
    
    let createdCount = 0;
    let groupsCreated = 0;
    const errors = [];
    const groupIdMap = {}; // Map original group IDs to new group IDs
    const createdGroups = []; // Keep track of created groups for distribution
    
    // Check for backup group information
    const backupGroups = storage.backup_groups || {};
    console.log('Found backup groups:', Object.keys(backupGroups).length);
    
    // First, identify which groups need to be created (from individual tab info OR backup)
    const groupsToCreate = {};
    
    // Add groups from individual tab info (if available)
    for (const [storageKey, tabInfo] of Object.entries(suspendedTabs)) {
      if (tabInfo.groupInfo && !groupsToCreate[tabInfo.groupInfo.id]) {
        groupsToCreate[tabInfo.groupInfo.id] = tabInfo.groupInfo;
      }
    }
    
    // Add groups from backup data (if available and not already added)
    for (const [groupId, groupInfo] of Object.entries(backupGroups)) {
      if (!groupsToCreate[groupId]) {
        groupsToCreate[groupId] = groupInfo;
      }
    }
    
    console.log('Groups to create:', Object.keys(groupsToCreate).length);
    
    // Sort tabs by their original index to maintain order
    const sortedTabs = Object.entries(suspendedTabs).sort((a, b) => {
      const indexA = a[1].index || 0;
      const indexB = b[1].index || 0;
      return indexA - indexB;
    });
    
    // Array to hold created tabs for group assignment
    const createdTabs = [];
    
    // Create tabs for each suspended entry
    for (const [storageKey, tabInfo] of sortedTabs) {
      try {
        // Generate a unique ID for the suspended page
        const suspendedPageId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const suspendedUrl = chrome.runtime.getURL(`suspended/suspended.html?tabId=${suspendedPageId}`);
        
        // Store data with the suspended page ID
        const suspendedPageKey = `suspended_${suspendedPageId}`;
        await chrome.storage.local.set({ [suspendedPageKey]: tabInfo });
        
        // Small delay to ensure storage write completes
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Create new tab with suspended page
        const tab = await chrome.tabs.create({
          url: suspendedUrl,
          active: false
        });
        
        createdTabs.push({ tab, tabInfo, storageKey });
        
        // If this tab has explicit group info, handle it immediately
        if (tabInfo.groupInfo) {
          const originalGroupId = tabInfo.groupInfo.id;
          
          // Create group if it doesn't exist yet
          if (!groupIdMap[originalGroupId]) {
            try {
              const newGroup = await chrome.tabs.group({
                tabIds: [tab.id]
              });
              
              // Update the group with original properties
              await chrome.tabGroups.update(newGroup, {
                title: tabInfo.groupInfo.title || '',
                color: tabInfo.groupInfo.color || 'grey',
                collapsed: tabInfo.groupInfo.collapsed || false
              });
              
              groupIdMap[originalGroupId] = newGroup;
              createdGroups.push(newGroup);
              groupsCreated++;
              
            } catch (groupError) {
              console.warn(`Error creating group for ${tabInfo.title}:`, groupError);
              errors.push(`Group creation failed for ${tabInfo.title}: ${groupError.message}`);
            }
          } else {
            // Add tab to existing group
            try {
              await chrome.tabs.group({
                tabIds: [tab.id],
                groupId: groupIdMap[originalGroupId]
              });
            } catch (groupError) {
              console.warn(`Error adding tab to group for ${tabInfo.title}:`, groupError);
              errors.push(`Group assignment failed for ${tabInfo.title}: ${groupError.message}`);
            }
          }
        }
        
        createdCount++;
        
        // Small delay between tab creations to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error creating tab for ${storageKey}:`, error);
        errors.push(`${tabInfo.title || 'Unknown'}: ${error.message}`);
      }
    }
    
    // Handle backup groups that weren't created from individual tab info
    const ungroupedTabs = createdTabs.filter(({ tabInfo }) => !tabInfo.groupInfo);
    const remainingGroups = Object.entries(groupsToCreate).filter(([groupId]) => !groupIdMap[groupId]);
    
    if (remainingGroups.length > 0 && ungroupedTabs.length > 0) {
      console.log(`Found ${ungroupedTabs.length} tabs without group associations and ${remainingGroups.length} groups from backup`);
      
      // Check if we have specific group-to-tab mapping in backup
      const hasTabGroupMapping = Object.values(suspendedTabs).some(tabInfo => tabInfo.groupInfo);
      
      if (!hasTabGroupMapping && remainingGroups.length > 1) {
        // Multiple groups but no individual associations - warn user
        console.warn('Multiple groups found in backup but no individual tab-group associations. Creating individual tabs instead of forcing group assignment.');
        
        // Just log the groups that would have been created
        console.log('Groups that were in backup but will not be recreated:', 
          remainingGroups.map(([id, info]) => `"${info.title || 'Untitled'}" (${info.color})`));
        
        errors.push(`Warning: Found ${remainingGroups.length} groups in backup but no tab-group associations. Tabs created as individual tabs. You can manually organize them into groups if needed.`);
        
      } else if (remainingGroups.length === 1) {
        // Only one group - ask user implicitly by creating it but with clear messaging
        const [groupId, groupInfo] = remainingGroups[0];
        
        try {
          console.log(`Creating single group "${groupInfo.title}" with all ${ungroupedTabs.length} tabs`);
          
          // Create group with first tab
          const firstTab = ungroupedTabs[0];
          const newGroup = await chrome.tabs.group({
            tabIds: [firstTab.tab.id]
          });
          
          // Update group properties
          await chrome.tabGroups.update(newGroup, {
            title: groupInfo.title || '',
            color: groupInfo.color || 'grey', 
            collapsed: groupInfo.collapsed || false
          });
          
          // Add remaining tabs to this group
          if (ungroupedTabs.length > 1) {
            const remainingTabIds = ungroupedTabs.slice(1).map(({ tab }) => tab.id);
            await chrome.tabs.group({
              tabIds: remainingTabIds,
              groupId: newGroup
            });
          }
          
          groupIdMap[groupId] = newGroup;
          createdGroups.push(newGroup);
          groupsCreated++;
          
          console.log(`Created group "${groupInfo.title}" with ${ungroupedTabs.length} tabs`);
          
        } catch (groupError) {
          console.warn(`Error creating backup group ${groupInfo.title}:`, groupError);
          errors.push(`Backup group creation failed for "${groupInfo.title}": ${groupError.message}`);
        }
        
      } else {
        // Distribute evenly among multiple groups (original behavior)
        console.log(`Distributing ${ungroupedTabs.length} tabs among ${remainingGroups.length} groups`);
        
        const tabsPerGroup = Math.ceil(ungroupedTabs.length / remainingGroups.length);
        
        for (let i = 0; i < remainingGroups.length; i++) {
          const [groupId, groupInfo] = remainingGroups[i];
          const startIdx = i * tabsPerGroup;
          const endIdx = Math.min(startIdx + tabsPerGroup, ungroupedTabs.length);
          const tabsForThisGroup = ungroupedTabs.slice(startIdx, endIdx);
          
          if (tabsForThisGroup.length > 0) {
            try {
              // Create group with first tab
              const firstTab = tabsForThisGroup[0];
              const newGroup = await chrome.tabs.group({
                tabIds: [firstTab.tab.id]
              });
              
              // Update group properties
              await chrome.tabGroups.update(newGroup, {
                title: groupInfo.title || '',
                color: groupInfo.color || 'grey', 
                collapsed: groupInfo.collapsed || false
              });
              
              // Add remaining tabs to this group
              if (tabsForThisGroup.length > 1) {
                const remainingTabIds = tabsForThisGroup.slice(1).map(({ tab }) => tab.id);
                await chrome.tabs.group({
                  tabIds: remainingTabIds,
                  groupId: newGroup
                });
              }
              
              groupIdMap[groupId] = newGroup;
              createdGroups.push(newGroup);
              groupsCreated++;
              
              console.log(`Created group "${groupInfo.title}" with ${tabsForThisGroup.length} tabs`);
              
            } catch (groupError) {
              console.warn(`Error creating backup group ${groupInfo.title}:`, groupError);
              errors.push(`Backup group creation failed for "${groupInfo.title}": ${groupError.message}`);
            }
          }
        }
      }
    }
    
    // Clean up storage entries
    for (const { storageKey } of createdTabs) {
      await chrome.storage.local.remove(storageKey);
    }
    
    // Clean up backup group data
    if (Object.keys(backupGroups).length > 0) {
      await chrome.storage.local.remove(['backup_groups', 'backup_imported_at']);
    }
    
    console.log(`Recreation completed: ${createdCount}/${count} tabs created, ${groupsCreated} groups created, ${errors.length} errors`);
    
    return {
      createdCount: createdCount,
      totalCount: count,
      groupsCreated: groupsCreated,
      errors: errors
    };
    
  } catch (error) {
    console.error('Error recreating suspended tabs:', error);
    throw error;
  }
}

// Suspend all tabs except the currently active one
async function suspendAllButActiveTab() {
  try {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    
    // Get the active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    let suspendedCount = 0;
    let skippedCount = 0;
    const errors = [];
    
    for (const tab of tabs) {
      // Skip active tab
      if (tab.id === activeTab.id) {
        continue;
      }
      
      // Skip chrome:// or extension pages, or already suspended tabs
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') ||
          tab.url.includes('/suspended/suspended.html')) {
        skippedCount++;
        continue;
      }
      
      try {
        await suspendTab(tab.id);
        suspendedCount++;
        
        // Add small delay to prevent overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error suspending tab ${tab.id}:`, error);
        errors.push(`${tab.title || 'Unknown'}: ${error.message}`);
      }
    }
    
    return {
      suspendedCount: suspendedCount,
      skippedCount: skippedCount,
      totalTabs: tabs.length - 1, // Exclude active tab from total
      errors: errors
    };
    
  } catch (error) {
    console.error('Error suspending all tabs:', error);
    throw error;
  }
}

// Unsuspend all currently suspended tabs
async function unsuspendAllTabs() {
  try {
    // Get all tabs that are showing suspended pages
    const tabs = await chrome.tabs.query({
      url: chrome.runtime.getURL('suspended/suspended.html*')
    });
    
    let unsuspendedCount = 0;
    const errors = [];
    
    for (const tab of tabs) {
      try {
        // Get the tab ID from the suspended page URL
        const url = new URL(tab.url);
        const tabId = url.searchParams.get('tabId');
        
        if (!tabId) {
          errors.push(`${tab.title || 'Unknown'}: No tab ID found`);
          continue;
        }
        
        // Get original URL from storage
        const storageKey = `suspended_${tabId}`;
        const result = await chrome.storage.local.get(storageKey);
        const tabInfo = result[storageKey];
        
        if (!tabInfo || !tabInfo.originalUrl) {
          errors.push(`${tab.title || 'Unknown'}: No original URL found`);
          continue;
        }
        
        // Navigate to original URL
        await chrome.tabs.update(tab.id, { url: tabInfo.originalUrl });
        
        // Clean up storage
        await chrome.storage.local.remove(storageKey);
        
        unsuspendedCount++;
        
        // Add small delay to prevent overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error unsuspending tab ${tab.id}:`, error);
        errors.push(`${tab.title || 'Unknown'}: ${error.message}`);
      }
    }
    
    return {
      unsuspendedCount: unsuspendedCount,
      totalSuspendedTabs: tabs.length,
      errors: errors
    };
    
  } catch (error) {
    console.error('Error unsuspending all tabs:', error);
    throw error;
  }
}

// Clean up storage when a suspended tab is closed
async function cleanupSuspendedTabStorage(closedTabId) {
  try {
    // Method 1: Check for direct storage key (old format: suspended_${tabId})
    const directStorageKey = `suspended_${closedTabId}`;
    const directResult = await chrome.storage.local.get(directStorageKey);
    if (directResult[directStorageKey]) {
      await chrome.storage.local.remove(directStorageKey);
      console.log(`Cleaned up storage for closed suspended tab (direct): ${closedTabId}`);
      return;
    }

    // Method 2: Check if any suspended storage entries are orphaned
    // Get all storage keys to find suspended entries
    const allStorage = await chrome.storage.local.get();
    const suspendedKeys = Object.keys(allStorage).filter(key => 
      key.startsWith('suspended_') && 
      !key.includes('backup_') && 
      allStorage[key].originalUrl
    );

    if (suspendedKeys.length === 0) {
      return;
    }

    // Get all current tabs to see which suspended tabs still exist
    const allTabs = await chrome.tabs.query({});
    const activeSuspendedPageIds = new Set();

    // Extract suspended page IDs from currently open suspended tabs
    for (const tab of allTabs) {
      if (tab.url && tab.url.includes('/suspended/suspended.html')) {
        try {
          const url = new URL(tab.url);
          const suspendedPageId = url.searchParams.get('tabId');
          if (suspendedPageId) {
            activeSuspendedPageIds.add(`suspended_${suspendedPageId}`);
          }
        } catch (urlError) {
          // Ignore malformed URLs
        }
      }
    }

    // Remove storage entries for suspended tabs that no longer exist
    let cleanedCount = 0;
    for (const storageKey of suspendedKeys) {
      if (!activeSuspendedPageIds.has(storageKey)) {
        // This storage entry has no corresponding open tab
        await chrome.storage.local.remove(storageKey);
        cleanedCount++;
        console.log(`Cleaned up orphaned suspended tab storage: ${storageKey}`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} orphaned suspended tab storage entries`);
    }

  } catch (error) {
    console.error('Error cleaning up suspended tab storage:', error);
  }
}

// Periodic cleanup of orphaned and old suspended tab storage
async function cleanupOldSuspendedTabs() {
  try {
    const storage = await chrome.storage.local.get();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let cleanedByAge = 0;
    let cleanedOrphaned = 0;
    
    // Get all current suspended tabs to identify orphaned storage
    const allTabs = await chrome.tabs.query({});
    const activeSuspendedPageIds = new Set();
    
    for (const tab of allTabs) {
      if (tab.url && tab.url.includes('/suspended/suspended.html')) {
        try {
          const url = new URL(tab.url);
          const suspendedPageId = url.searchParams.get('tabId');
          if (suspendedPageId) {
            activeSuspendedPageIds.add(`suspended_${suspendedPageId}`);
          }
        } catch (urlError) {
          // Ignore malformed URLs
        }
      }
    }
    
    // Clean up old and orphaned suspended tab data
    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith('suspended_') && !key.includes('backup_') && value.originalUrl) {
        // Only clean up orphaned entries (no corresponding open tab)
        if (!activeSuspendedPageIds.has(key)) {
          // Check if it's also old (for logging purposes)
          const isOld = value.suspendedAt && (now - value.suspendedAt > sevenDaysMs);
          
          await chrome.storage.local.remove(key);
          
          if (isOld) {
            cleanedByAge++;
            console.log(`Cleaned up old orphaned suspended tab data: ${key}`);
          } else {
            cleanedOrphaned++;
            console.log(`Cleaned up orphaned suspended tab data: ${key}`);
          }
        }
        // Log active old tabs but DON'T remove them
        else if (value.suspendedAt && (now - value.suspendedAt > sevenDaysMs)) {
          console.log(`Found old but active suspended tab (${Math.floor((now - value.suspendedAt) / (24 * 60 * 60 * 1000))} days old): ${key} - keeping because tab is still open`);
        }
      }
    }
    
    if (cleanedByAge > 0 || cleanedOrphaned > 0) {
      console.log(`Cleanup completed: ${cleanedByAge} old entries, ${cleanedOrphaned} orphaned entries removed`);
    }
    
  } catch (error) {
    console.error('Error cleaning up old suspended tabs:', error);
  }
}

// Run cleanup when extension starts and then periodically
chrome.runtime.onStartup.addListener(() => {
  cleanupOldSuspendedTabs();
});

chrome.runtime.onInstalled.addListener(() => {
  cleanupOldSuspendedTabs();
  
  // Set up periodic cleanup every 6 hours
  chrome.alarms.create('cleanupSuspendedTabs', {
    delayInMinutes: 360, // 6 hours
    periodInMinutes: 360 // 6 hours
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupSuspendedTabs') {
    cleanupOldSuspendedTabs();
  }
});

 