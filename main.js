// main.js - FINAL STABLE with Avatar & Profile Fixes


const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
let mainWindow;

// --- DATABASE & FOLDER SETUP ---
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'automator.db');
const profilesDirPath = path.join(userDataPath, 'Profiles');
const avatarsDirPath = path.join(userDataPath, 'avatars');
const scriptDataDirPath = path.join(userDataPath, 'ScriptData');
const scriptWorkspacesDirPath = path.join(userDataPath, 'ScriptWorkspaces');


if (!fs.existsSync(profilesDirPath)) fs.mkdirSync(profilesDirPath, { recursive: true });
if (!fs.existsSync(avatarsDirPath)) fs.mkdirSync(avatarsDirPath, { recursive: true });
if (!fs.existsSync(scriptDataDirPath)) fs.mkdirSync(scriptDataDirPath, { recursive: true });
if (!fs.existsSync(scriptWorkspacesDirPath)) fs.mkdirSync(scriptWorkspacesDirPath, { recursive: true });


const db = new Database(dbPath);
console.log('Database connected at:', dbPath);

// --- ENSURE DATABASE SCHEMA ---

// Step 1: Base tables
db.exec("CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, user_data_path TEXT, enabled INTEGER NOT NULL DEFAULT 1, avatar_path TEXT);");
db.exec("CREATE TABLE IF NOT EXISTS scripts (id INTEGER PRIMARY KEY, name TEXT, code TEXT);");
db.exec(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#808080');`);
db.exec(`CREATE TABLE IF NOT EXISTS profile_groups (profile_id INTEGER NOT NULL, group_id INTEGER NOT NULL, FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE, FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE, PRIMARY KEY (profile_id, group_id));`);

// Step 2: Table Migrations (adding new columns).
// We wrap these in try-catch because ALTER TABLE fails if the column already exists.
// This is a simple and safe way to ensure our schema is up-to-date.

try {
    db.exec('ALTER TABLE profiles ADD COLUMN primary_group_id INTEGER;');
    console.log('Schema migration: Added "primary_group_id" to profiles table.');
} catch (err) {
    if (!err.message.includes('duplicate column name')) console.error('Profile migration error:', err);
}

// --- NEW MIGRATIONS FOR DASHBOARD FEATURE (v0.1.4) ---
try {
    db.exec('ALTER TABLE scripts ADD COLUMN is_dashboard INTEGER NOT NULL DEFAULT 0;');
    console.log('Schema migration: Added "is_dashboard" to scripts table.');
} catch (err) {
    if (!err.message.includes('duplicate column name')) console.error('Script migration error (is_dashboard):', err);
}

try {
    db.exec('ALTER TABLE scripts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;');
    console.log('Schema migration: Added "is_pinned" to scripts table.');
} catch (err) {
    if (!err.message.includes('duplicate column name')) console.error('Script migration error (is_pinned):', err);
}
// --- END OF NEW MIGRATIONS ---

console.log('Database schema ensured.');


// --- IPC HANDLERS ---

ipcMain.handle('get-profiles', () => {
    try {
        // This query now uses a LEFT JOIN. This means "get all profiles,
        // and if a profile has a primary_group_id, also get the color
        // from the corresponding row in the 'groups' table".
        // If there's no primary group, primary_group_color will be NULL.
        const query = `
            SELECT p.*, g.color AS primary_group_color
            FROM profiles p
            LEFT JOIN groups g ON p.primary_group_id = g.id
            ORDER BY p.name
        `;
        const profiles = db.prepare(query).all();
        // The rest of the logic remains the same.
        return profiles.map(p => ({ ...p, basePath: userDataPath }));
    } catch (err) {
        console.error("Get Profiles Error:", err.message);
        return [];
    }
});


ipcMain.handle('update-group', (event, { id, name, color }) => {
    try {
        db.prepare('UPDATE groups SET name = ?, color = ? WHERE id = ?').run(name, color, id);
        return { success: true };
    } catch (err) {
        console.error('update-group error:', err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('delete-group', (event, id) => {
    try {
        // We use a transaction to ensure both operations succeed or fail together.
        // It deletes the group from the main 'groups' table and also cleans up
        // all links from the 'profile_groups' table. The ON DELETE CASCADE
        // in our schema should handle this, but an explicit delete is safer.
        const stmt = db.transaction(() => {
            db.prepare('DELETE FROM profile_groups WHERE group_id = ?').run(id);
            db.prepare('DELETE FROM groups WHERE id = ?').run(id);
        });
        stmt();
        return { success: true };
    } catch (err) {
        console.error('delete-group error:', err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('get-profiles-by-group-id', (event, groupId) => {
    try {
        // This is a more complex query. It joins the three tables to find all
        // profiles linked to a specific group ID.
        const query = `
            SELECT p.*, g.color AS primary_group_color
            FROM profiles p
            JOIN profile_groups pg ON p.id = pg.profile_id
            LEFT JOIN groups g ON p.primary_group_id = g.id
            WHERE pg.group_id = ?
            ORDER BY p.name
        `;
        const profiles = db.prepare(query).all(groupId);
        // We add the basePath just like in the get-profiles handler.
        return profiles.map(p => ({ ...p, basePath: userDataPath }));
    } catch (err) {
        console.error('get-profiles-by-group-id error:', err.message);
        return [];
    }
});

ipcMain.handle('add-profile-to-group', (event, { profileId, groupId }) => {
    try {
        // 'OR IGNORE' is a useful SQLite command. If the link already exists
        // (violating the PRIMARY KEY), it will simply do nothing instead of
        // throwing an error, which is perfect for our use case.
        db.prepare('INSERT OR IGNORE INTO profile_groups (profile_id, group_id) VALUES (?, ?)')
            .run(profileId, groupId);
        return { success: true };
    } catch (err) {
        console.error('add-profile-to-group error:', err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('remove-profile-from-group', (event, { profileId, groupId }) => {
    try {
        db.prepare('DELETE FROM profile_groups WHERE profile_id = ? AND group_id = ?')
            .run(profileId, groupId);
        return { success: true };
    } catch (err) {
        console.error('remove-profile-from-group error:', err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('get-groups', () => {
    try {
        // This is an advanced query. For each group, it runs a subquery in parentheses
        // that counts the number of enabled profiles linked to that group.
        // The result of this count is returned as a new temporary column called 'enabled_profile_count'.
        const query = `
            SELECT 
                g.*, 
                (
                    SELECT COUNT(*) 
                    FROM profile_groups pg
                    JOIN profiles p ON p.id = pg.profile_id
                    WHERE pg.group_id = g.id AND p.enabled = 1
                ) AS enabled_profile_count
            FROM groups g
            ORDER BY g.name
        `;
        const groups = db.prepare(query).all();

        // We process the raw data to add our simple boolean 'is_enabled' property for the frontend.
        return groups.map(group => ({
            ...group,
            is_enabled: group.enabled_profile_count > 0
        }));
    } catch (err) {
        console.error('get-groups error:', err.message);
        return []; // Return an empty array on failure
    }
});


ipcMain.handle('create-group', (event, { name, color }) => {
    try {
        // Prepared statement to prevent SQL injection.
        const stmt = db.prepare('INSERT INTO groups (name, color) VALUES (?, ?)');
        const info = stmt.run(name, color);
        // Return success and the ID of the new group, which is useful for the UI.
        return { success: true, id: info.lastInsertRowid };
    } catch (err) {
        console.error('create-group error:', err.message);
        // Return failure and the specific error message, e.g., "UNIQUE constraint failed".
        return { success: false, message: err.message };
    }
});

ipcMain.handle('set-profile-primary-group', (event, { profileId, groupId }) => {
    try {
        // Simple update query to set the primary group ID for a specific profile.
        // groupId can be NULL if the user wants to remove the primary indicator.
        db.prepare('UPDATE profiles SET primary_group_id = ? WHERE id = ?')
            .run(groupId, profileId);
        return { success: true };
    } catch (err) {
        console.error('set-profile-primary-group error:', err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('toggle-group-enabled', (event, { groupId, isEnabled }) => {
    try {
        // This is the powerful bulk-update query.
        // It updates the 'enabled' status of all profiles that have a link
        // to the specified groupId in the profile_groups table.
        const query = `
            UPDATE profiles
            SET enabled = ?
            WHERE id IN (
                SELECT profile_id FROM profile_groups WHERE group_id = ?
            )
        `;
        db.prepare(query).run(isEnabled ? 1 : 0, groupId);
        return { success: true };
    } catch (err) {
        console.error('toggle-group-enabled error:', err.message);
        return { success: false, message: err.message };
    }
});
ipcMain.handle('get-profile-group-memberships', (event, profileId) => {
    try {
        // Query 1: Get ALL groups that this profile is a member of.
        const membershipQuery = `
            SELECT group_id FROM profile_groups WHERE profile_id = ?
        `;
        // .map() transforms the array of objects like [{group_id: 1}, {group_id: 3}]
        // into a simple array of IDs like [1, 3] which is easier for the frontend.
        const memberOf = db.prepare(membershipQuery).all(profileId).map(row => row.group_id);

        // Query 2: Get the profile's specifically assigned primary group ID.
        const primaryGroupQuery = `SELECT primary_group_id FROM profiles WHERE id = ?`;
        const primaryGroupId = db.prepare(primaryGroupQuery).get(profileId).primary_group_id;

        // Return all the data the settings page will need.
        return { success: true, memberOf, primaryGroupId };
    } catch (err) {
        console.error('get-profile-group-memberships error:', err.message);
        return { success: false, message: err.message };
    }
});
ipcMain.handle('get-group-members', (event, groupId) => {
    try {
        // This query specifically selects only the profile_id column.
        const query = `
            SELECT profile_id FROM profile_groups WHERE group_id = ?
        `;

        // The .map() is a convenient way to transform the array of objects
        // (e.g., [{profile_id: 1}, {profile_id: 5}]) into a simple array
        // of numbers (e.g., [1, 5]), which is much easier for the frontend to work with.
        const memberIds = db.prepare(query).all(groupId).map(row => row.profile_id);

        return { success: true, memberIds };
    } catch (err) {
        console.error('get-group-members error:', err.message);
        return { success: false, message: err.message };
    }
});



// --- ATOMIC TRANSACTION FOR ADDING PROFILES ---
const addProfileTransaction = db.transaction((name) => {
    const insertInfo = db.prepare('INSERT INTO profiles (name) VALUES (?)').run(name);
    const newId = insertInfo.lastInsertRowid;
    const profilePath = path.join(profilesDirPath, `profile_${newId}`);

    // Create the physical folder on the disk
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath);

    // Update the database record with the folder's path
    db.prepare('UPDATE profiles SET user_data_path = ? WHERE id = ?').run(profilePath, newId);

    // The transaction function needs to return the final ID
    return newId;
});


// THIS IS THE CORRECTED "ADD PROFILE" HANDLER
ipcMain.handle('add-profile', (event, name) => {
    try {
        const newId = addProfileTransaction(name);
        return { success: true, id: newId };
    } catch (err) {
        console.error("Add Profile Transaction Error:", err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('toggle-profile-enabled', (event, { id, isEnabled }) => {
    try { db.prepare('UPDATE profiles SET enabled = ? WHERE id = ?').run(isEnabled ? 1 : 0, id); return { success: true }; }
    catch (err) { return { success: false, message: err.message }; }
});

ipcMain.handle('delete-profile', (event, id) => {
    try {
        const profile = db.prepare('SELECT user_data_path, avatar_path FROM profiles WHERE id = ?').get(id);
        if (profile && profile.user_data_path) fs.rmSync(profile.user_data_path, { recursive: true, force: true });
        if (profile && profile.avatar_path) {
            // Also delete the avatar when deleting a profile
            const avatarFullPath = path.join(userDataPath, profile.avatar_path);
            if (fs.existsSync(avatarFullPath)) fs.unlinkSync(avatarFullPath);
        }
        db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
        return { success: true };
    } catch (err) {
        console.error("Delete Profile Error:", err.message);
        return { success: false, message: err.message };
    }
});

ipcMain.handle('rename-profile', (event, { id, newName }) => {
    try { db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(newName, id); return { success: true }; }
    catch (err) { return { success: false, message: err.message }; }
});

// THIS IS THE NEW "SET AVATAR" HANDLER
ipcMain.handle('set-profile-avatar', async (event, profileId) => {
    if (!mainWindow) return { success: false, message: 'Main window not found.' };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Profile Picture', properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });

    if (canceled || filePaths.length === 0) return { success: false, message: 'No file selected.' };

    const originalPath = filePaths[0];
    const extension = path.extname(originalPath);
    const newFileName = `avatar_${profileId}${extension}`;
    const newPath = path.join(avatarsDirPath, newFileName);
    const relativePath = `avatars/${newFileName}`; // Store a relative path

    try {
        fs.copyFileSync(originalPath, newPath);
        db.prepare('UPDATE profiles SET avatar_path = ? WHERE id = ?').run(relativePath, profileId);
        // We need to send the full path back to the UI to render it, so we use a special protocol
        // that we will build into our preload.js in the next step.
        // For now, returning the relative path is correct.
        return { success: true, avatarPath: relativePath };
    } catch (err) {
        console.error('Avatar copy/save failed:', err);
        return { success: false, message: 'Failed to save avatar.' };
    }
});


// THIS IS THE NEW "GET PROFILE BY ID" HANDLER
ipcMain.handle('get-profile-by-id', (event, id) => {
    try {
        const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
        // We also need the base path to correctly construct image URLs on the frontend
        profile.basePath = userDataPath;
        return { success: true, profile };
    } catch (err) {
        console.error("Get Profile By ID Error:", err.message);
        return { success: false, message: err.message };
    }
});


// --- Script and Job Handlers (Unchanged) ---
ipcMain.handle('get-scripts', () => db.prepare('SELECT id,name FROM scripts ORDER BY name').all());
ipcMain.handle('get-script-by-id', (e, id) => db.prepare('SELECT * FROM scripts WHERE id = ?').get(id));
ipcMain.handle('create-script', (e, name) => {
    // We can add a hint about the new workspace API to the default script template
    const defaultCode = `// Script for: ${name}\n\n// The browser will NOT close automatically when your script ends.\n// To close it, you MUST include this line as the final command:\nawait browser.close();\n\nconsole.log('Script is running on profile:', automator.getProfileName());\n\nawait page.goto('https://google.com');\n\nconsole.log('Task finished. Now closing the browser.');\nawait browser.close();\n`;
    try {
        const info = db.prepare('INSERT INTO scripts (name, code) VALUES (?, ?)').run(name, defaultCode);
        const newScriptId = info.lastInsertRowid;

        // Create the database file
        const scriptDbPath = path.join(scriptDataDirPath, `script_${newScriptId}.db`);
        new Database(scriptDbPath).close();

        // --- NEW: Create the dedicated workspace folder ---
        const scriptWorkspacePath = path.join(scriptWorkspacesDirPath, `script_${newScriptId}`);
        if (!fs.existsSync(scriptWorkspacePath)) {
            fs.mkdirSync(scriptWorkspacePath);
        }

        console.log(`Initialized database and workspace for script ID ${newScriptId}`);
        return { success: true, id: newScriptId };
    } catch (err) {
        console.error('create-script error:', err.message);
        return { success: false, message: err.message };
    }
});


ipcMain.handle('save-script', (e, s) => { try { db.prepare('UPDATE scripts SET name=?,code=? WHERE id=?').run(s.name, s.code, s.id); return { success: true } } catch (err) { return { success: false, message: err.message } } });
ipcMain.handle('delete-script', (e, id) => {
    try {
        db.prepare('DELETE FROM scripts WHERE id = ?').run(id);

        // Delete the database file
        const scriptDbPath = path.join(scriptDataDirPath, `script_${id}.db`);
        if (fs.existsSync(scriptDbPath)) fs.unlinkSync(scriptDbPath);

        // --- NEW: Also delete the script's entire workspace folder ---
        const scriptWorkspacePath = path.join(scriptWorkspacesDirPath, `script_${id}`);
        if (fs.existsSync(scriptWorkspacePath)) {
            // fs.rmSync is the modern way to delete a folder and all its contents
            fs.rmSync(scriptWorkspacePath, { recursive: true, force: true });
        }

        console.log(`Deleted database and workspace for script ID ${id}`);
        return { success: true };
    } catch (err) {
        console.error('delete-script error:', err.message);
        return { success: false, message: err.message };
    }
});



// main.js -> The definitive run-job handler for all v0.1.4 features

// main.js -> The definitive, architecturally correct run-job handler

// main.js -> The definitive, final run-job handler for all features.

// main.js -> The definitive, final run-job handler for all features.

ipcMain.handle('run-job', async (e, { scriptId: s, runMode: d, scriptCode: c, scriptName: m }) => {
    const scriptInfo = c ? { id: -1, name: m, code: c } : db.prepare('SELECT * FROM scripts WHERE id = ?').get(s);
    if (!scriptInfo) {
        return { success: false, message: 'Script not found.' };
    }

    const profiles = db.prepare('SELECT * FROM profiles WHERE enabled = 1 ORDER BY name').all();
    if (profiles.length === 0) {
        mainWindow?.webContents.send('job-update', { type: 'end', payload: { message: 'Job finished. No profiles enabled.' } });
        return { success: false, message: 'No profiles enabled.' };
    }

    // --- SETUP FOR APIs (Paths are defined inside the handler's scope) ---
    const scriptDbPath = path.join(scriptDataDirPath, `script_${scriptInfo.id}.db`);
    const scriptWorkspacePath = path.join(scriptWorkspacesDirPath, `script_${scriptInfo.id}`);
    const dashboardsDirPath = path.join(userDataPath, 'Dashboards'); // THIS LINE IS THE FIX
    let scriptDb = (scriptInfo.id !== -1 && fs.existsSync(scriptDbPath)) ? new Database(scriptDbPath) : null;
    const allProfilesForScript = db.prepare('SELECT id, name, avatar_path FROM profiles ORDER BY name').all().map(p => ({
        id: p.id,
        name: p.name,
        avatarPath: p.avatar_path ? `file://${path.join(userDataPath, p.avatar_path)}` : null
    }));

    mainWindow?.webContents.send('job-update', {
        type: 'start',
        payload: { scriptName: scriptInfo.name, totalProfiles: profiles.length }
    });

    for (const [index, profile] of profiles.entries()) {
        mainWindow?.webContents.send('job-update', {
            type: 'progress',
            payload: { currentProfile: index + 1, totalProfiles: profiles.length, profileName: profile.name, message: 'Launching browser...' }
        });

        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: d === 'headless',
                executablePath: puppeteer.executablePath(),
                userDataDir: profile.user_data_path,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = (await browser.pages())[0] || await browser.newPage();
            page.on('console', c => mainWindow?.webContents.send('job-update', {
                type: 'log',
                payload: { source: 'Script', message: c.text() }
            }));

            // --- NODE.JS API OBJECT ---
            const automatorApi = {
                getProfileName: () => profile.name,
                getAllProfiles: () => allProfilesForScript,

                workspace: {
                    getPath: () => scriptWorkspacePath,
                    writeFile: (filename, content, encoding = 'utf8') => {
                        const safePath = path.resolve(scriptWorkspacePath, filename);
                        if (!safePath.startsWith(scriptWorkspacePath)) throw new Error('File path is outside the allowed workspace.');
                        fs.writeFileSync(safePath, content, encoding);
                    },
                    readFile: (filename, encoding = 'utf8') => {
                        const safePath = path.resolve(scriptWorkspacePath, filename);
                        if (!safePath.startsWith(scriptWorkspacePath)) throw new Error('File path is outside the allowed workspace.');
                        return fs.existsSync(safePath) ? fs.readFileSync(safePath, encoding) : null;
                    }
                },
                api: {
                    fetch: async (url, options = {}) => {
                        try {
                            const parsedUrl = new URL(url);
                            if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('API calls are restricted to http/https protocols.');
                            const response = await fetch(url, options);
                            const responseText = await response.text();
                            return { ok: response.ok, status: response.status, statusText: response.statusText, headers: response.headers.raw(), body: responseText };
                        } catch (err) {
                            return { ok: false, error: err.message };
                        }
                    }
                },
                db: scriptDb ? {
                    execute: (sql, params = []) => {
                        const stmt = scriptDb.prepare(sql);
                        if (stmt.reader) return stmt.all(params);
                        return stmt.run(params);
                    }
                } : null,
                dashboard: {
                    setHTML: (htmlContent) => {
                        if (scriptInfo.id === -1) return;
                        try {
                            // THE FIX: Ensure the parent directory exists before writing the file.
                            fs.mkdirSync(dashboardsDirPath, { recursive: true });

                            const dashboardPath = path.join(dashboardsDirPath, `script_${scriptInfo.id}.html`);
                            fs.writeFileSync(dashboardPath, htmlContent, 'utf-8');
                            db.prepare('UPDATE scripts SET is_dashboard = 1 WHERE id = ?').run(scriptInfo.id);
                        } catch (err) {
                            throw new Error(`Dashboard Error: ${err.message}`);
                        }
                    },
                    setHTMLFromFile: (filename) => {
                        if (scriptInfo.id === -1) return;
                        // THE FIX: Also add it here for consistency.
                        fs.mkdirSync(dashboardsDirPath, { recursive: true });

                        const safePath = path.resolve(scriptWorkspacePath, filename);
                        if (!safePath.startsWith(scriptWorkspacePath)) throw new Error('Dashboard source file is outside workspace.');

                        if (fs.existsSync(safePath)) {
                            const content = fs.readFileSync(safePath, 'utf-8');
                            const dashboardPath = path.join(dashboardsDirPath, `script_${scriptInfo.id}.html`);
                            fs.writeFileSync(dashboardPath, content, 'utf-8');
                            db.prepare('UPDATE scripts SET is_dashboard = 1 WHERE id = ?').run(scriptInfo.id);
                        } else {
                            throw new Error(`Dashboard file not found in workspace: ${filename}`);
                        }
                    }
                }
            };

            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: scriptWorkspacePath });

            mainWindow?.webContents.send('job-update', {
                type: 'progress',
                payload: { currentProfile: index + 1, totalProfiles: profiles.length, profileName: profile.name, message: 'Executing script...' }
            });

            const scriptFunction = new Function('page', 'browser', 'automator', `return (async () => { ${scriptInfo.code} })();`);

            await scriptFunction(page, browser, automatorApi);

            mainWindow?.webContents.send('job-update', {
                type: 'log',
                payload: { source: 'Orchestrator', message: `SUCCESS for profile: "${profile.name}"`, status: 'success' }
            });
        } catch (err) {
            console.error(`Script Runtime Error for profile "${profile.name}":`, err.stack);
            mainWindow?.webContents.send('job-update', {
                type: 'log',
                payload: { source: 'Orchestrator', message: `SCRIPT RUNTIME ERROR on "${profile.name}":\n${err.stack}`, status: 'error' }
            });
        } finally {
            if (browser) await browser.disconnect();
            mainWindow?.webContents.send('job-update', {
                type: 'log',
                payload: { source: 'Orchestrator', message: `Script finished. Disconnected from browser for "${profile.name}".`, status: 'success' }
            });
        }
    }

    if (scriptDb) {
        scriptDb.close();
    }

    mainWindow?.webContents.send('job-update', {
        type: 'end',
        payload: { message: 'Job finished.' }
    });
    return { success: true };
});

ipcMain.handle('get-user-data-path', () => {
    return app.getPath('userData');
});
ipcMain.handle('get-dashboards', () => {
    try {
        // Fetches all scripts that have been flagged as dashboards.
        // Also includes the is_pinned status for the UI.
        const query = 'SELECT id, name, is_pinned FROM scripts WHERE is_dashboard = 1 ORDER BY name';
        return db.prepare(query).all();
    } catch (err) {
        console.error('get-dashboards error:', err.message);
        return [];
    }
});

ipcMain.handle('get-pinned-dashboards', () => {
    try {
        // Specifically fetches dashboards that are pinned for dynamic sidebar creation.
        const query = 'SELECT id, name FROM scripts WHERE is_dashboard = 1 AND is_pinned = 1 ORDER BY name';
        return db.prepare(query).all();
    } catch (err) {
        console.error('get-pinned-dashboards error:', err.message);
        return [];
    }
});

// Note: `set-script-as-dashboard` is an internal function, not directly exposed. It's used by the `run-job` handler.

ipcMain.handle('pin-dashboard', (event, { scriptId, isPinned }) => {
    try {
        // Simple handler to update the pinning status of a script.
        const stmt = db.prepare('UPDATE scripts SET is_pinned = ? WHERE id = ?');
        stmt.run(isPinned ? 1 : 0, scriptId);
        return { success: true };
    } catch (err) {
        console.error('pin-dashboard error:', err.message);
        return { success: false, message: err.message };
    }
});


// Helper to expand the abridged API logic from the snippet above
function expandApiLogic(ipcMainHandle) {
    const originalFunction = ipcMainHandle.toString();
    const dbLogic = `try{const stmt=scriptDb.prepare(sql);if(stmt.reader){return{success:!0,data:stmt.all(params)}}else{const info=stmt.run(params);return{success:!0,data:{changes:info.changes,lastInsertRowid:info.lastInsertRowid}}}}catch(err){return{success:!1,error:err.message}}`;
    const writeFileLogic = `const safePath=path.resolve(scriptWorkspacePath,filename);if(!safePath.startsWith(scriptWorkspacePath))throw new Error('File path is outside the allowed workspace.');fs.writeFileSync(safePath,content,encoding)`;
    const readFileLogic = `const safePath=path.resolve(scriptWorkspacePath,filename);if(!safePath.startsWith(scriptWorkspacePath))throw new Error('File path is outside the allowed workspace.');return fs.existsSync(safePath)?fs.readFileSync(safePath,encoding):null`;
    const apiFetchLogic = `try{const parsedUrl=new URL(url);if(!['http:','https:'].includes(parsedUrl.protocol))throw new Error('API calls are restricted to http and https protocols.');const response=await fetch(url,options);const responseText=await response.text();return{ok:response.ok,status:response.status,statusText:response.statusText,headers:response.headers.raw(),body:responseText}}catch(err){console.error('API call from script failed:',err);return{ok:!1,error:err.message}}`;

    return originalFunction
        .replace('/* DB logic */', dbLogic)
        .replace('/* WriteFile logic */', writeFileLogic)
        .replace('/* ReadFile logic */', readFileLogic)
        .replace('/* API Fetch logic */', apiFetchLogic);
}


// --- APPLICATION WINDOW & LIFECYCLE ---
const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // --- ADD THIS LINE ---
            webviewTag: true
        }
    });

    mainWindow.loadFile('index.html');
    mainWindow.webContents.openDevTools();
};
app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });