import { ENGINE_PROMPT_TEXT } from './engines.js';
import {
    formatDebugMessagePrefix,
    formatNarratorPromptContext,
    formatNarratorPromptError,
    formatNarratorPromptPending,
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
    lastDebugPrefix: '',
    lastDebugKey: null,
    subscribed: false,
};

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
}

function injectEngines() {
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

    context.setExtensionPrompt(
        NARRATOR_PROMPT_KEY,
        formatNarratorPromptPending(),
        EXTENSION_PROMPT_TYPES.IN_CHAT,
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

async function prependComputedDebug(messageId, type) {
    const context = getContext();
    const chatId = typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : '';
    const messageKey = `${chatId}:${messageId}`;

    if (!state.lastDebugPrefix || state.lastDebugKey === messageKey) return;
    if (type === 'impersonate') return;

    const message = context?.chat?.[messageId];
    if (!message || message.is_user) return;

    message.extra = message.extra || {};

    const currentText = String(message.mes ?? '');
    const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
    const visibleText = displayText ?? currentText;

    if (visibleText.startsWith('````text\n&lt;pre_flight&gt;') || visibleText.startsWith('<pre_flight>')) {
        state.lastDebugKey = messageKey;
        state.lastDebugPrefix = '';
        return;
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
}

function subscribeMessageHandler() {
    if (state.subscribed) return;

    const context = getContext();
    if (!context?.eventSource?.on || !context?.eventTypes?.MESSAGE_RECEIVED) return;

    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, prependComputedDebug);
    if (context.eventTypes.CHAT_CHANGED) {
        context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
            state.lastDebugKey = null;
        });
    }
    state.subscribed = true;
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    injectEngines();
    subscribeMessageHandler();

    if (state.runningSemanticPass) {
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

    try {
        state.runningSemanticPass = true;
        const trackerSnapshot = buildTrackerSnapshot(context);
        const semanticLedger = await extractSemanticLedger(context, coreChat, type, trackerSnapshot);
        const report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, type);
        await saveTrackerUpdate(context, report.trackerUpdate);
        const audit = formatPreFlightDebug(report);
        const narratorContext = formatNarratorPromptContext(report);
        state.lastDebugPrefix = formatDebugMessagePrefix(audit, narratorContext);
        injectNarratorContext(narratorContext);
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] deterministic pre-flight failed`, error);
        const audit = formatPreFlightError(error);
        const narratorContext = formatNarratorPromptError(error);
        state.lastDebugPrefix = formatDebugMessagePrefix(audit, narratorContext);
        injectNarratorContext(narratorContext);
    } finally {
        state.runningSemanticPass = false;
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
        const eventName = context.eventTypes.MESSAGE_RECEIVED;
        if (typeof context.eventSource.off === 'function') {
            context.eventSource.off(eventName, prependComputedDebug);
        } else if (typeof context.eventSource.removeListener === 'function') {
            context.eventSource.removeListener(eventName, prependComputedDebug);
        }
        state.subscribed = false;
    }
}

injectEngines();
subscribeMessageHandler();
console.info(`[${EXTENSION_NAME}] loaded`);
