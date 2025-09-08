// preload.js - Updated for v0.1.2 "Groups" Feature

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // --- Profile API ---
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    addProfile: (name) => ipcRenderer.invoke('add-profile', name),
    toggleProfileEnabled: (data) => ipcRenderer.invoke('toggle-profile-enabled', data),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    renameProfile: (data) => ipcRenderer.invoke('rename-profile', data),
    getProfileById: (id) => ipcRenderer.invoke('get-profile-by-id', id),
    setProfileAvatar: (id) => ipcRenderer.invoke('set-profile-avatar', id),

    // ============ NEW GROUP API (v0.1.2) ============
    getGroups: () => ipcRenderer.invoke('get-groups'),
    createGroup: (groupData) => ipcRenderer.invoke('create-group', groupData),
    updateGroup: (groupData) => ipcRenderer.invoke('update-group', groupData),
    deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),
    addProfileToGroup: (data) => ipcRenderer.invoke('add-profile-to-group', data),
    removeProfileFromGroup: (data) => ipcRenderer.invoke('remove-profile-from-group', data),
    setProfilePrimaryGroup: (data) => ipcRenderer.invoke('set-profile-primary-group', data),
    getProfilesByGroupId: (id) => ipcRenderer.invoke('get-profiles-by-group-id', id),
    getProfileGroupMemberships: (id) => ipcRenderer.invoke('get-profile-group-memberships', id),
    getGroupMembers: (id) => ipcRenderer.invoke('get-group-members', id),
    toggleGroupEnabled: (data) => ipcRenderer.invoke('toggle-group-enabled', data),
    // ===============================================

    // --- Script & Job API (Unchanged) ---
    getScripts: () => ipcRenderer.invoke('get-scripts'),
    getScriptById: (id) => ipcRenderer.invoke('get-script-by-id', id),
    createScript: (name) => ipcRenderer.invoke('create-script', name),
    saveScript: (script) => ipcRenderer.invoke('save-script', script),
    deleteScript: (id) => ipcRenderer.invoke('delete-script', id),
    runJob: (data) => ipcRenderer.invoke('run-job', data),
    onJobUpdate: (callback) => {
        ipcRenderer.removeAllListeners('job-update');
        ipcRenderer.on('job-update', (_event, value) => callback(value));
    },
    getDashboards: () => ipcRenderer.invoke('get-dashboards'),
    getPinnedDashboards: () => ipcRenderer.invoke('get-pinned-dashboards'),
    pinDashboard: (data) => ipcRenderer.invoke('pin-dashboard', data),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),




});