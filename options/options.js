document.addEventListener('DOMContentLoaded', async () => {
  // DOM elements
  const suspendedCount = document.getElementById('suspendedCount');
  const exportBtn = document.getElementById('exportBtn');
  const exportStatus = document.getElementById('exportStatus');
  const importFile = document.getElementById('importFile');
  const importBtn = document.getElementById('importBtn');
  const importStatus = document.getElementById('importStatus');
  const fileInfo = document.getElementById('fileInfo');
  const recreateBtn = document.getElementById('recreateBtn');
  const recreateStatus = document.getElementById('recreateStatus');
  const recreateCount = document.getElementById('recreateCount');
  const suspendAllBtn = document.getElementById('suspendAllBtn');
  const suspendAllStatus = document.getElementById('suspendAllStatus');
  const unsuspendAllBtn = document.getElementById('unsuspendAllBtn');
  const unsuspendAllStatus = document.getElementById('unsuspendAllStatus');
  const extensionVersion = document.getElementById('extensionVersion');
  const sidebarVersion = document.getElementById('sidebarVersion');
  const headerSuspendedCount = document.getElementById('headerSuspendedCount');
  const totalTabsCount = document.getElementById('totalTabsCount');
  const pageTitle = document.getElementById('pageTitle');
  const pageDescription = document.getElementById('pageDescription');

  // Initialize page
  await updateSuspendedCount();
  await updateTotalTabsCount();
  updateExtensionVersion();
  initializeNavigation();

  // Export functionality
  exportBtn.addEventListener('click', handleExport);

  // Import functionality
  importFile.addEventListener('change', handleFileSelect);
  importBtn.addEventListener('click', handleImport);

  // Recreate functionality
  recreateBtn.addEventListener('click', handleRecreate);

  // Bulk operations functionality
  suspendAllBtn.addEventListener('click', handleSuspendAll);
  unsuspendAllBtn.addEventListener('click', handleUnsuspendAll);

  // Update suspended tabs count
  async function updateSuspendedCount() {
    try {
      const storage = await chrome.storage.local.get();
      let count = 0;
      
      for (const key of Object.keys(storage)) {
        if (key.startsWith('suspended_')) {
          count++;
        }
      }
      
      suspendedCount.textContent = count;
      recreateCount.textContent = count;
      headerSuspendedCount.textContent = count;
      
      // Update export button state
      if (count === 0) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7,10 12,15 17,10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          No tabs to export
        `;
      } else {
        exportBtn.disabled = false;
        exportBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7,10 12,15 17,10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export Backup
        `;
      }

      // Update recreate button state
      if (count === 0) {
        recreateBtn.disabled = true;
        recreateBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10"></polyline>
            <polyline points="1,20 1,14 7,14"></polyline>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
          </svg>
          No tabs to recreate
        `;
      } else {
        recreateBtn.disabled = false;
        recreateBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10"></polyline>
            <polyline points="1,20 1,14 7,14"></polyline>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
          </svg>
          Recreate Suspended Tabs
        `;
      }
    } catch (error) {
      console.error('Error updating suspended count:', error);
      suspendedCount.textContent = 'Error';
      recreateCount.textContent = 'Error';
      headerSuspendedCount.textContent = 'Error';
    }
  }

  // Handle export
  async function handleExport() {
    try {
      // Show loading state
      exportStatus.className = 'status loading';
      exportStatus.textContent = 'Creating backup...';
      exportStatus.classList.remove('hidden');
      
      exportBtn.disabled = true;
      exportBtn.innerHTML = `
        <span class="spinner"></span>
        Exporting...
      `;

      // Send export message to background
      const response = await sendMessageWithTimeout({
        action: 'exportBackup'
      }, 15000);

      if (response && response.success) {
        // Show success
        exportStatus.className = 'status success';
        exportStatus.innerHTML = `
          <strong>Backup created successfully!</strong><br>
          ${response.data.count} tabs backed up to: ${response.data.filename}<br>
          <small>Created: ${new Date(response.data.timestamp).toLocaleString()}</small>
        `;
      } else {
        throw new Error(response?.error || 'Failed to create backup');
      }

    } catch (error) {
      console.error('Export error:', error);
      exportStatus.className = 'status error';
      
      if (error.message.includes('No suspended tabs')) {
        exportStatus.textContent = 'No suspended tabs found to backup. Please suspend some tabs first.';
      } else if (error.message.includes('timeout')) {
        exportStatus.textContent = 'Export timed out. Please try again.';
      } else {
        exportStatus.textContent = `Export failed: ${error.message}`;
      }
    } finally {
      // Reset button
      exportBtn.disabled = false;
      exportBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7,10 12,15 17,10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Export Backup
      `;
    }
  }

  // Handle file selection
  async function handleFileSelect(event) {
    const file = event.target.files[0];
    
    if (!file) {
      fileInfo.classList.add('hidden');
      importBtn.disabled = true;
      return;
    }

    try {
      // Validate file type
      if (!file.name.endsWith('.json')) {
        throw new Error('Please select a JSON backup file');
      }

      // Read file content
      const content = await readFileAsText(file);
      const backupData = JSON.parse(content);

      // Validate backup structure
      if (!backupData.suspendedTabs || typeof backupData.suspendedTabs !== 'object') {
        throw new Error('Invalid backup file format');
      }

      const tabCount = Object.keys(backupData.suspendedTabs).length;
      const groupCount = backupData.tabGroups ? Object.keys(backupData.tabGroups).length : 0;
      
      // Count tabs in groups
      let tabsInGroups = 0;
      for (const tabInfo of Object.values(backupData.suspendedTabs)) {
        if (tabInfo.groupInfo) {
          tabsInGroups++;
        }
      }

      // Show file info
      fileInfo.classList.remove('hidden');
      let groupInfo = '';
      if (groupCount > 0) {
        groupInfo = `<p><strong>Groups:</strong> ${groupCount} tab groups (${tabsInGroups} tabs in groups)</p>`;
      }
      
      fileInfo.innerHTML = `
        <h4>✅ Valid backup file selected</h4>
        <p><strong>File:</strong> ${file.name}</p>
        <p><strong>Tabs:</strong> ${tabCount} suspended tabs</p>
        ${groupInfo}
        <p><strong>Created:</strong> ${backupData.timestamp ? new Date(backupData.timestamp).toLocaleString() : 'Unknown'}</p>
        <p><strong>Version:</strong> ${backupData.version || 'Unknown'}</p>
      `;

      // Enable import button
      importBtn.disabled = false;
      
      // Store backup data for import
      window.selectedBackupData = backupData;

    } catch (error) {
      console.error('File validation error:', error);
      
      fileInfo.classList.remove('hidden');
      fileInfo.innerHTML = `
        <h4 style="color: #dc3545;">❌ Invalid backup file</h4>
        <p style="color: #dc3545;">${error.message}</p>
      `;
      fileInfo.style.borderLeftColor = '#dc3545';
      fileInfo.style.background = '#f8d7da';
      
      importBtn.disabled = true;
      window.selectedBackupData = null;
    }
  }

  // Handle import
  async function handleImport() {
    if (!window.selectedBackupData) {
      return;
    }

    try {
      // Show loading state
      importStatus.className = 'status loading';
      importStatus.textContent = 'Importing backup...';
      importStatus.classList.remove('hidden');
      
      importBtn.disabled = true;
      importBtn.innerHTML = `
        <span class="spinner"></span>
        Importing...
      `;

      // Send import message to background
      const response = await sendMessageWithTimeout({
        action: 'importBackup',
        backupData: window.selectedBackupData
      }, 15000);

      if (response && response.success) {
        // Show success
        importStatus.className = 'status success';
        let message = `<strong>Backup imported successfully!</strong><br>`;
        message += `${response.data.restoredCount} suspended tabs restored<br>`;
        
        if (response.data.groupsAvailable > 0) {
          message += `${response.data.groupsAvailable} tab groups detected - will be recreated during tab restoration<br>`;
        }
        
        message += `<small>From backup: ${response.data.backupTimestamp ? new Date(response.data.backupTimestamp).toLocaleString() : 'Unknown date'}</small>`;
        
        importStatus.innerHTML = message;

        // Update count after successful import
        setTimeout(updateSuspendedCount, 1000);
        
        // Clear file selection
        importFile.value = '';
        fileInfo.classList.add('hidden');
        window.selectedBackupData = null;
        
      } else {
        throw new Error(response?.error || 'Failed to import backup');
      }

    } catch (error) {
      console.error('Import error:', error);
      importStatus.className = 'status error';
      
      if (error.message.includes('timeout')) {
        importStatus.textContent = 'Import timed out. Please try again.';
      } else {
        importStatus.textContent = `Import failed: ${error.message}`;
      }
    } finally {
      // Reset button
      importBtn.disabled = window.selectedBackupData ? false : true;
      importBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17,8 12,3 7,8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        Import Backup
      `;
    }
  }

  // Handle recreate suspended tabs
  async function handleRecreate() {
    try {
      // Show loading state
      recreateStatus.className = 'status loading';
      recreateStatus.textContent = 'Creating suspended tabs...';
      recreateStatus.classList.remove('hidden');
      
      recreateBtn.disabled = true;
      recreateBtn.innerHTML = `
        <span class="spinner"></span>
        Creating tabs...
      `;

      // Send recreate message to background
      const response = await sendMessageWithTimeout({
        action: 'recreateSuspendedTabs'
      }, 30000); // 30 second timeout for creating tabs

      if (response && response.success) {
        const { createdCount, totalCount, groupsCreated, errors } = response.data;
        
        // Show success
        recreateStatus.className = 'status success';
        let message = `<strong>Successfully created ${createdCount} of ${totalCount} suspended tabs!</strong><br>`;
        
        if (groupsCreated > 0) {
          message += `<strong>Created ${groupsCreated} tab groups</strong> with preserved colors and titles<br>`;
        } else {
          message += `<em>Note: Group information was not available in this backup - tabs created individually</em><br>`;
        }
        
        if (errors.length > 0) {
          const warnings = errors.filter(error => error.includes('Warning:'));
          const actualErrors = errors.filter(error => !error.includes('Warning:'));
          
          if (warnings.length > 0) {
            message += `<br><strong style="color: #e37400;">ℹ️ Group Recreation Info:</strong><br>`;
            warnings.slice(0, 2).forEach(warning => {
              const cleanWarning = warning.replace('Warning: ', '');
              message += `• ${cleanWarning}<br>`;
            });
          }
          
          if (actualErrors.length > 0) {
            message += `<br><strong style="color: #d93025;">❌ Errors:</strong><br>`;
            actualErrors.slice(0, 3).forEach(error => {
              message += `• ${error}<br>`;
            });
            if (actualErrors.length > 3) {
              message += `• ... and ${actualErrors.length - 3} more errors`;
            }
          }
        }
        
        recreateStatus.innerHTML = message;

        // Update count after successful recreation
        setTimeout(updateSuspendedCount, 2000);
        
      } else {
        throw new Error(response?.error || 'Failed to recreate suspended tabs');
      }

    } catch (error) {
      console.error('Recreate error:', error);
      recreateStatus.className = 'status error';
      
      if (error.message.includes('No suspended tabs')) {
        recreateStatus.textContent = 'No suspended tabs found to recreate. Please import a backup first.';
      } else if (error.message.includes('timeout')) {
        recreateStatus.textContent = 'Recreation timed out. Some tabs may have been created successfully.';
      } else {
        recreateStatus.textContent = `Recreation failed: ${error.message}`;
      }
    } finally {
      // Reset button
      recreateBtn.disabled = false;
      recreateBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23,4 23,10 17,10"></polyline>
          <polyline points="1,20 1,14 7,14"></polyline>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
        </svg>
        Recreate Suspended Tabs
      `;
    }
  }

  // Handle suspend all but active tab
  async function handleSuspendAll() {
    try {
      // Show loading state
      suspendAllStatus.className = 'status loading';
      suspendAllStatus.textContent = 'Suspending all tabs except active...';
      suspendAllStatus.classList.remove('hidden');
      
      suspendAllBtn.disabled = true;
      suspendAllBtn.innerHTML = `
        <span class="spinner"></span>
        Suspending...
      `;

      // Send suspend all message to background
      const response = await sendMessageWithTimeout({
        action: 'suspendAllButActive'
      }, 30000); // 30 second timeout

      if (response && response.success) {
        const { suspendedCount, skippedCount, totalTabs, errors } = response.data;
        
        // Show success
        suspendAllStatus.className = 'status success';
        let message = `<strong>Successfully suspended ${suspendedCount} of ${totalTabs} tabs!</strong><br>`;
        
        if (skippedCount > 0) {
          message += `Skipped ${skippedCount} tabs (system pages or already suspended)<br>`;
        }
        
        if (errors.length > 0) {
          message += `<br><strong>Errors:</strong><br>`;
          errors.slice(0, 3).forEach(error => {
            message += `• ${error}<br>`;
          });
          if (errors.length > 3) {
            message += `• ... and ${errors.length - 3} more errors`;
          }
        }
        
        suspendAllStatus.innerHTML = message;

        // Update count after successful suspension
        setTimeout(updateSuspendedCount, 2000);
        
      } else {
        throw new Error(response?.error || 'Failed to suspend tabs');
      }

    } catch (error) {
      console.error('Suspend all error:', error);
      suspendAllStatus.className = 'status error';
      
      if (error.message.includes('timeout')) {
        suspendAllStatus.textContent = 'Operation timed out. Some tabs may have been suspended successfully.';
      } else {
        suspendAllStatus.textContent = `Suspension failed: ${error.message}`;
      }
    } finally {
      // Reset button
      suspendAllBtn.disabled = false;
      suspendAllBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        Suspend All But Active
      `;
    }
  }

  // Handle unsuspend all tabs
  async function handleUnsuspendAll() {
    try {
      // Show loading state
      unsuspendAllStatus.className = 'status loading';
      unsuspendAllStatus.textContent = 'Unsuspending all suspended tabs...';
      unsuspendAllStatus.classList.remove('hidden');
      
      unsuspendAllBtn.disabled = true;
      unsuspendAllBtn.innerHTML = `
        <span class="spinner"></span>
        Unsuspending...
      `;

      // Send unsuspend all message to background
      const response = await sendMessageWithTimeout({
        action: 'unsuspendAllTabs'
      }, 30000); // 30 second timeout

      if (response && response.success) {
        const { unsuspendedCount, totalSuspendedTabs, errors } = response.data;
        
        // Show success
        unsuspendAllStatus.className = 'status success';
        let message = `<strong>Successfully unsuspended ${unsuspendedCount} of ${totalSuspendedTabs} tabs!</strong><br>`;
        
        if (errors.length > 0) {
          message += `<br><strong>Errors:</strong><br>`;
          errors.slice(0, 3).forEach(error => {
            message += `• ${error}<br>`;
          });
          if (errors.length > 3) {
            message += `• ... and ${errors.length - 3} more errors`;
          }
        }
        
        unsuspendAllStatus.innerHTML = message;

        // Update count after successful unsuspension
        setTimeout(updateSuspendedCount, 2000);
        
      } else {
        throw new Error(response?.error || 'Failed to unsuspend tabs');
      }

    } catch (error) {
      console.error('Unsuspend all error:', error);
      unsuspendAllStatus.className = 'status error';
      
      if (error.message.includes('timeout')) {
        unsuspendAllStatus.textContent = 'Operation timed out. Some tabs may have been unsuspended successfully.';
      } else {
        unsuspendAllStatus.textContent = `Unsuspension failed: ${error.message}`;
      }
    } finally {
      // Reset button
      unsuspendAllBtn.disabled = false;
      unsuspendAllBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"></polygon>
        </svg>
        Unsuspend All Tabs
      `;
    }
  }

  // Update total tabs count
  async function updateTotalTabsCount() {
    try {
      const tabs = await chrome.tabs.query({});
      totalTabsCount.textContent = tabs.length;
    } catch (error) {
      console.error('Error updating total tabs count:', error);
      totalTabsCount.textContent = 'Error';
    }
  }

  // Initialize navigation
  function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        
        const sectionId = item.getAttribute('data-section');
        
        // Update active nav item
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Update active content section
        contentSections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(`${sectionId}-section`);
        if (targetSection) {
          targetSection.classList.add('active');
        }
        
        // Update page header
        updatePageHeader(sectionId);
      });
    });
  }

  // Update page header based on active section
  function updatePageHeader(sectionId) {
    const headerInfo = {
      backup: {
        title: 'Backup & Restore',
        description: 'Backup your suspended tabs to protect against extension reloads'
      },
      bulk: {
        title: 'Bulk Operations',
        description: 'Perform operations on multiple tabs at once for efficient tab management'
      },
      settings: {
        title: 'Settings & Information',
        description: 'Extension settings and helpful information about Tab Suspender'
      }
    };

    const info = headerInfo[sectionId] || headerInfo.backup;
    pageTitle.textContent = info.title;
    pageDescription.textContent = info.description;
  }

  // Update extension version
  function updateExtensionVersion() {
    const manifest = chrome.runtime.getManifest();
    extensionVersion.textContent = manifest.version;
    sidebarVersion.textContent = manifest.version;
  }

  // Utility functions
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async function sendMessageWithTimeout(message, timeoutMs = 10000) {
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

  // Auto-refresh counts periodically
  setInterval(() => {
    updateSuspendedCount();
    updateTotalTabsCount();
  }, 30000); // Every 30 seconds
});