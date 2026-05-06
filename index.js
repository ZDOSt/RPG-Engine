import { ENGINE_PROMPT_TEXT, classifyDisposition, normalizeTrackerEntry } from './engines.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../../scripts/extensions.js';
import { addEphemeralStoppingString, flushEphemeralStoppingStrings } from '../../../../scripts/power-user.js';
import { getPresetManager } from '../../../../scripts/preset-manager.js';
import { rotateSecret, SECRET_KEYS, secret_state } from '../../../../scripts/secrets.js';
import { SlashCommandParser } from '../../../../scripts/slash-commands/SlashCommandParser.js';
import {
    formatDebugMessagePrefix,
    formatNarratorPromptContext,
    formatPreFlightDebug,
} from './pre-flight.js';
import { extractSemanticLedger, SEMANTIC_PREFLIGHT_STOP_SENTINEL } from './semantic-extractor.js';
import { buildTrackerSnapshot, runDeterministicEngines, saveTrackerUpdate } from './deterministic-runner.js';

const EXTENSION_NAME = 'Structured Preflight Engines';
const SETTINGS_KEY = 'structuredPreflightEngines';
const SETTINGS_CONTAINER_ID = 'structured_preflight_settings_container';
const ENGINE_PROMPT_KEY = 'structured_preflight_engines';
const NARRATOR_PROMPT_KEY = 'structured_preflight_narrator_context';
const PROFILE_NONE = '<None>';
const TRACKER_DISPLAY_EXTRA_KEY = 'structured_preflight_tracker_display';
const TRACKER_DISPLAY_BLOCK_CLASS = 'structured-preflight-tracker-block';
const TRACKER_DISPLAY_VERSION = 1;
const DEFAULT_SETTINGS = Object.freeze({
    useSeparateSemanticSettings: false,
    semanticConnectionProfile: '',
    semanticPreset: '',
});
const CHAT_COMPLETION_SECRET_KEYS = Object.freeze({
    ai21: SECRET_KEYS.AI21,
    aimlapi: SECRET_KEYS.AIMLAPI,
    azure_openai: SECRET_KEYS.AZURE_OPENAI,
    chutes: SECRET_KEYS.CHUTES,
    claude: SECRET_KEYS.CLAUDE,
    cohere: SECRET_KEYS.COHERE,
    cometapi: SECRET_KEYS.COMETAPI,
    custom: SECRET_KEYS.CUSTOM,
    deepseek: SECRET_KEYS.DEEPSEEK,
    electronhub: SECRET_KEYS.ELECTRONHUB,
    fireworks: SECRET_KEYS.FIREWORKS,
    google: SECRET_KEYS.MAKERSUITE,
    groq: SECRET_KEYS.GROQ,
    mistralai: SECRET_KEYS.MISTRALAI,
    moonshot: SECRET_KEYS.MOONSHOT,
    nanogpt: SECRET_KEYS.NANOGPT,
    openai: SECRET_KEYS.OPENAI,
    openrouter: SECRET_KEYS.OPENROUTER,
    perplexity: SECRET_KEYS.PERPLEXITY,
    pollinations: SECRET_KEYS.POLLINATIONS,
    vertexai: SECRET_KEYS.VERTEXAI,
    xai: SECRET_KEYS.XAI,
    zai: SECRET_KEYS.ZAI,
});
const ENGINE_RUNTIME_SENTINEL = [
    '[STRUCTURED_PREFLIGHT_ENGINE_EXTENSION v0.5 - SEMANTIC PASS ACTIVE]',
    'The full engine source is used by the extension during the silent semantic/deterministic pass.',
    'For this narration pass, use the structured narrator handoff as authoritative mechanics context.',
].join('\n');

const EXTENSION_PROMPT_TYPES = Object.freeze({
    IN_PROMPT: 0,
    IN_CHAT: 1,
});

const EXTENSION_PROMPT_ROLES = Object.freeze({
    SYSTEM: 0,
});

console.info(`[${EXTENSION_NAME}] module import started`);

const state = {
    runningSemanticPass: false,
    bypassPromptReady: false,
    activeRunId: null,
    lastDebugPrefix: '',
    lastDebugKey: null,
    pendingRun: null,
    chatSignature: [],
    subscribed: false,
    pendingGeneration: null,
    progressToast: null,
    pendingRunCleanupTimer: null,
};

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
}

function getSettings() {
    extension_settings[SETTINGS_KEY] = extension_settings[SETTINGS_KEY] || {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[SETTINGS_KEY][key] === undefined) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }
    return extension_settings[SETTINGS_KEY];
}

function saveExtensionSettings() {
    saveSettingsDebounced();
}

