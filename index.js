import { ENGINE_PROMPT_TEXT } from './engines.js';

const EXTENSION_NAME = 'Structured Preflight Engines';
const PROMPT_KEY = 'structured_preflight_engines';

const EXTENSION_PROMPT_TYPES = Object.freeze({
    IN_PROMPT: 0,
});

const EXTENSION_PROMPT_ROLES = Object.freeze({
    SYSTEM: 0,
});

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
        PROMPT_KEY,
        ENGINE_PROMPT_TEXT,
        EXTENSION_PROMPT_TYPES.IN_PROMPT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function () {
    injectEngines();
    return false;
};

export function onDisable() {
    const context = getContext();
    if (context?.extensionPrompts) {
        delete context.extensionPrompts[PROMPT_KEY];
    }
}

injectEngines();
