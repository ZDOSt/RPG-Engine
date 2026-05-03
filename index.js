import { ENGINE_PROMPT_TEXT } from './engines.js';
import {
    formatDebugMessagePrefix,
    formatNarratorPromptContext,
    formatNarratorPromptError,
    formatPreFlightDebug,
    formatPreFlightError,
} from './pre-flight.js';
import { extractSemanticLedger } from './semantic-extractor.js';
import { buildTrackerSnapshot, runDeterministicEngines, saveTrackerUpdate } from './deterministic-runner.js';

const EXTENSION_NAME = 'Structured Preflight Engines';
const ENGINE_PROMPT_KEY = 'structured_preflight_engines';
const NARRATOR_PROMPT_KEY = 'structured_preflight_narrator_context';
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
    activeRunId: null,
    lastDebugPrefix: '',
    lastDebugKey: null,
    pendingRun: null,
    chatSignature: [],
    subscribed: false,
};

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
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

function injectNarratorContext(value) {
    const context = getContext();
    if (!context?.setExtensionPrompt) return;

    context.setExtensionPrompt(
        NARRATOR_PROMPT_KEY,
        value,
        EXTENSION_PROMPT_TYPES.IN_CHAT,
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

function captureChatSignature(context = getContext()) {
    if (!Array.isArray(context?.chat)) return [];
    return context.chat.map(message => [
        message?.is_user ? 'user' : 'assistant',
        String(message?.name ?? ''),
        String(message?.send_date ?? ''),
        String(message?.mes ?? '').slice(0, 80),
    ].join('|'));
}

function firstChangedIndex(before, after) {
    const max = Math.max(before?.length || 0, after?.length || 0);
    for (let index = 0; index < max; index += 1) {
        if ((before?.[index] ?? null) !== (after?.[index] ?? null)) return index;
    }
    return max;
}

function stripComputedDebugPrefix(text) {
    return String(text ?? '')
        .replace(/^````text\s*\n&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*\n+/i, '')
        .replace(/^````text\s*\n<pre_flight>[\s\S]*?<\/pre_flight>\s*````\s*\n+/i, '')
        .replace(/^````text\s*\n<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*\n+/i, '');
}

function restoreTrackerForRegeneration(type) {
    if (!['regenerate', 'swipe', 'continue'].includes(String(type))) return;

    const context = getContext();
    const root = getTrackerRoot(context);
    if (!root) return;

    const targetMessageId = Array.isArray(context?.chat) ? context.chat.length - 1 : null;
    const snapshot = targetMessageId == null ? null : root.snapshots?.[getMessageKey(targetMessageId, context)]?.before;
    if (snapshot) {
        root.npcs = clone(snapshot) || {};
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

    message.extra = message.extra || {};

    const currentText = String(message.mes ?? '');
    const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
    const visibleText = stripComputedDebugPrefix(displayText ?? currentText);

    const root = getTrackerRoot(context);
    if (root && state.pendingRun) {
        root.snapshots[messageKey] = {
            before: clone(state.pendingRun.trackerBefore),
            after: clone(state.pendingRun.trackerAfter),
            type: state.pendingRun.type,
            savedAt: Date.now(),
        };
        await persistMetadata(context);
    }

    message.extra.display_text = `${state.lastDebugPrefix}\n\n${visibleText}`;
    state.lastDebugKey = messageKey;
    state.lastDebugPrefix = '';

    if (typeof context.updateMessageBlock === 'function') {
        context.updateMessageBlock(messageId, message);
    }

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
        root.npcs = clone(restoreCandidate.before) || {};
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot after message deletion from index ${Math.min(chatLength, firstAffectedIndex)}`);
    }
}

function handleMessageSwiped() {
    state.lastDebugKey = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
}

function handleChatChanged() {
    state.lastDebugKey = null;
    state.lastDebugPrefix = '';
    state.pendingRun = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
}

function handleGenerationLifecycleEnd() {
    clearRuntimePrompts();
}

function subscribeMessageHandler() {
    if (state.subscribed) return;

    const context = getContext();
    if (!context?.eventSource?.on || !context?.eventTypes?.MESSAGE_RECEIVED) return;

    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, prependComputedDebug);
    if (context.eventTypes.MESSAGE_DELETED) context.eventSource.on(context.eventTypes.MESSAGE_DELETED, handleMessageDeleted);
    if (context.eventTypes.MESSAGE_SWIPED) context.eventSource.on(context.eventTypes.MESSAGE_SWIPED, handleMessageSwiped);
    if (context.eventTypes.CHAT_CHANGED) context.eventSource.on(context.eventTypes.CHAT_CHANGED, handleChatChanged);
    if (context.eventTypes.GENERATION_ENDED) context.eventSource.on(context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
    if (context.eventTypes.GENERATION_STOPPED) context.eventSource.on(context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
    state.subscribed = true;
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    subscribeMessageHandler();

    if (state.runningSemanticPass) {
        console.warn(`[${EXTENSION_NAME}] semantic pass skipped because another run is active`);
        return false;
    }

    const context = getContext();
    if (!context) {
        const audit = formatPreFlightError('SillyTavern context unavailable.');
        const narratorContext = formatNarratorPromptError('SillyTavern context unavailable.');
        state.lastDebugPrefix = formatDebugMessagePrefix(audit, narratorContext);
        injectNarratorContext(narratorContext);
        return false;
    }

    state.chatSignature = captureChatSignature(context);
    restoreTrackerForRegeneration(type);

    let progressToast = null;
    try {
        state.runningSemanticPass = true;
        state.activeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        progressToast = showProgress('Computing structured pre-flight...');
        const trackerSnapshot = buildTrackerSnapshot(context);
        const semanticLedger = await extractSemanticLedger(context, coreChat, type, trackerSnapshot);
        const report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, type);
        await saveTrackerUpdate(context, report.trackerUpdate);
        const audit = formatPreFlightDebug(report);
        const narratorContext = formatNarratorPromptContext(report);
        state.pendingRun = {
            type: type || 'normal',
            trackerBefore: trackerSnapshot,
            trackerAfter: report.trackerUpdate?.npcs || {},
        };
        state.lastDebugPrefix = formatDebugMessagePrefix(audit, narratorContext);
        injectRuntimeSentinel();
        injectNarratorContext(narratorContext);
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] deterministic pre-flight failed`, error);
        const audit = formatPreFlightError(error);
        const narratorContext = formatNarratorPromptError(error);
        state.lastDebugPrefix = formatDebugMessagePrefix(audit, narratorContext);
        injectRuntimeSentinel();
        injectNarratorContext(narratorContext);
    } finally {
        clearProgress(progressToast);
        state.runningSemanticPass = false;
        state.activeRunId = null;
    }

    return false;
};

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
        if (context.eventTypes.GENERATION_ENDED) removeEventHandler(context, context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
        if (context.eventTypes.GENERATION_STOPPED) removeEventHandler(context, context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
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
clearRuntimePrompts();
console.info(`[${EXTENSION_NAME}] loaded`);