function getConnectionProfileNames() {
    return (extension_settings.connectionManager?.profiles || [])
        .map(profile => String(profile?.name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function getConnectionProfileByName(profileName) {
    const wanted = String(profileName || '').trim();
    if (!wanted) return null;
    return (extension_settings.connectionManager?.profiles || [])
        .find(profile => String(profile?.name || '').trim().toLowerCase() === wanted.toLowerCase()) || null;
}

function getActiveConnectionProfileName() {
    const selectedProfile = extension_settings.connectionManager?.selectedProfile;
    const profile = (extension_settings.connectionManager?.profiles || []).find(item => item.id === selectedProfile);
    return profile?.name || PROFILE_NONE;
}

async function readActiveConnectionProfileName() {
    const command = SlashCommandParser.commands?.profile;
    if (command?.callback) {
        try {
            return String(await command.callback({}, '') || PROFILE_NONE);
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] could not read active connection profile through /profile; using settings fallback.`, error);
        }
    }
    return getActiveConnectionProfileName();
}

async function applyConnectionProfileName(profileName) {
    const normalized = String(profileName || PROFILE_NONE);
    const command = SlashCommandParser.commands?.profile;
    if (!command?.callback) {
        throw new Error('Connection profile switching is unavailable because SillyTavern /profile command is not registered.');
    }
    await command.callback({ 'await': 'true', timeout: '10000' }, normalized);
}

function getPresetNames() {
    const manager = getPresetManager();
    if (!manager?.getAllPresets) return [];
    try {
        return manager.getAllPresets()
            .map(name => String(name || '').trim())
            .filter(Boolean);
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not list presets for current API.`, error);
        return [];
    }
}

function getActivePresetName() {
    const manager = getPresetManager();
    if (!manager?.getSelectedPresetName) return '';
    try {
        return String(manager.getSelectedPresetName() || '');
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not read active preset.`, error);
        return '';
    }
}

function applyPresetName(presetName) {
    const wanted = String(presetName || '').trim();
    if (!wanted) return;

    const manager = getPresetManager();
    if (!manager?.getAllPresets || !manager?.findPreset || !manager?.selectPreset) {
        throw new Error(`Preset switching is unavailable for the current API; could not apply "${wanted}".`);
    }

    const exact = manager.getAllPresets()
        .map(name => String(name || ''))
        .find(name => name.toLowerCase().trim() === wanted.toLowerCase());
    if (!exact) {
        throw new Error(`Preset "${wanted}" was not found for the active API after applying the semantic connection profile.`);
    }

    const value = manager.findPreset(exact);
    if (value === undefined || value === null) {
        throw new Error(`Preset "${exact}" exists but could not be selected.`);
    }

    if (manager.getSelectedPresetName?.() !== exact) {
        manager.selectPreset(value);
    }
}

function getSecretKeyForConnectionProfile(profile) {
    const context = getContext();
    const apiMap = context?.CONNECT_API_MAP?.[profile?.api];
    return CHAT_COMPLETION_SECRET_KEYS[apiMap?.source] || null;
}

function getActiveSecretId(secretKey) {
    const secrets = secret_state?.[secretKey];
    if (!Array.isArray(secrets)) return '';
    return secrets.find(secret => secret?.active)?.id || '';
}

async function withConnectionProfileSecret(profile, callback) {
    const secretKey = getSecretKeyForConnectionProfile(profile);
    const targetSecretId = String(profile?.['secret-id'] || '').trim();
    if (!secretKey || !targetSecretId) {
        return await callback();
    }

    const originalSecretId = getActiveSecretId(secretKey);
    const shouldRotate = originalSecretId && originalSecretId !== targetSecretId;

    try {
        if (shouldRotate) {
            console.info(`[${EXTENSION_NAME}] activating semantic profile secret for ${profile.name}.`);
            await rotateSecret(secretKey, targetSecretId);
        }
        return await callback();
    } finally {
        if (shouldRotate) {
            try {
                await rotateSecret(secretKey, originalSecretId);
                console.info(`[${EXTENSION_NAME}] restored roleplay secret after semantic pass.`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] failed to restore roleplay secret after semantic pass.`, error);
                try {
                    globalThis.toastr?.error?.(
                        'Semantic pass finished, but restoring the original API secret failed. Check ST connection settings before continuing.',
                        EXTENSION_NAME,
                        { timeOut: 15000, extendedTimeOut: 15000 },
                    );
                } catch {
                    // Toasts are best-effort only.
                }
            }
        }
    }
}

