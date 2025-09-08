document.addEventListener('DOMContentLoaded', () => {

    // --- STATE, CACHE, and global variable for userDataPath ---
    let codeEditor;
    let state = {
        scriptInEditorId: null,
        contextMenuTargetId: null,
        profileInSettingsId: null,
        activeGroupId: 'all',
        groupInEditorId: null,
    };
    let jobStartTime;
    let elapsedTimeInterval;
    let userDataPath = ''; // Will be populated on init

    // --- DOM CACHE ---
    const navLinks = document.querySelectorAll('.nav-link');
    const allViews = document.querySelectorAll('.view');
    const addNewProfileBtn = document.querySelector('#add-new-profile-btn');
    const profilesListUl = document.querySelector('#profiles-list-ul');
    const profilesListEmpty = document.querySelector('#profiles-list-empty');
    const addNewScriptBtn = document.querySelector('#add-new-script-btn');
    const scriptsListUl = document.querySelector('#scripts-list-ul');
    const scriptsListEmpty = document.querySelector('#scripts-list-empty');
    const backToListBtn = document.querySelector('#back-to-list-btn');
    const scriptNameInputEditor = document.querySelector('#script-name-input-editor');
    const saveScriptBtn = document.querySelector('#save-script-btn');
    const codeEditorTextarea = document.querySelector('#code-editor');
    const scriptContextMenu = document.querySelector('#script-context-menu');
    const profileContextMenu = document.querySelector('#profile-context-menu');
    const showJobModalBtn = document.querySelector('#show-job-modal-btn');
    const jobModalOverlay = document.querySelector('#job-modal-overlay');
    const jobModalCancelBtn = document.querySelector('#job-modal-cancel-btn');
    const launchJobBtn = document.querySelector('#launch-job-btn');
    const scriptSelect = document.querySelector('#script-select');
    const jobIdleState = document.querySelector('#job-idle-state');
    const jobMonitorWrapper = document.querySelector('#job-monitor-wrapper');
    const jobOverviewScriptName = document.querySelector('#job-overview-script-name');
    const jobOverviewStatus = document.querySelector('#job-overview-status');
    const jobOverviewProgress = document.querySelector('#job-overview-progress');
    const jobOverviewElapsedTime = document.querySelector('#job-overview-elapsed-time');
    const stopJobBtn = document.querySelector('#stop-job-btn');
    const jobLogConsole = document.querySelector('#job-log-console');
    const menuLaunchProfile = document.querySelector('#menu-launch-profile');
    const backToProfilesBtn = document.querySelector('#back-to-profiles-btn');
    const profileSettingsTitle = document.querySelector('#profile-settings-title');
    const pfpPreview = document.querySelector('#pfp-preview');
    const changePfpBtn = document.querySelector('#change-pfp-btn');
    const profileNameInputSettings = document.querySelector('#profile-name-input-settings');
    const saveProfileSettingsBtn = document.querySelector('#save-profile-settings-btn');
    const groupTabsContainer = document.querySelector('#group-tabs');
    const addNewGroupBtn = document.querySelector('#add-new-group-btn');
    const groupContextMenu = document.querySelector('#group-context-menu');
    const menuEditGroup = document.querySelector('#menu-edit-group');
    const menuDeleteGroup = document.querySelector('#menu-delete-group');
    const menuEnableGroup = document.querySelector('#menu-enable-group');
    const menuDisableGroup = document.querySelector('#menu-disable-group');
    const menuGroupSettings = document.querySelector('#menu-group-settings');
    const backToProfilesFromGroupSettingsBtn = document.querySelector('#back-to-profiles-from-group-settings-btn');
    const groupSettingsTitle = document.querySelector('#group-settings-title');
    const groupMembersList = document.querySelector('#group-members-list');
    const saveGroupSettingsBtn = document.querySelector('#save-group-settings-btn');
    const groupModalOverlay = document.querySelector('#new-group-modal-overlay');
    const groupModalTitle = document.querySelector('#group-modal-title');
    const groupNameInput = document.querySelector('#new-group-name-input');
    const groupColorPicker = document.querySelector('#group-color-picker');
    const groupModalCancelBtn = document.querySelector('#new-group-modal-cancel-btn');
    const groupModalSaveBtn = document.querySelector('#new-group-modal-save-btn');
    const profileGroupsList = document.querySelector('#profile-groups-list');
    const dashboardGrid = document.querySelector('#dashboard-grid');
    const dashboardEmptyState = document.querySelector('#dashboard-empty-state');
    const dashboardViewerTitle = document.querySelector('#dashboard-viewer-title');
    const dashboardWebview = document.querySelector('#dashboard-webview');
    const backToAppsBtn = document.querySelector('#back-to-apps-btn');

    async function initialize() {
        try {
            userDataPath = await window.api.getUserDataPath();
        } catch (err) {
            console.error("Fatal Error: Could not get userDataPath from main process.");
            alert("A critical error occurred while initializing the application.");
        }
        console.log('DOM Ready. Initializing UI...');
        initializeEditor();
        setupEventListeners();
        displayAllData();
        showView('mission-control-view');
        console.log('UI Initialized.');
    }

    function initializeEditor() {
        if (codeEditorTextarea) {
            codeEditor = CodeMirror.fromTextArea(codeEditorTextarea, {
                lineNumbers: true,
                mode: 'javascript',
                theme: 'dracula',
                lineWrapping: true
            });
        }
    }

    function setupEventListeners() {
        navLinks.forEach(link => link.addEventListener('click', () => showView(link.dataset.view)));
        addNewProfileBtn.addEventListener('click', handleAddProfile);
        addNewScriptBtn.addEventListener('click', handleNewScript);
        addNewGroupBtn?.addEventListener('click', handleShowNewGroupModal);
        backToListBtn.addEventListener('click', () => showView('scripts-list-view'));
        saveScriptBtn.addEventListener('click', handleSaveScript);
        showJobModalBtn.addEventListener('click', handleShowJobModal);
        jobModalCancelBtn.addEventListener('click', () => jobModalOverlay.style.display = 'none');
        launchJobBtn.addEventListener('click', handleLaunchJob);
        stopJobBtn.addEventListener('click', () => alert('Abort Job not implemented.'));
        window.api.onJobUpdate(handleJobUpdate);
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) hideContextMenus();
        });
        menuLaunchProfile?.addEventListener('click', handleLaunchProfile);
        document.querySelector('#menu-rename-profile')?.addEventListener('click', handleRenameProfile);
        document.querySelector('#menu-settings-profile')?.addEventListener('click', () => openProfileSettings(state.contextMenuTargetId));
        document.querySelector('#menu-delete-profile')?.addEventListener('click', handleDeleteProfile);
        document.querySelector('#menu-edit-script')?.addEventListener('click', () => openEditor(state.contextMenuTargetId));
        document.querySelector('#menu-rename-script')?.addEventListener('click', handleRenameScript);
        document.querySelector('#menu-delete-script')?.addEventListener('click', handleDeleteScript);
        menuEditGroup?.addEventListener('click', handleShowEditGroupModal);
        menuDeleteGroup?.addEventListener('click', handleDeleteGroup);
        menuEnableGroup?.addEventListener('click', () => handleToggleGroup(true));
        menuDisableGroup?.addEventListener('click', () => handleToggleGroup(false));
        menuGroupSettings?.addEventListener('click', () => openGroupSettings(state.contextMenuTargetId));
        backToProfilesFromGroupSettingsBtn?.addEventListener('click', () => showView('profiles-view'));
        saveGroupSettingsBtn?.addEventListener('click', handleSaveGroupSettings);
        backToProfilesBtn?.addEventListener('click', () => showView('profiles-view'));
        changePfpBtn?.addEventListener('click', handleChangePfp);
        saveProfileSettingsBtn?.addEventListener('click', handleSaveProfileSettings);
        backToAppsBtn?.addEventListener('click', () => showView('apps-view'));
        groupModalCancelBtn?.addEventListener('click', () => groupModalOverlay.style.display = 'none');
        groupModalSaveBtn?.addEventListener('click', handleGroupSaveConfirm);
        groupNameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleGroupSaveConfirm();
        });
        groupColorPicker.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                groupColorPicker.querySelector('.active')?.classList.remove('active');
                swatch.classList.add('active');
            });
        });
    }

    function hideContextMenus() {
        if (scriptContextMenu) scriptContextMenu.style.display = 'none';
        if (profileContextMenu) profileContextMenu.style.display = 'none';
        if (groupContextMenu) groupContextMenu.style.display = 'none';
    }

    function showView(viewId) {
        allViews.forEach(v => v.classList.remove('active'));
        const viewToShow = document.getElementById(viewId);
        if (viewToShow) viewToShow.classList.add('active');
        navLinks.forEach(link => {
            const linkRepresentsView = link.dataset.view;
            const isDirectMatch = (linkRepresentsView === viewId);
            const isProfilesSectionActive = viewId.startsWith('profile') && linkRepresentsView === 'profiles-view';
            const isScriptsSectionActive = viewId.startsWith('script') && linkRepresentsView === 'scripts-list-view';
            const isAppsSectionActive = viewId.startsWith('dashboard') && linkRepresentsView === 'apps-view';
            link.classList.toggle('active', isDirectMatch || isProfilesSectionActive || isScriptsSectionActive || isAppsSectionActive);
        });
    }

    function displayAllData() {
        displayGroupTabs();
        displayProfiles();
        displayScripts();
        displayDashboards();
    }

    async function displayDashboards() {
        const dashboards = await window.api.getDashboards();
        dashboardGrid.innerHTML = '';
        dashboardEmptyState.style.display = dashboards.length === 0 ? 'block' : 'none';
        dashboards.forEach(dash => {
            const card = document.createElement('div');
            card.className = 'dashboard-card';
            card.dataset.scriptId = dash.id;
            card.innerHTML = `<h3>${dash.name}</h3>`;
            card.addEventListener('click', () => openDashboard(dash.id, dash.name));
            dashboardGrid.appendChild(card);
        });
    }

    function openDashboard(scriptId, scriptName) {
        if (!userDataPath) return alert("Error: userDataPath not available.");
        const safePath = `${userDataPath}/Dashboards/script_${scriptId}.html`.replace(/\\/g, '/');
        const dashboardUrl = `file://${safePath}`;
        dashboardViewerTitle.textContent = scriptName;
        dashboardWebview.src = dashboardUrl;
        dashboardWebview.addEventListener('dom-ready', () => {
            console.log('Webview DOM is ready.');
        });
        showView('dashboard-viewer-view');
    }

    async function displayGroupTabs() {
        const groups = await window.api.getGroups();
        const allProfilesTab = groupTabsContainer.querySelector('[data-group-id="all"]');
        groupTabsContainer.innerHTML = '';
        if (allProfilesTab) groupTabsContainer.appendChild(allProfilesTab);
        groups.forEach(group => {
            const tab = document.createElement('button');
            tab.className = 'tab-item';
            tab.dataset.groupId = group.id;
            tab.innerHTML = `<span class="group-status-dot ${group.is_enabled ? 'enabled' : ''}"></span><span class="tab-text">${group.name}</span>`;
            groupTabsContainer.appendChild(tab);
        });
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.groupId === String(state.activeGroupId));
        });
        setupTabEventListeners();
    }

    function setupTabEventListeners() {
        document.querySelectorAll('.tab-item').forEach(tab => {
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
            newTab.addEventListener('click', handleTabClick);
            if (newTab.dataset.groupId !== 'all') {
                newTab.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    hideContextMenus();
                    state.contextMenuTargetId = newTab.dataset.groupId;
                    groupContextMenu.style.display = 'block';
                    groupContextMenu.style.top = `${e.clientY}px`;
                    groupContextMenu.style.left = `${e.clientX}px`;
                });
            }
        });
    }

    function handleTabClick(event) {
        const clickedTab = event.currentTarget;
        state.activeGroupId = clickedTab.dataset.groupId;
        document.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
        clickedTab.classList.add('active');
        displayProfiles();
    }

    function handleShowNewGroupModal() {
        state.groupInEditorId = null;
        groupModalTitle.textContent = 'Create New Group';
        groupNameInput.value = '';
        groupColorPicker.querySelector('.active')?.classList.remove('active');
        groupColorPicker.querySelector('[data-color="#808080"]')?.classList.add('active');
        groupModalOverlay.style.display = 'flex';
        groupNameInput.focus();
    }

    async function handleShowEditGroupModal() {
        if (!state.contextMenuTargetId) return;
        hideContextMenus();
        state.groupInEditorId = state.contextMenuTargetId;
        const allGroups = await window.api.getGroups();
        const groupToEdit = allGroups.find(g => g.id == state.groupInEditorId);
        if (groupToEdit) {
            groupModalTitle.textContent = `Edit Group: ${groupToEdit.name}`;
            groupNameInput.value = groupToEdit.name;
            groupColorPicker.querySelector('.active')?.classList.remove('active');
            const swatch = groupColorPicker.querySelector(`[data-color="${groupToEdit.color}"]`);
            if (swatch) swatch.classList.add('active');
            groupModalOverlay.style.display = 'flex';
            groupNameInput.focus();
        }
    }

    async function handleGroupSaveConfirm() {
        const name = groupNameInput.value;
        const colorSwatch = groupColorPicker.querySelector('.color-swatch.active');
        if (!name || name.trim() === '') return alert('Group name cannot be empty.');
        if (!colorSwatch) return alert('Please select a color.');
        const color = colorSwatch.dataset.color;
        let result;
        if (state.groupInEditorId) {
            result = await window.api.updateGroup({
                id: state.groupInEditorId,
                name: name.trim(),
                color
            });
        } else {
            result = await window.api.createGroup({
                name: name.trim(),
                color
            });
        }
        if (result.success) {
            groupModalOverlay.style.display = 'none';
            await displayGroupTabs();
        } else {
            alert(`Error saving group: ${result.message}`);
        }
    }

    async function handleDeleteGroup() {
        if (!state.contextMenuTargetId) return;
        hideContextMenus();
        const allGroups = await window.api.getGroups();
        const groupToDelete = allGroups.find(g => g.id == state.contextMenuTargetId);
        if (groupToDelete && confirm(`Are you sure you want to delete the group "${groupToDelete.name}"? This cannot be undone.`)) {
            const result = await window.api.deleteGroup(groupToDelete.id);
            if (result.success) {
                if (state.activeGroupId == groupToDelete.id) {
                    state.activeGroupId = 'all';
                }
                await displayAllData();
            } else {
                alert(`Error deleting group: ${result.message}`);
            }
        }
    }

    async function handleToggleGroup(isEnabled) {
        if (state.contextMenuTargetId === null || state.contextMenuTargetId === 'all') return;
        hideContextMenus();
        const result = await window.api.toggleGroupEnabled({
            groupId: state.contextMenuTargetId,
            isEnabled: isEnabled
        });
        if (result.success) {
            await displayAllData();
        } else {
            alert(`Error updating group: ${result.message}`);
        }
    }

    async function handleAddProfile() {
        const name = `New Profile ${new Date().toLocaleTimeString()}`;
        const result = await window.api.addProfile(name);
        if (result.success) {
            state.activeGroupId = 'all';
            await displayAllData();
        } else {
            alert(`Error: ${result.message}`);
        }
    }

    async function displayProfiles() {
        let profiles;
        if (state.activeGroupId === 'all' || !state.activeGroupId) {
            profiles = await window.api.getProfiles();
        } else {
            profiles = await window.api.getProfilesByGroupId(state.activeGroupId);
        }
        profilesListUl.innerHTML = '';
        profilesListEmpty.style.display = profiles.length === 0 ? 'block' : 'none';
        if (profiles.length === 0) {
            profilesListEmpty.innerHTML = (state.activeGroupId === 'all') ?
                `<h3>No profiles yet.</h3><p>Click "+" to create your first one.</p>` :
                `<h3>This group is empty.</h3><p>Open a Profile's Settings to add it to this group.</p>`;
        }
        profiles.forEach(p => {
            const li = document.createElement('li');
            const indicator = document.createElement('div');
            indicator.className = 'profile-group-indicator';
            if (p.primary_group_color) {
                indicator.style.backgroundColor = p.primary_group_color;
            }
            li.appendChild(indicator);
            const avatarContainer = document.createElement('span');
            let avatarHtml = `<svg class="profile-avatar default-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>`;
            if (p.avatar_path && p.basePath) {
                const avatarSrc = `file://${p.basePath}/${p.avatar_path}?t=${new Date().getTime()}`;
                avatarHtml = `<img src="${avatarSrc}" alt="Avatar" class="profile-avatar">`;
            }
            avatarContainer.innerHTML = avatarHtml;
            li.appendChild(avatarContainer);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'profile-name';
            nameSpan.textContent = p.name;
            li.appendChild(nameSpan);
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'toggle-switch';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = p.enabled;
            const toggleSlider = document.createElement('div');
            toggleSlider.className = 'toggle-slider';
            toggleLabel.append(toggleInput, toggleSlider);
            li.appendChild(toggleLabel);
            toggleInput.addEventListener('change', () => {
                window.api.toggleProfileEnabled({
                    id: p.id,
                    isEnabled: toggleInput.checked
                }).then(() => displayGroupTabs());
            });
            li.addEventListener('contextmenu', e => {
                e.preventDefault();
                hideContextMenus();
                state.contextMenuTargetId = p.id;
                profileContextMenu.style.display = 'block';
                profileContextMenu.style.top = `${e.clientY}px`;
                profileContextMenu.style.left = `${e.clientX}px`;
            });
            profilesListUl.appendChild(li);
        });
    }

    async function openGroupSettings(groupId) {
        if (!groupId || groupId === 'all') return;
        hideContextMenus();
        state.groupInEditorId = groupId;
        const [allGroups, allProfiles, groupMembersResult] = await Promise.all([
            window.api.getGroups(),
            window.api.getProfiles(),
            window.api.getGroupMembers(groupId)
        ]);
        if (!groupMembersResult.success) return alert(`Error fetching group members: ${groupMembersResult.message}`);
        const memberIds = groupMembersResult.memberIds;
        const currentGroup = allGroups.find(g => g.id == groupId);
        groupSettingsTitle.textContent = `Settings for: ${currentGroup.name}`;
        groupMembersList.innerHTML = '';
        if (allProfiles.length === 0) {
            groupMembersList.innerHTML = '<p>No profiles exist to be added to this group.</p>';
        } else {
            allProfiles.forEach(profile => {
                const isChecked = memberIds.includes(profile.id);
                const item = document.createElement('div');
                item.className = 'member-checkbox-item';
                item.innerHTML = `<input type="checkbox" id="member-check-${profile.id}" data-profile-id="${profile.id}" ${isChecked ? 'checked' : ''}><label for="member-check-${profile.id}">${profile.name}</label>`;
                groupMembersList.appendChild(item);
            });
        }
        showView('group-settings-view');
    }

    async function handleSaveGroupSettings() {
        if (!state.groupInEditorId) return;
        const groupId = state.groupInEditorId;
        const checkboxes = groupMembersList.querySelectorAll('input[type="checkbox"]');
        const promises = [];
        checkboxes.forEach(checkbox => {
            const profileId = parseInt(checkbox.dataset.profileId);
            if (checkbox.checked) {
                promises.push(window.api.addProfileToGroup({
                    profileId,
                    groupId
                }));
            } else {
                promises.push(window.api.removeProfileFromGroup({
                    profileId,
                    groupId
                }));
            }
        });
        await Promise.all(promises);
        alert('Group members saved successfully!');
        await displayAllData();
        showView('profiles-view');
    }

    async function handleRenameProfile() {
        if (!state.contextMenuTargetId) return;
        hideContextMenus();
        const profile = (await window.api.getProfiles()).find(p => p.id == state.contextMenuTargetId);
        if (!profile) return;
        const newName = prompt(`Enter new name for "${profile.name}":`, profile.name);
        if (newName && newName.trim() !== '' && newName !== profile.name) {
            const result = await window.api.renameProfile({
                id: state.contextMenuTargetId,
                newName: newName.trim()
            });
            if (result.success) {
                await displayProfiles();
            } else {
                alert(`Error renaming profile: ${result.message}`);
            }
        }
    }

    async function handleDeleteProfile() {
        if (!state.contextMenuTargetId) return;
        hideContextMenus();
        const allProfiles = await window.api.getProfiles();
        const profile = allProfiles.find(p => p.id == state.contextMenuTargetId);
        if (!profile) return;
        if (confirm(`Delete "${profile.name}"?`)) {
            await window.api.deleteProfile(profile.id);
            await displayProfiles();
        }
    }

    async function handleLaunchProfile() {
        if (state.contextMenuTargetId === null) return;
        const targetProfileId = state.contextMenuTargetId;
        hideContextMenus();
        const allProfiles = await window.api.getProfiles();
        const originalEnabledStates = allProfiles.map(p => ({
            id: p.id,
            enabled: p.enabled
        }));
        const togglePromises = allProfiles.map(profile => {
            const shouldBeEnabled = (profile.id === targetProfileId);
            if (profile.enabled !== shouldBeEnabled) {
                return window.api.toggleProfileEnabled({
                    id: profile.id,
                    isEnabled: shouldBeEnabled
                });
            }
            return Promise.resolve();
        });
        await Promise.all(togglePromises);
        const targetProfileName = allProfiles.find(p => p.id === targetProfileId)?.name || 'Profile';
        const launcherJob = {
            scriptId: -1,
            scriptCode: `// Interactive session launcher.\nawait page.goto('https://google.com');`,
            scriptName: `Interactive: ${targetProfileName}`,
            runMode: 'headed'
        };
        window.api.runJob(launcherJob);
        setTimeout(() => {
            const restorePromises = originalEnabledStates.map(state => {
                return window.api.toggleProfileEnabled({
                    id: state.id,
                    isEnabled: state.enabled
                });
            });
            Promise.all(restorePromises).then(() => {
                displayProfiles();
            });
        }, 3000);
    }

    async function openProfileSettings(profileId) {
        if (!profileId) return;
        hideContextMenus();
        state.profileInSettingsId = profileId;
        const result = await window.api.getProfileById(profileId);
        if (!result.success) return alert(`Error: ${result.message}`);
        const {
            profile
        } = result;
        profileSettingsTitle.textContent = `Edit Profile: ${profile.name}`;
        profileNameInputSettings.value = profile.name;
        pfpPreview.src = profile.avatar_path ? `file://${profile.basePath}/${profile.avatar_path}` : '';
        profileGroupsList.innerHTML = '<p>Loading groups...</p>';
        const allGroups = await window.api.getGroups();
        const memberships = await window.api.getProfileGroupMemberships(profileId);
        if (!memberships.success) return alert(`Error: ${memberships.message}`);
        profileGroupsList.innerHTML = '';
        if (allGroups.length === 0) {
            profileGroupsList.innerHTML = '<p>No groups created yet.</p>';
        } else {
            allGroups.forEach(group => {
                const isChecked = memberships.memberOf.includes(group.id);
                const isPrimary = (memberships.primaryGroupId === group.id);
                const item = document.createElement('div');
                item.className = 'group-checkbox-item';
                item.innerHTML = `<div class="group-color-dot" style="background-color: ${group.color};"></div><input type="checkbox" id="group-member-${group.id}" data-group-id="${group.id}" ${isChecked ? 'checked' : ''}><label for="group-member-${group.id}">${group.name}</label><div style="margin-left: auto;"><input type="radio" name="primary-group" id="group-primary-${group.id}" data-group-id="${group.id}" ${isPrimary ? 'checked' : ''}></div>`;
                profileGroupsList.appendChild(item);
            });
        }
        showView('profile-settings-view');
    }

    async function handleChangePfp() {
        if (!state.profileInSettingsId) return;
        const result = await window.api.setProfileAvatar(state.profileInSettingsId);
        if (result.success) {
            const profileResult = await window.api.getProfileById(state.profileInSettingsId);
            pfpPreview.src = `file://${profileResult.profile.basePath}/${result.avatarPath}?t=${new Date().getTime()}`;
            alert('Profile picture updated!');
            await displayProfiles();
        } else if (result.message !== 'No file selected.') {
            alert(`Error changing picture: ${result.message}`);
        }
    }

    async function handleSaveProfileSettings() {
        if (!state.profileInSettingsId) return;
        const newName = profileNameInputSettings.value.trim();
        if (!newName) return alert('Profile name cannot be empty.');
        await window.api.renameProfile({
            id: state.profileInSettingsId,
            newName
        });
        const memberCheckboxes = profileGroupsList.querySelectorAll('input[type="checkbox"]');
        const membershipsToSet = [];
        memberCheckboxes.forEach(cb => {
            if (cb.checked) membershipsToSet.push(parseInt(cb.dataset.groupId));
        });
        const primaryRadio = profileGroupsList.querySelector('input[type="radio"]:checked');
        const primaryGroupId = primaryRadio ? parseInt(primaryRadio.dataset.groupId) : null;
        const allGroups = await window.api.getGroups();
        for (const group of allGroups) {
            if (membershipsToSet.includes(group.id)) {
                await window.api.addProfileToGroup({
                    profileId: state.profileInSettingsId,
                    groupId: group.id
                });
            } else {
                await window.api.removeProfileFromGroup({
                    profileId: state.profileInSettingsId,
                    groupId: group.id
                });
            }
        }
        await window.api.setProfilePrimaryGroup({
            profileId: state.profileInSettingsId,
            groupId: primaryGroupId
        });
        alert('Profile saved successfully!');
        profileSettingsTitle.textContent = `Edit Profile: ${newName}`;
        await displayAllData();
    }

    async function displayScripts() {
        const list = document.querySelector('#scripts-list-ul');
        const scripts = await window.api.getScripts();
        list.innerHTML = '';
        scriptsListEmpty.style.display = scripts.length === 0 ? 'block' : 'none';
        scripts.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s.name;
            li.dataset.scriptId = s.id;
            li.addEventListener('click', () => openEditor(s.id));
            li.addEventListener('contextmenu', e => {
                e.preventDefault();
                hideContextMenus();
                state.contextMenuTargetId = s.id;
                scriptContextMenu.style.display = 'block';
                scriptContextMenu.style.top = `${e.clientY}px`;
                scriptContextMenu.style.left = `${e.clientX}px`;
            });
            list.appendChild(li);
        });
    }

    async function openEditor(id) {
        if (!id) return;
        hideContextMenus();
        const script = await window.api.getScriptById(id);
        if (script) {
            state.scriptInEditorId = script.id;
            scriptNameInputEditor.value = script.name;
            codeEditor.setValue(script.code || '');
            showView('script-editor-view');
            setTimeout(() => codeEditor.refresh(), 10);
        }
    }

    async function handleNewScript() {
        const name = `Untitled Script ${new Date().toLocaleTimeString()}`;
        const result = await window.api.createScript(name);
        if (result.success) {
            await displayScripts();
            await openEditor(result.id);
        }
    }

    async function handleSaveScript() {
        if (!state.scriptInEditorId) return;
        const result = await window.api.saveScript({
            id: state.scriptInEditorId,
            name: scriptNameInputEditor.value,
            code: codeEditor.getValue()
        });
        if (result.success) {
            alert('Saved!');
            await displayScripts();
        } else {
            alert(`Error: ${result.message}`);
        }
    }

    async function handleRenameScript() {
        hideContextMenus();
        alert('To rename, change name in the editor and click Save.');
    }

    async function handleDeleteScript() {
        if (!state.contextMenuTargetId) return;
        hideContextMenus();
        const script = await window.api.getScriptById(state.contextMenuTargetId);
        if (!script) return;
        if (confirm(`Delete "${script.name}"?`)) {
            await window.api.deleteScript(script.id);
            if (state.scriptInEditorId === script.id) {
                state.scriptInEditorId = null;
                scriptNameInputEditor.value = '';
                codeEditor.setValue('// Script deleted.');
            }
            await displayScripts();
        }
    }

    function handleJobUpdate(update) {
        const {
            type,
            payload
        } = update;
        switch (type) {
            case 'start':
                jobIdleState.style.display = 'none';
                jobMonitorWrapper.style.display = 'flex';
                jobLogConsole.innerHTML = '';
                jobOverviewScriptName.textContent = payload.scriptName;
                jobOverviewStatus.textContent = 'Initializing...';
                jobOverviewProgress.textContent = `0 / ${payload.totalProfiles}`;
                jobStartTime = Date.now();
                elapsedTimeInterval = setInterval(updateElapsedTime, 1000);
                addLog('Job starting...', 'orchestrator');
                break;
            case 'progress':
                jobOverviewStatus.textContent = `Running... ${payload.message}`;
                jobOverviewProgress.textContent = `${payload.currentProfile} / ${payload.totalProfiles}`;
                addLog(`[${payload.currentProfile}/${payload.totalProfiles}] "${payload.profileName}": ${payload.message}`, 'orchestrator');
                break;
            case 'log':
                addLog(`[${payload.source}] ${payload.message}`, payload.source.toLowerCase(), payload.status);
                break;
            case 'end':
                jobOverviewStatus.textContent = 'Finished';
                clearInterval(elapsedTimeInterval);
                addLog('Job finished.', 'orchestrator', 'success');
                break;
        }
    }

    function addLog(message, sourceClass, statusClass) {
        const line = document.createElement('div');
        line.textContent = `> ${message}`;
        line.classList.add('log-line', sourceClass);
        if (statusClass) {
            line.classList.add(statusClass);
        }
        jobLogConsole.appendChild(line);
        jobLogConsole.scrollTop = jobLogConsole.scrollHeight;
    }

    function updateElapsedTime() {
        const seconds = Math.floor((Date.now() - jobStartTime) / 1000);
        jobOverviewElapsedTime.textContent = `${seconds}s`;
    }

    async function handleShowJobModal() {
        const scripts = await window.api.getScripts();
        scriptSelect.innerHTML = '';
        if (scripts.length === 0) {
            scriptSelect.innerHTML = '<option value="">No scripts found</option>';
            launchJobBtn.disabled = true;
        } else {
            scripts.forEach(s => {
                const o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.name;
                scriptSelect.appendChild(o);
            });
            launchJobBtn.disabled = false;
        }
        jobModalOverlay.style.display = 'flex';
    }

    function handleLaunchJob() {
        const s = scriptSelect.value;
        const m = document.querySelector('input[name="runMode"]:checked').value;
        if (!s) {
            return alert('Select script.');
        }
        window.api.runJob({
            scriptId: s,
            runMode: m
        });
        jobModalOverlay.style.display = 'none';
    }

    // --- START THE APP ---
    initialize();
});