async function withSemanticGenerationSettings(callback) {
    const settings = getSettings();
    const useSeparateSettings = Boolean(settings.useSeparateSemanticSettings);
    const semanticProfile = String(settings.semanticConnectionProfile || '').trim();
    const semanticPreset = String(settings.semanticPreset || '').trim();

    if (!useSeparateSettings || (!semanticProfile && !semanticPreset)) {
        return await callback();
    }

    if (semanticProfile) {
        const profile = getConnectionProfileByName(semanticProfile);
        if (!profile) {
            throw new Error(`Semantic connection profile "${semanticProfile}" was not found.`);
        }

        console.info(`[${EXTENSION_NAME}] using direct semantic connection profile request: ${profile.name}`);
        if (semanticPreset) {
            console.info(`[${EXTENSION_NAME}] using semantic preset override for direct request: ${semanticPreset}`);
        }

        return await withConnectionProfileSecret(profile, () => callback({
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
            semanticPreset,
        }));
    }

    const originalPreset = getActivePresetName();
    let switched = false;

    try {
        if (semanticPreset) {
            console.info(`[${EXTENSION_NAME}] applying semantic preset: ${semanticPreset}`);
            applyPresetName(semanticPreset);
            switched = true;
        }
        return await callback();
    } finally {
        if (switched) {
            try {
                if (originalPreset) {
                    applyPresetName(originalPreset);
                }
                console.info(`[${EXTENSION_NAME}] restored roleplay preset after semantic pass.`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] failed to restore roleplay preset after semantic pass.`, error);
                try {
                    globalThis.toastr?.error?.(
                        'Semantic pass finished, but restoring the original preset failed. Check ST connection settings before continuing.',
                        EXTENSION_NAME,
                        { timeOut: 15000, extendedTimeOut: 15000 },
                    );
                } catch {
                    // Toasts are best-effort only.
                }
            }
        }
    }
}

function setSelectOptions(select, values, placeholder, selectedValue, missingLabel = 'Missing') {
    if (!select) return;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.append(empty);

    for (const value of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
    }

    if (selectedValue && !values.includes(selectedValue)) {
        const missing = document.createElement('option');
        missing.value = selectedValue;
        missing.textContent = `${missingLabel}: ${selectedValue}`;
        select.append(missing);
    }

    select.value = selectedValue || '';
}

function refreshSettingsControls() {
    const settings = getSettings();
    const enabled = Boolean(settings.useSeparateSemanticSettings);
    const profileSelect = document.getElementById('structured_preflight_semantic_profile');
    const presetSelect = document.getElementById('structured_preflight_semantic_preset');
    const enabledCheckbox = document.getElementById('structured_preflight_use_separate_semantic_settings');

    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    setSelectOptions(
        profileSelect,
        getConnectionProfileNames(),
        'Use current connection profile',
        settings.semanticConnectionProfile,
        'Profile not found',
    );
    setSelectOptions(
        presetSelect,
        getPresetNames(),
        'Use profile/current preset',
        settings.semanticPreset,
        'Preset not found for current API',
    );

    if (profileSelect) profileSelect.disabled = !enabled;
    if (presetSelect) presetSelect.disabled = !enabled;
}

function renderSettingsPanel() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) {
        setTimeout(renderSettingsPanel, 500);
        return;
    }

    document.getElementById(SETTINGS_CONTAINER_ID)?.remove();

    const container = document.createElement('div');
    container.id = SETTINGS_CONTAINER_ID;
    container.className = 'extension_container';
    container.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${EXTENSION_NAME}</b>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_use_separate_semantic_settings" type="checkbox">
                    <span>Use separate semantic connection profile / preset</span>
                </label>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_semantic_profile">Semantic connection profile</label>
                    <select id="structured_preflight_semantic_profile" class="text_pole flex1"></select>
                </div>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_semantic_preset">Semantic preset override</label>
                    <select id="structured_preflight_semantic_preset" class="text_pole flex1"></select>
                </div>
                <div class="flex-container alignitemscenter">
                    <small class="flex1">Leave preset blank to use the selected profile's preset. Settings are restored after the semantic pass.</small>
                    <button id="structured_preflight_refresh_semantic_settings" class="menu_button">Refresh</button>
                </div>
            </div>
        </div>`;
    host.prepend(container);

    const settings = getSettings();
    document.getElementById('structured_preflight_use_separate_semantic_settings')?.addEventListener('change', event => {
        settings.useSeparateSemanticSettings = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_semantic_profile')?.addEventListener('change', event => {
        settings.semanticConnectionProfile = String(event.target?.value || '');
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_semantic_preset')?.addEventListener('change', event => {
        settings.semanticPreset = String(event.target?.value || '');
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_refresh_semantic_settings')?.addEventListener('click', refreshSettingsControls);

    refreshSettingsControls();
}

function injectRuntimeSentinel() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        console.warn(`[${EXTENSION_NAME}] SillyTavern context is not ready; engine prompt was not injected.`);
        return;
    }

    context.setExtensionPrompt(
        ENGINE_PROMPT_KEY,
        ENGINE_RUNTIME_SENTINEL,
        EXTENSION_PROMPT_TYPES.IN_PROMPT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

function clearRuntimePrompts() {
    const context = getContext();
    if (!context?.extensionPrompts) return;

    delete context.extensionPrompts[ENGINE_PROMPT_KEY];
    delete context.extensionPrompts[NARRATOR_PROMPT_KEY];
}

function showProgress(message) {
    try {
        if (globalThis.toastr?.info) {
            return globalThis.toastr.info(message, EXTENSION_NAME, { timeOut: 0, extendedTimeOut: 0 });
        }
    } catch {
        // Progress UI is optional; generation must not depend on it.
    }
    return null;
}

function clearProgress(toast) {
    try {
        if (toast && globalThis.toastr?.clear) {
            globalThis.toastr.clear(toast);
        }
    } catch {
        // Non-fatal.
    }
}

function clearPendingRunCleanupTimer() {
    if (state.pendingRunCleanupTimer) {
        clearTimeout(state.pendingRunCleanupTimer);
        state.pendingRunCleanupTimer = null;
    }
}

function showBlockingError(error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
        if (globalThis.toastr?.error) {
            globalThis.toastr.error(message, `${EXTENSION_NAME}: generation aborted`, { timeOut: 15000, extendedTimeOut: 15000 });
        }
    } catch {
        // Toasts are best-effort only.
    }
    console.error(`[${EXTENSION_NAME}] generation aborted`, error);
}

function getChatId(context = getContext()) {
    return typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : '';
}

function getMessageKey(messageId, context = getContext()) {
    return `${getChatId(context)}:${messageId}`;
}

function getTrackerRoot(context = getContext()) {
    if (!context?.chatMetadata) return null;
    context.chatMetadata.structuredPreflightTracker = context.chatMetadata.structuredPreflightTracker || { npcs: {}, snapshots: {} };
    const root = context.chatMetadata.structuredPreflightTracker;
    root.npcs = root.npcs || {};
    root.snapshots = root.snapshots || {};
    return root;
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isRealName(value) {
    const text = String(value ?? '').trim();
    return Boolean(text && text !== '(none)' && text.toLowerCase() !== 'none');
}

function toRealNameArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => String(item ?? '').trim()).filter(isRealName);
}

function normalizeDisplayTrackerNpcs(npcs) {
    const normalized = {};
    for (const [name, value] of Object.entries(npcs || {})) {
        if (!isRealName(name)) continue;
        normalized[name] = normalizeTrackerEntry({
            ...value,
            persistenceTier: value?.persistenceTier || inferPersistenceTier(name),
        });
    }
    return normalized;
}

function buildDisplayTrackerSnapshot({ messageKey, pendingRun, report }) {
    const resolutionPacket = report?.finalNarrativeHandoff?.resolutionPacket || {};
    const trackerAfter = normalizeDisplayTrackerNpcs({
        ...(pendingRun?.trackerBefore || {}),
        ...(pendingRun?.trackerAfter || {}),
    });
    const rawPresentNpcNames = toRealNameArray(pendingRun?.presentNpcNames || resolutionPacket.NPCInScene);
    const presentNpcNames = applyDisplayPresenceCorrections(rawPresentNpcNames, Object.keys(trackerAfter), pendingRun?.latestUserText);
    const displayNpcs = applyTrackerPresenceMetadata(trackerAfter, presentNpcNames, {
        messageKey,
        latestUserText: pendingRun?.latestUserText,
    });
    return {
        version: TRACKER_DISPLAY_VERSION,
        messageKey,
        type: pendingRun?.type || 'normal',
        savedAt: Date.now(),
        presentNpcNames,
        userCoreStats: pendingRun?.userCoreStats || report?.semanticLedger?.engineContext?.userCoreStats || null,
        npcs: displayNpcs,
    };
}

function applyTrackerPresenceMetadata(npcs, presentNames, { messageKey, latestUserText } = {}) {
    const normalized = normalizeDisplayTrackerNpcs(npcs);
    const presentSet = new Set(toRealNameArray(presentNames).map(name => name.toLowerCase()));
    const explicitAbsentSet = getExplicitlyAbsentTrackerNames(latestUserText, Object.keys(normalized));
    const stamped = {};

    for (const [name, entry] of Object.entries(normalized)) {
        const key = name.toLowerCase();
        const previousPresence = entry.presence || 'Present';
        const isPresent = presentSet.has(key) && !explicitAbsentSet.has(key);
        const isExplicitlyAbsent = explicitAbsentSet.has(key);
        const presence = isPresent ? 'Present' : isExplicitlyAbsent ? 'Absent' : previousPresence;

        stamped[name] = {
            ...entry,
            persistenceTier: entry.persistenceTier || inferPersistenceTier(name),
            lifecycle: entry.lifecycle || 'Active',
            presence,
            lastSeenMessageKey: presence === 'Present' ? messageKey || entry.lastSeenMessageKey || '' : entry.lastSeenMessageKey || '',
            absentSinceMessageKey: presence === 'Absent' && previousPresence !== 'Absent'
                ? messageKey || entry.absentSinceMessageKey || ''
                : entry.absentSinceMessageKey || '',
        };
    }

    return stamped;
}

function buildTrackerUpdateForPersistence(displaySnapshot) {
    return {
        npcs: normalizeDisplayTrackerNpcs(displaySnapshot?.npcs || {}),
    };
}

function applyDisplayPresenceCorrections(presentNames, trackedNames, latestUserText) {
    const explicitlyAbsent = getExplicitlyAbsentTrackerNames(latestUserText, trackedNames);
    if (!explicitlyAbsent.size) return presentNames;
    return presentNames.filter(name => !explicitlyAbsent.has(name.toLowerCase()));
}

function inferPersistenceTier(name) {
    const text = String(name ?? '').trim();
    if (!text) return 'Temporary';
    if (/[#\d]/.test(text)) return 'Temporary';
    if (/\b(?:guard|soldier|bandit|raider|archer|thug|goblin|orc|ogre|cultist|mercenary|villager|patron|civilian|beast|wolf|zombie|skeleton|enemy|attacker|ambusher|scout|sentry|hunter|monster|creature|minion|mob)\b/i.test(text)) {
        return 'Temporary';
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.some(word => /^[A-Z][a-z]+/.test(word))) return 'Recurring';
    if (/^[A-Z][a-z]+$/.test(text)) return 'Recurring';
    return 'Temporary';
}

function getExplicitlyAbsentTrackerNames(text, trackedNames) {
    const source = normalizeSearchText(text);
    const absent = new Set();
    if (!source || !Array.isArray(trackedNames)) return absent;

    for (const name of trackedNames) {
        const normalizedName = normalizeSearchText(name);
        if (!normalizedName || !source.includes(normalizedName)) continue;
        if (hasExplicitAbsenceForName(source, normalizedName)) {
            absent.add(String(name).toLowerCase());
        }
    }

    return absent;
}

function hasExplicitAbsenceForName(text, name) {
    const index = text.indexOf(name);
    if (index < 0) return false;

    const window = text.slice(Math.max(0, index - 180), Math.min(text.length, index + name.length + 240));
    if (/\b(?:no longer|not|not anymore)\s+(?:in\s+)?sight\b/.test(window)) return true;
    if (/\bout of sight\b/.test(window)) return true;
    if (/\bno longer visible\b/.test(window)) return true;
    if (/\b(?:leave|left|leaving|walk|walking|walked|go|going|went|move|moving|moved|head|heading|headed|depart|departing|departed|exit|exiting|exited|turn|turning|turned)\b.{0,160}\b(?:behind|away)\b/.test(window)) return true;
    return /\b(?:behind|away)\b.{0,160}\b(?:leave|left|leaving|walk|walking|walked|go|going|went|move|moving|moved|head|heading|headed|depart|departing|departed|exit|exiting|exited|turn|turning|turned)\b/.test(window);
}

function normalizeSearchText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getMessageSwipeId(message) {
    const fromMessage = Number(message?.swipe_id ?? 0);
    return Number.isFinite(fromMessage) && fromMessage >= 0 ? fromMessage : 0;
}

function ensureSwipeInfoEntry(message, swipeId) {
    if (!Array.isArray(message?.swipe_info)) return null;
    if (!message.swipe_info[swipeId] || typeof message.swipe_info[swipeId] !== 'object') {
        message.swipe_info[swipeId] = {
            send_date: message.send_date,
            gen_started: message.gen_started,
            gen_finished: message.gen_finished,
            extra: {},
        };
    }
    message.swipe_info[swipeId].extra = message.swipe_info[swipeId].extra || {};
    return message.swipe_info[swipeId];
}

function setMessageTrackerDisplaySnapshot(message, snapshot) {
    if (!message || message.is_user || !snapshot) return;
    const swipeId = getMessageSwipeId(message);
    message.extra = message.extra || {};
    message.extra[TRACKER_DISPLAY_EXTRA_KEY] = message.extra[TRACKER_DISPLAY_EXTRA_KEY] || {};
    message.extra[TRACKER_DISPLAY_EXTRA_KEY][swipeId] = clone(snapshot);

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[TRACKER_DISPLAY_EXTRA_KEY] = swipeInfo.extra[TRACKER_DISPLAY_EXTRA_KEY] || {};
        swipeInfo.extra[TRACKER_DISPLAY_EXTRA_KEY][swipeId] = clone(snapshot);
    }
}

function getMessageTrackerDisplaySnapshot(message) {
    if (!message || message.is_user) return null;
    const swipeId = getMessageSwipeId(message);
    return message.extra?.[TRACKER_DISPLAY_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[TRACKER_DISPLAY_EXTRA_KEY]?.[swipeId]
        || null;
}

function getLatestTrackerDisplaySnapshot(context = getContext()) {
    const chat = context?.chat;
    if (!Array.isArray(chat)) return null;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const snapshot = getMessageTrackerDisplaySnapshot(chat[index]);
        if (snapshot?.npcs) return snapshot;
    }
    return null;
}

function restoreTrackerFromLatestDisplaySnapshot(context = getContext()) {
    const root = getTrackerRoot(context);
    const snapshot = getLatestTrackerDisplaySnapshot(context);
    if (!root || !snapshot?.npcs) return false;
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    return true;
}

function restoreTrackerFromMessageDisplaySnapshot(messageId, context = getContext()) {
    const root = getTrackerRoot(context);
    const message = context?.chat?.[messageId];
    const snapshot = getMessageTrackerDisplaySnapshot(message);
    if (!root || !snapshot?.npcs) return false;
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    return true;
}

function formatCoreStats(core) {
    if (!core) return 'PHY - / MND - / CHA -';
    return `PHY ${core.PHY ?? '-'} / MND ${core.MND ?? '-'} / CHA ${core.CHA ?? '-'}`;
}

function formatDisposition(disposition) {
    if (!disposition) return 'B-/F-/H-';
    return `B${disposition.B}/F${disposition.F}/H${disposition.H}`;
}

function buildTrackerDisplayHtml(snapshot) {
    const npcs = normalizeDisplayTrackerNpcs(snapshot?.npcs);
    const names = Object.keys(npcs).sort((a, b) => a.localeCompare(b));
    const present = names.filter(name => npcs[name]?.presence !== 'Absent' && npcs[name]?.lifecycle === 'Active');
    const userCore = snapshot?.userCoreStats;

    const renderNpc = name => {
        const entry = npcs[name];
        const disposition = entry.currentDisposition;
        const classified = disposition ? classifyDisposition(disposition) : { lock: 'None', behavior: 'None' };
        const pressure = Number(entry.hostilePressure || 0);
        const landedPressure = Number(entry.hostileLandedPressure || 0);
        const pressureLine = pressure || landedPressure || entry.dominantLock !== 'None' || entry.pressureMode !== 'none'
            ? `<div class="structured-preflight-tracker-muted">Pressure ${pressure}/${landedPressure} | Mode ${escapeHtml(entry.pressureMode || 'none')} | Dominant ${escapeHtml(entry.dominantLock || 'None')}</div>`
            : '';
        return `
            <div class="structured-preflight-tracker-npc">
                <div class="structured-preflight-tracker-name">${escapeHtml(name)}</div>
                <div><code>${escapeHtml(formatDisposition(disposition))}</code> | Lock <code>${escapeHtml(classified.lock)}</code> | Behavior <code>${escapeHtml(classified.behavior)}</code></div>
                <div>Rapport <code>${escapeHtml(entry.currentRapport)}/5</code> | Encounter Lock <code>${escapeHtml(entry.rapportEncounterLock)}</code> | Gate <code>${escapeHtml(entry.intimacyGate)}</code></div>
                <div>Stats <code>${escapeHtml(formatCoreStats(entry.currentCoreStats))}</code></div>
                ${pressureLine}
            </div>`;
    };

    const renderSection = (title, sectionNames) => `
        <div class="structured-preflight-tracker-section">
            <div class="structured-preflight-tracker-heading">${title}</div>
            ${sectionNames.length ? sectionNames.map(renderNpc).join('') : '<div class="structured-preflight-tracker-empty">None</div>'}
        </div>`;

    return `
        <details class="${TRACKER_DISPLAY_BLOCK_CLASS}">
            <summary>Tracker</summary>
            <div class="structured-preflight-tracker-body">
                <div class="structured-preflight-tracker-title">NPCs</div>
                ${renderSection('Present', present)}
                <div class="structured-preflight-tracker-title">Player</div>
                <div>Stats <code>${escapeHtml(formatCoreStats(userCore))}</code></div>
            </div>
        </details>`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureTrackerDisplayStyles() {
    if (document.getElementById('structured_preflight_tracker_display_styles')) return;
    const style = document.createElement('style');
    style.id = 'structured_preflight_tracker_display_styles';
    style.textContent = `
        .${TRACKER_DISPLAY_BLOCK_CLASS} {
            margin-top: 0.75rem;
            padding: 0.45rem 0.65rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 26%, transparent);
            font-size: 0.88rem;
        }
        .${TRACKER_DISPLAY_BLOCK_CLASS} > summary {
            cursor: pointer;
            font-weight: 600;
            user-select: none;
        }
        .structured-preflight-tracker-body {
            margin-top: 0.55rem;
            display: grid;
            gap: 0.55rem;
        }
        .structured-preflight-tracker-title,
        .structured-preflight-tracker-heading,
        .structured-preflight-tracker-name {
            font-weight: 600;
        }
        .structured-preflight-tracker-section {
            display: grid;
            gap: 0.35rem;
        }
        .structured-preflight-tracker-npc {
            padding-left: 0.45rem;
            border-left: 2px solid var(--SmartThemeQuoteColor, rgba(255,255,255,0.28));
            line-height: 1.45;
        }
        .structured-preflight-tracker-muted,
        .structured-preflight-tracker-empty {
            opacity: 0.78;
        }
    `;
    document.head.append(style);
}

function renderTrackerDisplayBlockForMessage(messageId, snapshot = null, context = getContext()) {
    const message = context?.chat?.[messageId];
    const trackerSnapshot = snapshot || getMessageTrackerDisplaySnapshot(message);
    if (typeof document === 'undefined') return;

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    messageElement.querySelector(`.${TRACKER_DISPLAY_BLOCK_CLASS}`)?.remove();
    if (!trackerSnapshot?.npcs) return;

    ensureTrackerDisplayStyles();
    const textElement = messageElement.querySelector('.mes_text');
    if (!textElement) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildTrackerDisplayHtml(trackerSnapshot).trim();
    const block = wrapper.firstElementChild;
    if (!block) return;

    const mediaWrapper = messageElement.querySelector('.mes_media_wrapper');
    if (mediaWrapper) {
        mediaWrapper.before(block);
    } else {
        textElement.after(block);
    }
}

function renderAllTrackerDisplayBlocks(context = getContext()) {
    if (!Array.isArray(context?.chat)) return;
    context.chat.forEach((message, index) => {
        if (!message?.is_user) {
            renderTrackerDisplayBlockForMessage(index, null, context);
        }
    });
}

function captureChatSignature(context = getContext()) {
    if (!Array.isArray(context?.chat)) return [];
    return context.chat.map(message => [
        message?.is_user ? 'user' : 'assistant',
        String(message?.name ?? ''),
        String(message?.send_date ?? ''),
        String(message?.mes ?? '').slice(0, 80),
    ].join('|'));
}

function getLatestReportPresentNpcNames(report) {
    return toRealNameArray(report?.finalNarrativeHandoff?.resolutionPacket?.NPCInScene);
}

function getLatestUserText(chat) {
    if (!Array.isArray(chat)) return '';
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.role !== 'user') continue;
        if (typeof message.content === 'string') return message.content;
        if (Array.isArray(message.content)) {
            return message.content
                .map(part => typeof part === 'string' ? part : part?.text)
                .filter(Boolean)
                .join('\n');
        }
    }
    return '';
}

function firstChangedIndex(before, after) {
    const max = Math.max(before?.length || 0, after?.length || 0);
    for (let index = 0; index < max; index += 1) {
        if ((before?.[index] ?? null) !== (after?.[index] ?? null)) return index;
    }
    return max;
}

function stripComputedDebugPrefix(text) {
    return stripStructuredArtifacts(text).trimStart();
}

function stripStructuredArtifacts(text) {
    return String(text ?? '')
        .replace(/````text\s*\n?&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*/gi, '')
        .replace(/````text\s*\n?<pre_flight>[\s\S]*?<\/pre_flight>\s*````\s*/gi, '')
        .replace(/````text\s*\n?<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*/gi, '')
        .replace(/&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*/gi, '')
        .replace(/<pre_flight>[\s\S]*?<\/pre_flight>\s*/gi, '')
        .replace(/<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*/gi, '')
        .replace(/BEGIN_FINAL_NARRATION\s*/gi, '')
        .replace(/\s*END_FINAL_NARRATION/gi, '');
}

function sanitizeAssistantNarration(text) {
    const original = String(text ?? '').trim();
    if (!original) return original;

    const tagged = original.match(/BEGIN_FINAL_NARRATION\s*([\s\S]*?)\s*END_FINAL_NARRATION/i);
    const source = tagged ? tagged[1].trim() : stripNarratorMetaPrefix(original);
    const cleaned = stripStructuredArtifacts(source).trim();
    return cleaned || original;
}

function stripNarratorMetaPrefix(text) {
    const source = String(text ?? '').trim();
    if (!source) return source;

    const lengthTarget = source.match(/(?:^|\n)\s*Length target:\s*[^\n]*\n+/i);
    if (lengthTarget && lengthTarget.index < 2500) {
        return source.slice(lengthTarget.index + lengthTarget[0].length).trim();
    }

    const finalWritingCue = source.match(/(?:^|\n)\s*Let me write this[^\n]*\n+/i);
    if (finalWritingCue && finalWritingCue.index < 2500) {
        return source.slice(finalWritingCue.index + finalWritingCue[0].length).trim();
    }

    const prefix = source.slice(0, 2500);
    if (!/\b(preflight|mechanics|NPC State|Proactivity|Chaos|GUIDE|narrator prompt|formatting rules)\b/i.test(prefix)) {
        return source;
    }

    const lines = source.split(/\r?\n/);
    let cut = 0;
    for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
        const line = lines[index].trim();
        if (
            !line
            || /^[-*]\s+/.test(line)
            || /^(The user|User Actions|Result|Action Count|Stakes|Intimacy Consent|Targets|Counter Potential|NPC State|Chaos|Proactivity|Aggression|Aggression Guide|GUIDE)\b/i.test(line)
            || /\b(preflight|mechanics|formatting rules|Length target|should be|Let me)\b/i.test(line)
        ) {
            cut = index + 1;
            continue;
        }
        break;
    }

    return cut > 0 ? lines.slice(cut).join('\n').trim() : source;
}

function sanitizeFinalPromptHistory(chat) {
    if (!Array.isArray(chat)) return;

    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!message) continue;

        if (typeof message.content === 'string') {
            message.content = stripStructuredArtifacts(message.content).trim();
            if (message.role === 'assistant') {
                message.content = stripNarratorMetaPrefix(message.content).trim();
            }
        } else if (Array.isArray(message.content)) {
            message.content = message.content
                .map(part => {
                    if (part && typeof part === 'object' && typeof part.text === 'string') {
                        const text = stripStructuredArtifacts(part.text).trim();
                        return {
                            ...part,
                            text: message.role === 'assistant' ? stripNarratorMetaPrefix(text).trim() : text,
                        };
                    }
                    return part;
                })
                .filter(part => {
                    if (part && typeof part === 'object' && 'text' in part) return Boolean(String(part.text ?? '').trim());
                    return part != null;
                });
        }

        if (isPromptContentEmpty(message.content)) {
            chat.splice(index, 1);
        }
    }
}

function isPromptContentEmpty(content) {
    if (content == null) return true;
    if (typeof content === 'string') return !content.trim();
    if (Array.isArray(content)) return content.length === 0;
    return false;
}

function restoreTrackerForRegeneration(type) {
    if (!['regenerate', 'swipe', 'continue'].includes(String(type))) return;

    const context = getContext();
    const root = getTrackerRoot(context);
    if (!root) return;

    const targetMessageId = Array.isArray(context?.chat) ? context.chat.length - 1 : null;
    const snapshot = targetMessageId == null ? null : root.snapshots?.[getMessageKey(targetMessageId, context)]?.before;
    if (snapshot) {
        root.npcs = normalizeDisplayTrackerNpcs(snapshot);
        root.snapshots[getMessageKey(targetMessageId, context)].restoredForRegeneration = Date.now();
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot before ${type} of message ${targetMessageId}`);
    }

    state.lastDebugKey = null;
    state.lastDebugPrefix = '';
}

async function persistMetadata(context = getContext()) {
    if (typeof context?.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    } else if (typeof context?.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

async function prependComputedDebug(messageId, type) {
    const context = getContext();
    const messageKey = getMessageKey(messageId, context);

    if (!state.lastDebugPrefix || state.lastDebugKey === messageKey || type === 'impersonate') {
        clearRuntimePrompts();
        return;
    }

    const message = context?.chat?.[messageId];
    if (!message || message.is_user) {
        clearRuntimePrompts();
        return;
    }

    clearPendingRunCleanupTimer();

    message.extra = message.extra || {};

    const currentText = String(message.mes ?? '');
    const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
    const visibleText = stripComputedDebugPrefix(displayText ?? currentText);
    const narrationText = sanitizeAssistantNarration(visibleText);

    const root = getTrackerRoot(context);
    if (root && state.pendingRun) {
        const trackerDisplaySnapshot = buildDisplayTrackerSnapshot({
            messageKey,
            pendingRun: state.pendingRun,
        });
        await saveTrackerUpdate(context, buildTrackerUpdateForPersistence(trackerDisplaySnapshot));
        root.snapshots[messageKey] = {
            before: clone(state.pendingRun.trackerBefore),
            after: clone(trackerDisplaySnapshot.npcs),
            display: clone(trackerDisplaySnapshot),
            type: state.pendingRun.type,
            savedAt: Date.now(),
        };
        setMessageTrackerDisplaySnapshot(message, trackerDisplaySnapshot);
        await persistMetadata(context);
        state.pendingRun = null;
    }

    message.mes = narrationText;
    message.extra.display_text = `${state.lastDebugPrefix}\n\n${narrationText}`;
    state.lastDebugKey = messageKey;
    state.lastDebugPrefix = '';

    if (typeof context.updateMessageBlock === 'function') {
        context.updateMessageBlock(messageId, message);
    }
    renderTrackerDisplayBlockForMessage(messageId, null, context);

    if (typeof context.saveChat === 'function') {
        await context.saveChat();
    }

    clearRuntimePrompts();
    state.chatSignature = captureChatSignature(context);
}

async function handleMessageDeleted(newLength) {
    const context = getContext();
    const root = getTrackerRoot(context);
    if (!root) return;

    const currentSignature = captureChatSignature(context);
    const firstAffectedIndex = firstChangedIndex(state.chatSignature, currentSignature);
    const chatLength = Number.isFinite(Number(newLength))
        ? Number(newLength)
        : Array.isArray(context?.chat) ? context.chat.length : 0;
    const chatId = getChatId(context);
    let restoreCandidate = null;

    for (const [key, snapshot] of Object.entries(root.snapshots || {})) {
        const [snapshotChatId, rawMessageId] = key.split(':');
        const messageId = Number(rawMessageId);
        if (snapshotChatId !== chatId) continue;
        if (Number.isFinite(messageId) && messageId >= Math.min(chatLength, firstAffectedIndex)) {
            if (snapshot?.before && (!restoreCandidate || messageId < restoreCandidate.messageId)) {
                restoreCandidate = { messageId, before: snapshot.before };
            }
            delete root.snapshots[key];
        }
    }

    state.lastDebugPrefix = '';
    state.lastDebugKey = null;
    state.chatSignature = currentSignature;
    clearRuntimePrompts();

    if (restoreCandidate) {
        root.npcs = normalizeDisplayTrackerNpcs(restoreCandidate.before);
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot after message deletion from index ${Math.min(chatLength, firstAffectedIndex)}`);
    } else if (restoreTrackerFromLatestDisplaySnapshot(context)) {
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker display snapshot after message deletion.`);
    }
    setTimeout(() => renderAllTrackerDisplayBlocks(context), 0);
}

async function handleMessageSwiped(messageId) {
    const context = getContext();
    const resolvedMessageId = Number.isFinite(Number(messageId)) ? Number(messageId) : null;
    if (resolvedMessageId != null && restoreTrackerFromMessageDisplaySnapshot(resolvedMessageId, context)) {
        await persistMetadata(context);
    } else if (restoreTrackerFromLatestDisplaySnapshot(context)) {
        await persistMetadata(context);
    }
    state.lastDebugKey = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
    setTimeout(() => renderAllTrackerDisplayBlocks(context), 0);
}

function handleChatChanged() {
    clearPendingRunCleanupTimer();
    const context = getContext();
    restoreTrackerFromLatestDisplaySnapshot(context);
    state.lastDebugKey = null;
    state.lastDebugPrefix = '';
    state.pendingRun = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
    setTimeout(() => renderAllTrackerDisplayBlocks(context), 0);
}

function handleGenerationLifecycleEnd() {
    clearProgress(state.progressToast);
    state.progressToast = null;
    state.pendingGeneration = null;
    clearRuntimePrompts();

    if (state.pendingRun && !state.pendingRunCleanupTimer) {
        state.pendingRunCleanupTimer = setTimeout(() => {
            state.pendingRunCleanupTimer = null;
            if (!state.pendingRun) return;
            state.pendingRun = null;
            state.lastDebugPrefix = '';
            state.lastDebugKey = null;
            console.warn(`[${EXTENSION_NAME}] cleared pending pre-flight handoff because no assistant message was received after generation ended.`);
        }, 5000);
    }
    setTimeout(() => renderAllTrackerDisplayBlocks(), 0);
}

function subscribeMessageHandler() {
    if (state.subscribed) return;

    const context = getContext();
    if (!context?.eventSource?.on || !context?.eventTypes?.MESSAGE_RECEIVED) return;

    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, prependComputedDebug);
    if (context.eventTypes.MESSAGE_DELETED) context.eventSource.on(context.eventTypes.MESSAGE_DELETED, handleMessageDeleted);
    if (context.eventTypes.MESSAGE_SWIPED) context.eventSource.on(context.eventTypes.MESSAGE_SWIPED, handleMessageSwiped);
    if (context.eventTypes.CHAT_CHANGED) context.eventSource.on(context.eventTypes.CHAT_CHANGED, handleChatChanged);
    if (context.eventTypes.CHAT_CREATED) context.eventSource.on(context.eventTypes.CHAT_CREATED, handleChatChanged);
    if (context.eventTypes.GENERATION_ENDED) context.eventSource.on(context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
    if (context.eventTypes.GENERATION_STOPPED) context.eventSource.on(context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
    if (context.eventTypes.CHAT_COMPLETION_PROMPT_READY) context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY, handleChatCompletionPromptReady);
    state.subscribed = true;
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    subscribeMessageHandler();

    if (state.runningSemanticPass) {
        const error = new Error('Structured preflight is already running. Generation aborted to avoid sending a narration without a valid audit.');
        showBlockingError(error);
        if (typeof abort === 'function') abort(true);
        return true;
    }

    const context = getContext();
    if (!context) {
        const error = new Error('SillyTavern context unavailable. Generation aborted before narration.');
        showBlockingError(error);
        if (typeof abort === 'function') abort(true);
        return true;
    }

    state.chatSignature = captureChatSignature(context);
    restoreTrackerForRegeneration(type);
    state.pendingGeneration = {
        type: type || 'normal',
        trackerSnapshot: buildTrackerSnapshot(context),
        contextSize,
        createdAt: Date.now(),
    };
    state.activeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.progressToast = showProgress('Computing structured pre-flight...');

    return false;
};

async function handleChatCompletionPromptReady(eventData) {
    if (state.bypassPromptReady || state.runningSemanticPass) return;
    if (!eventData || eventData.dryRun || !Array.isArray(eventData.chat)) return;
    if (!state.pendingGeneration) return;

    const context = getContext();
    if (!context) return;

    try {
        state.runningSemanticPass = true;
        const trackerSnapshot = state.pendingGeneration.trackerSnapshot || buildTrackerSnapshot(context);
        const semanticLedger = await runSemanticPassWithPromptReadyBypass(
            context,
            eventData.chat,
            state.pendingGeneration.type,
            trackerSnapshot,
        );
        const report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, state.pendingGeneration.type);

        const audit = formatPreFlightDebug(report);
        const narratorContext = formatNarratorPromptContext(report);
        state.pendingRun = {
            type: state.pendingGeneration.type || 'normal',
            trackerBefore: trackerSnapshot,
            trackerAfter: report.trackerUpdate?.npcs || {},
            presentNpcNames: getLatestReportPresentNpcNames(report),
            userCoreStats: report.semanticLedger?.engineContext?.userCoreStats || null,
            latestUserText: getLatestUserText(eventData.chat),
        };
        state.lastDebugPrefix = formatDebugMessagePrefix(audit, narratorContext);

        sanitizeFinalPromptHistory(eventData.chat);
        appendEngineSentinelToPrompt(eventData.chat);
        appendNarratorContextToPrompt(eventData.chat, narratorContext);
        clearProgress(state.progressToast);
        state.progressToast = null;
    } catch (error) {
        state.lastDebugPrefix = '';
        state.pendingRun = null;
        clearProgress(state.progressToast);
        state.progressToast = null;
        clearRuntimePrompts();
        showBlockingError(error);
        abortGenerationAfterPromptReady(context);
        replacePromptWithAbortNotice(eventData.chat, error);
    } finally {
        state.runningSemanticPass = false;
        state.activeRunId = null;
        state.pendingGeneration = null;
    }
}

async function runSemanticPassWithPromptReadyBypass(context, assembledChat, type, trackerSnapshot) {
    state.bypassPromptReady = true;
    try {
        addEphemeralStoppingString(SEMANTIC_PREFLIGHT_STOP_SENTINEL);
        return await withSemanticGenerationSettings(settings => extractSemanticLedger(context, assembledChat, type, trackerSnapshot, {
            assembledPrompt: true,
            semanticProfileId: settings?.semanticProfileId,
            semanticProfileName: settings?.semanticProfileName,
            semanticPreset: settings?.semanticPreset,
        }));
    } finally {
        flushEphemeralStoppingStrings();
        state.bypassPromptReady = false;
    }
}

function appendNarratorContextToPrompt(chat, narratorContext) {
    chat.push({
        role: 'system',
        content: narratorContext,
    });
}

function appendEngineSentinelToPrompt(chat) {
    chat.push({
        role: 'system',
        content: ENGINE_RUNTIME_SENTINEL,
    });
}

function replacePromptWithAbortNotice(chat, error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    chat.splice(0, chat.length, {
        role: 'system',
        content:
            '[STRUCTURED_PREFLIGHT_ABORT]\n' +
            'The structured semantic preflight failed. Do not narrate. Return exactly: Structured preflight failed; generation aborted.\n' +
            `ERROR=${message}`,
    });
}

function abortGenerationAfterPromptReady(context) {
    try {
        if (typeof context?.stopGeneration === 'function') {
            context.stopGeneration();
        } else if (context?.eventSource?.emit && context?.eventTypes?.GENERATION_STOPPED) {
            context.eventSource.emit(context.eventTypes.GENERATION_STOPPED);
        }
    } catch {
        // The prompt is also replaced with an abort notice as a fallback.
    }
}

export function onDisable() {
    const context = getContext();
    if (context?.extensionPrompts) {
        delete context.extensionPrompts[ENGINE_PROMPT_KEY];
        delete context.extensionPrompts[NARRATOR_PROMPT_KEY];
    }
    if (state.subscribed && context?.eventSource && context?.eventTypes?.MESSAGE_RECEIVED) {
        removeEventHandler(context, context.eventTypes.MESSAGE_RECEIVED, prependComputedDebug);
        if (context.eventTypes.MESSAGE_DELETED) removeEventHandler(context, context.eventTypes.MESSAGE_DELETED, handleMessageDeleted);
        if (context.eventTypes.MESSAGE_SWIPED) removeEventHandler(context, context.eventTypes.MESSAGE_SWIPED, handleMessageSwiped);
        if (context.eventTypes.CHAT_CHANGED) removeEventHandler(context, context.eventTypes.CHAT_CHANGED, handleChatChanged);
        if (context.eventTypes.CHAT_CREATED) removeEventHandler(context, context.eventTypes.CHAT_CREATED, handleChatChanged);
        if (context.eventTypes.GENERATION_ENDED) removeEventHandler(context, context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
        if (context.eventTypes.GENERATION_STOPPED) removeEventHandler(context, context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
        if (context.eventTypes.CHAT_COMPLETION_PROMPT_READY) removeEventHandler(context, context.eventTypes.CHAT_COMPLETION_PROMPT_READY, handleChatCompletionPromptReady);
        state.subscribed = false;
    }
}

function removeEventHandler(context, eventName, handler) {
    if (typeof context?.eventSource?.off === 'function') {
        context.eventSource.off(eventName, handler);
    } else if (typeof context?.eventSource?.removeListener === 'function') {
        context.eventSource.removeListener(eventName, handler);
    }
}

subscribeMessageHandler();
getSettings();
if (typeof jQuery === 'function') {
    jQuery(() => {
        renderSettingsPanel();
        setTimeout(() => {
            restoreTrackerFromLatestDisplaySnapshot();
            renderAllTrackerDisplayBlocks();
        }, 0);
    });
} else {
    renderSettingsPanel();
    setTimeout(() => {
        restoreTrackerFromLatestDisplaySnapshot();
        renderAllTrackerDisplayBlocks();
    }, 0);
}
clearRuntimePrompts();
console.info(`[${EXTENSION_NAME}] loaded`);
