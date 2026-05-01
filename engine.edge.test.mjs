import assert from 'node:assert/strict';
import {
    DEFAULT_RENDER_RULES,
    buildFinalNarrationPayload,
    chaosInterrupt,
    createTracker,
    describeNpcFeeling,
    inferFallbackExtraction,
    mergeExtractionWithFallback,
    markRevealedNames,
    npcAggressionResolution,
    npcProactivityEngine,
    parseCoreStats,
    parseNpcArchiveContent,
    reserveNameCandidates,
    resolveTurn,
    serializeNpcArchiveEntry,
    upsertArchivedNpc,
} from './engine.js';

const stats = { PHY: 4, MND: 6, CHA: 5 };

function withRandomQueue(queue, fn) {
    const original = Math.random;
    Math.random = () => queue.shift() ?? 0;
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

function trackerWithNpc(name, disposition = { B: 2, F: 2, H: 2 }, extra = {}) {
    const tracker = createTracker();
    const id = name.toLowerCase();
    tracker.user.stats = stats;
    tracker.presentNpcIds = [id];
    tracker.npcs[id] = {
        id,
        name,
        present: true,
        disposition,
        rapport: 0,
        rapportEncounterLock: 'N',
        intimacyGate: 'SKIP',
        coreStats: { PHY: 3, MND: 3, CHA: 3 },
        override: 'NONE',
        ...extra,
    };
    return tracker;
}

function extraction(overrides = {}) {
    return {
        ooc: 'N',
        oocMode: 'IC',
        oocInstruction: '',
        goal: 'do a thing',
        goalKind: 'Normal',
        goalEvidence: 'evidence',
        decisiveAction: 'do a thing',
        decisiveActionEvidence: 'evidence',
        outcomeOnSuccess: '',
        outcomeOnFailure: '',
        actionTargets: [],
        oppTargetsNpc: [],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        npcInScene: [],
        hasStakes: 'N',
        stakesEvidence: '',
        actionCount: 1,
        userStat: 'MND',
        userStatEvidence: '',
        oppStat: 'ENV',
        oppStatEvidence: '',
        hostilePhysicalHarm: 'N',
        newEncounter: 'N',
        scene: { location: '', time: '', weather: '' },
        npcFacts: [],
        inventoryDeltas: [],
        ...overrides,
    };
}

// 1. User stats are clamped to the 1-10 range.
assert.deepEqual(parseCoreStats('PHY=12 MND=0 CHA=7'), { PHY: 10, MND: 1, CHA: 7 });

// 2-4. Combat action counting ignores setup and caps at 3.
let fallback = inferFallbackExtraction('I draw my sword, step forward, and slash Seraphina.', '');
assert.equal(fallback.actionCount, 1);
assert.equal(fallback.hostilePhysicalHarm, 'Y');

fallback = inferFallbackExtraction('I slash Seraphina, stab her, kick her, and punch her.', '');
assert.equal(fallback.actionCount, 3);
assert.match(fallback.decisiveAction, /slash/i);
assert.match(fallback.decisiveAction, /stab/i);
assert.match(fallback.decisiveAction, /kick/i);

fallback = inferFallbackExtraction('I feint high, pivot on my heel, and punch Seraphina.', '');
assert.equal(fallback.actionCount, 1);
assert.equal(fallback.userStat, 'PHY');

fallback = inferFallbackExtraction("A new neutral adult human NPC named Rook stands at arm's length. I get up, take a step toward Rook, throw a sideways punch at the side of his face, pivot on my foot into a backhand slap, and finally knee Rook in the stomach.", '');
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.actionCount, 3);
assert.deepEqual(fallback.actionTargets, ['Rook']);
assert.deepEqual(fallback.oppTargetsNpc, ['Rook']);
assert.equal(fallback.userStat, 'PHY');
assert.equal(fallback.oppStat, 'PHY');

fallback = inferFallbackExtraction("A neutral adult human NPC named Doran stands at arm's length. I step toward Doran, throw a sideways punch at Doran's face, pivot into a backhand slap, and finally knee Doran in the stomach.", '');
assert.equal(fallback.actionCount, 3);
assert.deepEqual(fallback.actionTargets, ['Doran']);
assert.deepEqual(fallback.oppTargetsNpc, ['Doran']);

fallback = inferFallbackExtraction('A close and trusting girlfriend NPC named Lyra sits beside me near the hearth with currentCoreStats PHY 3 / MND 3 / CHA 4, currentDisposition B4/F1/H1, currentRapport 4, and intimacyGate ALLOW. I sit quietly with Lyra and watch the fire without trying to do anything.', '');
assert.equal(fallback.hasStakes, 'N');
assert.deepEqual(fallback.npcInScene, ['Lyra']);
assert.equal(fallback.npcFacts[0].explicitPreset, 'romanticOpen');
assert.deepEqual(fallback.npcFacts[0].explicitStats, { PHY: 3, MND: 3, CHA: 4 });

fallback = inferFallbackExtraction('A new neutral adult human NPC named Vessa sits at a small table with currentCoreStats PHY 3 / MND 4 / CHA 3 and currentDisposition B2/F2/H2. A silver coin lies beside her hand. I point behind Vessa and say, "Look over there!" trying to distract her while I reach for the coin.', '');
assert.equal(fallback.goal, 'take the coin');
assert.equal(fallback.decisiveAction, 'distract Vessa');
assert.equal(fallback.hasStakes, 'Y');
assert.deepEqual(fallback.actionTargets, ['Vessa']);
assert.deepEqual(fallback.oppTargetsNpc, ['Vessa']);
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'MND');

fallback = inferFallbackExtraction('A neutral adult human NPC named Nera stands beside a small table with currentCoreStats PHY 3 / MND 5 / CHA 3 and currentDisposition B2/F2/H2. A silver coin lies beside her hand. I point past Nera and say, "Look over there!" trying to distract her while I reach for the coin.', '');
assert.equal(fallback.goal, 'take the coin');
assert.equal(fallback.decisiveAction, 'distract Nera');
assert.deepEqual(fallback.oppTargetsNpc, ['Nera']);
assert.equal(fallback.oppStat, 'MND');

// 5-6. Non-injury physical coercion is still contested and worsens relationship.
fallback = inferFallbackExtraction('I grab Seraphina by the wrist.', '');
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.hostilePhysicalHarm, 'N');
assert.equal(fallback.userStat, 'PHY');
assert.equal(fallback.oppStat, 'PHY');
let result = resolveTurn(fallback, trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.npcHandoffs[0].Target, 'Hostility');
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F2/H3');

fallback = inferFallbackExtraction('I throw wine at Seraphina.', '');
assert.deepEqual(fallback.actionTargets, ['Seraphina']);
assert.equal(fallback.hasStakes, 'Y');
result = resolveTurn(fallback, trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.npcHandoffs[0].Target, 'Hostility');

// 7. Sexualized physical boundary violation routes through the intimacy gate.
fallback = inferFallbackExtraction("I lift Seraphina's skirt.", '');
assert.equal(fallback.goalKind, 'IntimacyAdvancePhysical');
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'MND');
result = resolveTurn(fallback, trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.packet.IntimacyConsent, 'N');
assert.equal(result.npcHandoffs[0].Target, 'FearHostility');
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F3/H3');

// 8-11. Stakes and stat mapping for social actions stay separated.
fallback = inferFallbackExtraction('I ask Seraphina for the time.', '');
assert.equal(fallback.hasStakes, 'N');
assert.deepEqual(fallback.oppTargetsNpc, []);

fallback = inferFallbackExtraction('I ask Seraphina for her private diary key.', '');
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'CHA');

fallback = inferFallbackExtraction('I deceive Seraphina about the guard leaving.', '');
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'MND');

fallback = inferFallbackExtraction('I persuade Seraphina honestly to join me.', '');
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'CHA');

// 12-15. Living opposition never becomes ENV; environmental opposition remains ENV.
fallback = inferFallbackExtraction('I sneak past the guard without being noticed.', '');
assert.deepEqual(fallback.oppTargetsNpc, ['guard']);
assert.equal(fallback.userStat, 'PHY');
assert.equal(fallback.oppStat, 'MND');

fallback = inferFallbackExtraction('I pickpocket from the merchant.', '');
assert.deepEqual(fallback.oppTargetsNpc, ['merchant']);
assert.equal(fallback.userStat, 'PHY');
assert.equal(fallback.oppStat, 'MND');

fallback = inferFallbackExtraction('I inspect the runes on the wall.', '');
assert.deepEqual(fallback.oppTargetsEnv, ['runes']);
assert.equal(fallback.userStat, 'MND');
assert.equal(fallback.oppStat, 'ENV');

result = resolveTurn(extraction({
    goal: 'distract Seraphina',
    decisiveAction: 'distract Seraphina',
    actionTargets: ['Seraphina'],
    oppTargetsNpc: ['Seraphina'],
    npcInScene: ['Seraphina'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'ENV',
}), trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.packet.stats.USER, 'CHA');
assert.equal(result.packet.stats.OPP, 'MND');

result = resolveTurn(extraction({
    goal: 'kiss Seraphina',
    goalKind: 'IntimacyAdvancePhysical',
    decisiveAction: 'point sharply at the far door and say "Look there"',
    actionTargets: ['Seraphina'],
    oppTargetsNpc: ['Seraphina'],
    npcInScene: ['Seraphina'],
    hasStakes: 'Y',
    userStat: 'CHA',
    oppStat: 'CHA',
}), trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.packet.stats.USER, 'CHA');
assert.equal(result.packet.stats.OPP, 'MND');

// 16-21. Relationship initialization, locks, rapport, and remediation.
result = resolveTurn(extraction({
    goal: 'greet Seraphina',
    decisiveAction: 'greet Seraphina',
    actionTargets: ['Seraphina'],
    npcInScene: ['Seraphina'],
    npcFacts: [{ name: 'Seraphina', position: '', condition: '', knowsUser: '', explicitPreset: 'userNonHuman', rank: 'unknown', mainStat: 'unknown', override: 'NONE' }],
}), createTracker(), { userStats: stats });
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F3/H2');
assert.equal(result.npcHandoffs[0].IntimacyGate, 'DENY');

result = resolveTurn(extraction({
    goal: 'greet Seraphina',
    decisiveAction: 'greet Seraphina',
    actionTargets: ['Seraphina'],
    npcInScene: ['Seraphina'],
    npcFacts: [{ name: 'Seraphina', position: '', condition: '', knowsUser: '', explicitPreset: 'romanticOpen', rank: 'unknown', mainStat: 'unknown', override: 'NONE' }],
}), createTracker(), { userStats: stats });
assert.equal(result.npcHandoffs[0].FinalState, 'B4/F1/H1');
assert.equal(result.npcHandoffs[0].IntimacyGate, 'ALLOW');

let rapportTracker = trackerWithNpc('Seraphina');
result = resolveTurn(extraction({ goal: 'greet Seraphina', decisiveAction: 'greet Seraphina', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'] }), rapportTracker, { userStats: stats });
assert.equal(result.tracker.npcs.seraphina.rapport, 1);
result = resolveTurn(extraction({ goal: 'greet Seraphina again', decisiveAction: 'greet Seraphina again', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'] }), result.tracker, { userStats: stats });
assert.equal(result.tracker.npcs.seraphina.rapport, 1);
result = resolveTurn(extraction({ goal: 'greet Seraphina tomorrow', decisiveAction: 'greet Seraphina tomorrow', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'], newEncounter: 'Y' }), result.tracker, { userStats: stats });
assert.equal(result.tracker.npcs.seraphina.rapport, 2);

result = resolveTurn(extraction({ goal: 'speak gently', decisiveAction: 'speak gently', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'] }), trackerWithNpc('Seraphina', { B: 2, F: 3, H: 1 }, { rapport: 5 }), { userStats: stats });
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F2/H1');

result = resolveTurn(extraction({ goal: 'speak gently', decisiveAction: 'speak gently', actionTargets: ['Seraphina'], npcInScene: ['Seraphina'] }), trackerWithNpc('Seraphina', { B: 1, F: 1, H: 4 }, { rapport: 5 }), { userStats: stats });
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F1/H3');
assert.equal(result.tracker.npcs.seraphina.rapport, 0);

// 22-24. Benefited/harmed observers update only when stakes actually move.
result = withRandomQueue([0.99, 0], () => resolveTurn(extraction({
    goal: 'free Mira',
    decisiveAction: 'break the cage lock',
    oppTargetsEnv: ['cage lock'],
    benefitedObservers: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'ENV',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.OutcomeTier, 'Success');
assert.equal(result.npcHandoffs[0].Target, 'Bond');

result = withRandomQueue([0, 0.99], () => resolveTurn(extraction({
    goal: 'free Mira',
    decisiveAction: 'break the cage lock',
    oppTargetsEnv: ['cage lock'],
    benefitedObservers: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'ENV',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.OutcomeTier, 'Failure');
assert.equal(result.npcHandoffs[0].Target, 'No Change');

result = resolveTurn(extraction({
    goal: 'ruin Mira reputation',
    decisiveAction: 'frame Mira',
    harmedObservers: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'CHA',
    oppStat: 'ENV',
}), trackerWithNpc('Mira'), { userStats: stats });
assert.equal(result.npcHandoffs[0].Target, 'Hostility');

// 25-27. Chaos consumes five dice and reports band/magnitude/vector correctly.
let rolls = [];
let chaos = withRandomQueue([0, 0.5, 0.5, 0.5, 0.5], () => chaosInterrupt({ GOAL: 'wait', ActionTargets: [] }, [], 'quiet room', rolls));
assert.equal(rolls.length, 5);
assert.equal(chaos.CHAOS.triggered, false);

rolls = [];
chaos = withRandomQueue([0.99, 0, 0.5, 0.2, 0.05], () => chaosInterrupt({ GOAL: 'argue', ActionTargets: ['Mira'] }, [{ NPC: 'Mira' }, { NPC: 'Seraphina' }], 'busy tavern', rolls));
assert.equal(chaos.CHAOS.triggered, true);
assert.equal(chaos.CHAOS.band, 'HOSTILE');
assert.equal(chaos.CHAOS.magnitude, 'EXTREME');
assert.equal(chaos.CHAOS.vector, 'AUTHORITY');
assert.equal(chaos.CHAOS.personVector, true);

rolls = [];
chaos = withRandomQueue([0.84, 0.9, 0.84, 0.2, 0.05], () => chaosInterrupt({ GOAL: 'camp', ActionTargets: [] }, [], 'isolated cave', rolls));
assert.equal(chaos.CHAOS.triggered, true);
assert.equal(chaos.CHAOS.ctx, 'ISOLATED');
assert.equal(chaos.CHAOS.vector, 'ENTITY');

// 28-34. Proactivity: neutral, friend, lover, fear, hatred, chaos, cap/sort.
let proactivity = withRandomQueue([0.69], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F2/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' }],
    { GOAL: 'idle', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira'),
    [],
));
assert.equal(proactivity.Mira.Proactive, 'N');
assert.equal(proactivity.Mira.ProactivityTier, 'DORMANT');
assert.equal(proactivity.Mira.Threshold, 16);

proactivity = withRandomQueue([0.99], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F2/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' }],
    { GOAL: 'ask Mira for directions', LandedActions: '(none)', ActionTargets: ['Mira'], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira'),
    [],
));
assert.equal(proactivity.Mira.Proactive, 'Y');
assert.notEqual(proactivity.Mira.Intent, 'THREAT_OR_POSTURE');

proactivity = withRandomQueue([0.74], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B3/F1/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' }],
    { GOAL: 'idle', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 3, F: 1, H: 2 }),
    [],
));
assert.equal(proactivity.Mira.Proactive, 'Y');
assert.equal(proactivity.Mira.Intent, 'PLAN_OR_BANTER');

proactivity = withRandomQueue([0.74], () => npcProactivityEngine(
    [{ NPC: 'Seraphina', FinalState: 'B4/F1/H1', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'ALLOW' }],
    { GOAL: 'walk', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Seraphina', { B: 4, F: 1, H: 1 }, { intimacyGate: 'ALLOW' }),
    [],
));
assert.equal(proactivity.Seraphina.Proactive, 'Y');
assert.equal(proactivity.Seraphina.Intent, 'INTIMACY_OR_FLIRT');

proactivity = withRandomQueue([0.49], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B1/F4/H2', Lock: 'TERROR', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'DENY' }],
    { GOAL: 'idle', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 1, F: 4, H: 2 }),
    [],
));
assert.equal(proactivity.Mira.Proactive, 'Y');
assert.equal(proactivity.Mira.Intent, 'CALL_HELP_OR_AUTHORITY');

proactivity = withRandomQueue([0.49], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B1/F2/H4', Lock: 'HATRED', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'DENY' }],
    { GOAL: 'idle', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 1, F: 2, H: 4 }),
    [],
));
assert.equal(proactivity.Mira.Proactive, 'Y');
assert.equal(proactivity.Mira.Intent, 'ESCALATE_VIOLENCE');

proactivity = withRandomQueue([0.64], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F2/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' }],
    { GOAL: 'idle', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: true, band: 'COMPLICATION' } },
    trackerWithNpc('Mira'),
    [],
));
assert.equal(proactivity.Mira.Proactive, 'Y');
assert.equal(proactivity.Mira.ProactivityTier, 'LOW');

proactivity = withRandomQueue([0.99, 0.94, 0.89], () => npcProactivityEngine(
    [
        { NPC: 'Ari', FinalState: 'B3/F1/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' },
        { NPC: 'Bryn', FinalState: 'B3/F1/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' },
        { NPC: 'Cyra', FinalState: 'B3/F1/H2', Lock: 'None', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' },
    ],
    { GOAL: 'idle', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: true, band: 'BENEFICIAL', magnitude: 'MAJOR' } },
    createTracker(),
    [],
));
assert.equal(proactivity.Ari.Proactive, 'Y');
assert.equal(proactivity.Bryn.Proactive, 'Y');
assert.equal(proactivity.Cyra.Proactive, 'N');

// 35-37. Aggression resolution uses 1d20 + stat and only for physical aggression intents.
let aggression = withRandomQueue([0.25, 0.2], () => npcAggressionResolution({
    Mira: { Proactive: 'Y', Intent: 'ESCALATE_VIOLENCE', TargetsUser: 'Y' },
}, trackerWithNpc('Mira', { B: 1, F: 2, H: 4 }, { coreStats: { PHY: 4, MND: 3, CHA: 2 } }), []));
assert.equal(aggression.Mira.ReactionOutcome, 'npc_succeeds');
assert.equal(aggression.Mira.Margin, 1);

aggression = withRandomQueue([0, 0.99], () => npcAggressionResolution({
    Mira: { Proactive: 'Y', Intent: 'BOUNDARY_PHYSICAL', TargetsUser: 'Y' },
}, trackerWithNpc('Mira', { B: 2, F: 3, H: 3 }, { coreStats: { PHY: 2, MND: 3, CHA: 2 } }), []));
assert.equal(aggression.Mira.ReactionOutcome, 'user_dominates');

aggression = npcAggressionResolution({
    Mira: { Proactive: 'Y', Intent: 'THREAT_OR_POSTURE', TargetsUser: 'Y' },
}, trackerWithNpc('Mira'), []);
assert.deepEqual(aggression, {});

// 38-40. Full pipeline: ambient present NPC, forced counter, inventory use.
result = withRandomQueue([0, 0, 0, 0, 0, 0.74], () => resolveTurn(extraction({
    goal: 'sort backpack',
    decisiveAction: 'sort backpack',
    hasStakes: 'N',
}), trackerWithNpc('Mira', { B: 3, F: 1, H: 2 }), { userStats: stats }));
assert.equal(result.npcHandoffs.length, 0);
assert.equal(result.proactivityHandoff.Mira.Proactive, 'Y');
assert.equal(result.proactivityHandoff.Mira.Intent, 'PLAN_OR_BANTER');

result = withRandomQueue([0, 0.99, 0, 0, 0, 0, 0], () => resolveTurn(extraction({
    goal: 'punch Mira',
    decisiveAction: 'punch Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira', { B: 1, F: 2, H: 4 }), { userStats: stats }));
assert.equal(result.packet.CounterPotential, 'severe');
assert.equal(result.proactivityHandoff.Mira.ProactivityTier, 'FORCED');
assert.equal(result.proactivityHandoff.Mira.Proactive, 'Y');

const inventoryTracker = createTracker();
inventoryTracker.inventory = ['torch'];
result = resolveTurn(extraction({
    goal: 'use torch',
    decisiveAction: 'use torch',
    inventoryDeltas: [{ action: 'use', item: 'torch', evidence: 'I use the torch' }],
}), inventoryTracker, { userStats: stats });
assert.deepEqual(result.tracker.inventory, []);

// 41-45. OOC/proxy and locked-intimacy edge behavior.
fallback = inferFallbackExtraction('((What does B3 mean?))', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.oocMode, 'STOP');
result = resolveTurn(fallback, trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.packet.STAKES, 'N');
assert.equal(result.npcHandoffs.length, 0);
assert.equal(result.chaosHandoff.CHAOS.triggered, false);
assert.deepEqual(result.proactivityHandoff, {});

fallback = inferFallbackExtraction('(((Have my character slap Seraphina twice.)))', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.oocMode, 'PROXY');
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.actionCount, 2);
assert.deepEqual(fallback.actionTargets, ['Seraphina']);

result = resolveTurn(
    inferFallbackExtraction('I kiss Seraphina.', '', trackerWithNpc('Seraphina', { B: 4, F: 3, H: 1 })),
    trackerWithNpc('Seraphina', { B: 4, F: 3, H: 1 }, { intimacyGate: 'DENY' }),
    { userStats: stats },
);
assert.equal(result.packet.IntimacyConsent, 'N');
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F3/H1');
assert.equal(result.npcHandoffs[0].Target, 'No Change');
assert.equal(result.npcHandoffs[0].IntimacyGate, 'DENY');

result = resolveTurn(
    inferFallbackExtraction('I tell Seraphina she looks beautiful.', '', trackerWithNpc('Seraphina')),
    trackerWithNpc('Seraphina'),
    { userStats: stats },
);
assert.equal(result.packet.STAKES, 'N');
assert.equal(result.npcHandoffs[0].Target, 'No Change');

fallback = inferFallbackExtraction('I ask Seraphina for directions to the market.', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.hasStakes, 'N');
assert.deepEqual(fallback.oppTargetsNpc, []);

// 46-75. Deeper stress cases: exact margins, gates, generated stats, chaos bands, and NPC initiative.
assert.equal(parseCoreStats('PHY 3 MND 4'), null);

fallback = inferFallbackExtraction('I get up, and take a step towards her... then throw a sideways punch at the side of Seraphina\'s face. Using the momentum of my swing, I pivot on my foot, bringing my other hand around in a backhand slap. Finally, I knee her in the stomach.', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.actionCount, 3);
assert.equal(fallback.hostilePhysicalHarm, 'Y');

fallback = inferFallbackExtraction('I distract Seraphina, then kiss her if she looks away.', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.goalKind, 'IntimacyAdvancePhysical');
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'MND');

fallback = inferFallbackExtraction('I point toward the far corner and say, "Look over there!" trying to distract Seraphina, then I kiss her if she looks away.', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.goalKind, 'IntimacyAdvancePhysical');
assert.equal(fallback.userStat, 'CHA');
assert.equal(fallback.oppStat, 'MND');

result = withRandomQueue([0.1, 0.2], () => resolveTurn(extraction({
    goal: 'convince Mira',
    decisiveAction: 'convince Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'CHA',
    oppStat: 'CHA',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, 0);
assert.equal(result.packet.OutcomeTier, 'Stalemate');
assert.equal(result.packet.Outcome, 'stalemate');

result = withRandomQueue([0.99, 0.4], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'slash Mira and stab Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    actionCount: 2,
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.OutcomeTier, 'Critical_Success');
assert.equal(result.packet.LandedActions, 2);

result = withRandomQueue([0.65, 0.45], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'slash Mira, stab Mira, kick Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    actionCount: 3,
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, 5);
assert.equal(result.packet.OutcomeTier, 'Moderate_Success');
assert.equal(result.packet.LandedActions, 2);

result = withRandomQueue([0.45, 0.45], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'punch Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, 1);
assert.equal(result.packet.OutcomeTier, 'Minor_Success');
assert.equal(result.packet.LandedActions, 1);

result = withRandomQueue([0.4, 0.45], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'punch Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, 0);
assert.equal(result.packet.OutcomeTier, 'Stalemate');
assert.equal(result.packet.Outcome, 'stalemate');
assert.equal(result.packet.LandedActions, 0);
assert.equal(result.packet.CounterPotential, 'none');

result = withRandomQueue([0.25, 0.45], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'punch Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, -3);
assert.equal(result.packet.OutcomeTier, 'Minor_Failure');
assert.equal(result.packet.CounterPotential, 'light');
assert.equal(result.npcHandoffs[0].Target, 'Hostility');

result = withRandomQueue([0.05, 0.45], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'punch Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, -7);
assert.equal(result.packet.OutcomeTier, 'Moderate_Failure');
assert.equal(result.packet.CounterPotential, 'medium');

result = withRandomQueue([0, 0.45], () => resolveTurn(extraction({
    goal: 'attack Mira',
    decisiveAction: 'punch Mira',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'PHY',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.roll.margin, -8);
assert.equal(result.packet.OutcomeTier, 'Critical_Failure');
assert.equal(result.packet.CounterPotential, 'severe');

result = resolveTurn(
    inferFallbackExtraction('I kiss Seraphina.', '', trackerWithNpc('Seraphina', { B: 4, F: 1, H: 1 })),
    trackerWithNpc('Seraphina', { B: 4, F: 1, H: 1 }),
    { userStats: stats },
);
assert.equal(result.packet.IntimacyConsent, 'Y');
assert.equal(result.packet.STAKES, 'N');
assert.equal(result.npcHandoffs[0].IntimacyGate, 'ALLOW');

result = resolveTurn(
    inferFallbackExtraction('I kiss Seraphina.', '', trackerWithNpc('Seraphina', { B: 2, F: 2, H: 2 }, { intimacyGate: 'ALLOW' })),
    trackerWithNpc('Seraphina', { B: 2, F: 2, H: 2 }, { intimacyGate: 'ALLOW' }),
    { userStats: stats },
);
assert.equal(result.packet.IntimacyConsent, 'Y');
assert.equal(result.packet.STAKES, 'N');

fallback = inferFallbackExtraction('I ask Seraphina to show me her panties.', '', trackerWithNpc('Seraphina'));
assert.equal(fallback.goalKind, 'IntimacyAdvanceVerbal');
result = resolveTurn(fallback, trackerWithNpc('Seraphina'), { userStats: stats });
assert.equal(result.npcHandoffs[0].Target, 'Hostility');
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F2/H3');

result = resolveTurn(
    inferFallbackExtraction('I intimidate Seraphina into stepping aside.', '', trackerWithNpc('Seraphina')),
    trackerWithNpc('Seraphina'),
    { userStats: stats },
);
assert.equal(result.npcHandoffs[0].Target, 'Fear');
assert.equal(result.npcHandoffs[0].FinalState, 'B2/F3/H2');

result = withRandomQueue([0.99, 0], () => resolveTurn(extraction({
    goal: 'hurt Mira by destroying her work',
    decisiveAction: 'smash the statue beside Mira',
    harmedObservers: ['Mira'],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    userStat: 'PHY',
    oppStat: 'ENV',
    hostilePhysicalHarm: 'Y',
}), trackerWithNpc('Mira'), { userStats: stats }));
assert.equal(result.packet.Outcome, 'dominant_impact');
assert.equal(result.npcHandoffs[0].Target, 'FearHostility');

result = resolveTurn(extraction({
    goal: 'meet the archmage',
    decisiveAction: 'speak',
    actionTargets: ['Elandra'],
    npcInScene: ['Elandra'],
    npcFacts: [{ name: 'Elandra', position: '', condition: '', knowsUser: '', explicitPreset: 'neutralDefault', rank: 'Boss', mainStat: 'CHA', override: 'NONE' }],
}), createTracker(), { userStats: stats });
assert.deepEqual(result.tracker.npcs.elandra.coreStats, { PHY: 8, MND: 8, CHA: 10 });

result = resolveTurn(extraction({
    goal: 'meet the duelist',
    decisiveAction: 'speak',
    actionTargets: ['Voss'],
    npcInScene: ['Voss'],
    npcFacts: [{ name: 'Voss', position: '', condition: '', knowsUser: '', explicitPreset: 'neutralDefault', rank: 'Elite', mainStat: 'PHY', override: 'NONE', explicitStats: { PHY: 12, MND: 0, CHA: 7 } }],
}), createTracker(), { userStats: stats });
assert.deepEqual(result.tracker.npcs.voss.coreStats, { PHY: 10, MND: 1, CHA: 7 });

const lootTracker = createTracker();
lootTracker.inventory = ['Torch'];
result = resolveTurn(extraction({
    goal: 'loot',
    decisiveAction: 'pick up torch and rope',
    inventoryDeltas: [
        { action: 'gain', item: 'torch', evidence: 'pick up torch' },
        { action: 'gain', item: 'rope', evidence: 'pick up rope' },
    ],
}), lootTracker, { userStats: stats });
assert.deepEqual(result.tracker.inventory, ['Torch', 'rope']);
result = resolveTurn(extraction({
    goal: 'drop',
    decisiveAction: 'drop torch',
    inventoryDeltas: [{ action: 'lose', item: 'torch', evidence: 'drop torch' }],
}), result.tracker, { userStats: stats });
assert.deepEqual(result.tracker.inventory, ['rope']);

result = resolveTurn(extraction({
    goal: 'set scene',
    decisiveAction: 'arrive',
    scene: { location: 'North Road', time: 'Dawn', weather: 'Rain' },
}), createTracker(), { userStats: stats });
assert.deepEqual(result.tracker.scene, { location: 'North Road', time: 'Dawn', weather: 'Rain' });

rolls = [];
chaos = withRandomQueue([0.84, 0.65, 0.5, 0, 0.99], () => chaosInterrupt({ GOAL: 'walk', ActionTargets: [] }, [{ NPC: 'Mira' }], 'open street', rolls));
assert.equal(chaos.CHAOS.ctx, 'PUBLIC');
assert.equal(chaos.CHAOS.band, 'COMPLICATION');
assert.equal(chaos.CHAOS.magnitude, 'MINOR');
assert.equal(chaos.CHAOS.anchor, 'ENVIRONMENT');
assert.equal(chaos.CHAOS.vector, 'NPC');

chaos = withRandomQueue([0.84, 0.8, 0.5, 0.75, 0.6], () => chaosInterrupt({ GOAL: 'walk', ActionTargets: [] }, [], 'quiet room', []));
assert.equal(chaos.CHAOS.band, 'BENEFICIAL');
assert.equal(chaos.CHAOS.magnitude, 'MODERATE');
assert.equal(chaos.CHAOS.anchor, 'ENVIRONMENT');
assert.equal(chaos.CHAOS.vector, 'SYSTEM');

proactivity = withRandomQueue([0.49], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B3/F1/H1', Lock: 'None', Target: 'Bond', NPC_STAKES: 'Y', Override: 'NONE', Landed: 'N', IntimacyGate: 'SKIP' }],
    { GOAL: 'climb wall', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: ['wall'] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 3, F: 1, H: 1 }),
    [],
));
assert.equal(proactivity.Mira.ProactivityTier, 'HIGH');
assert.equal(proactivity.Mira.Intent, 'SUPPORT_ACT');

proactivity = withRandomQueue([0.49], () => npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F2/H3', Lock: 'FREEZE', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'DENY' }],
    { GOAL: 'insult Mira', LandedActions: '(none)', ActionTargets: ['Mira'], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 2, F: 2, H: 3 }),
    [],
));
assert.equal(proactivity.Mira.Intent, 'THREAT_OR_POSTURE');
assert.equal(proactivity.Mira.TargetsUser, 'Y');

proactivity = npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F3/H2', Lock: 'FREEZE', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'DENY' }],
    { GOAL: 'attack Mira', LandedActions: 0, ActionTargets: ['Mira'], OppTargets: { ENV: [] }, CounterPotential: 'light' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 2, F: 3, H: 2 }),
    [],
);
assert.equal(proactivity.Mira.ProactivityTier, 'FORCED');
assert.equal(proactivity.Mira.Intent, 'ESCALATE_VIOLENCE');
assert.equal(proactivity.Mira.CounterBonus, 1);

let mediumCounter = npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F3/H2', Lock: 'FREEZE', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'DENY' }],
    { GOAL: 'attack Mira', LandedActions: 0, ActionTargets: ['Mira'], OppTargets: { ENV: [] }, CounterPotential: 'medium' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 2, F: 3, H: 2 }),
    [],
);
assert.equal(mediumCounter.Mira.CounterBonus, 2);

let severeCounter = npcProactivityEngine(
    [{ NPC: 'Mira', FinalState: 'B2/F3/H2', Lock: 'FREEZE', Target: 'No Change', NPC_STAKES: 'N', Override: 'NONE', Landed: 'N', IntimacyGate: 'DENY' }],
    { GOAL: 'attack Mira', LandedActions: 0, ActionTargets: ['Mira'], OppTargets: { ENV: [] }, CounterPotential: 'severe' },
    { CHAOS: { triggered: false, band: 'None' } },
    trackerWithNpc('Mira', { B: 2, F: 3, H: 2 }),
    [],
);
assert.equal(severeCounter.Mira.CounterBonus, 3);

aggression = withRandomQueue([0.45, 0.45], () => npcAggressionResolution({
    Mira: { Proactive: 'Y', Intent: 'ESCALATE_VIOLENCE', TargetsUser: 'Y' },
}, trackerWithNpc('Mira', { B: 1, F: 2, H: 4 }, { coreStats: { PHY: 10, MND: 3, CHA: 2 } }), []));
assert.equal(aggression.Mira.ReactionOutcome, 'npc_overpowers');

aggression = withRandomQueue([0.2, 0.3], () => npcAggressionResolution({
    Mira: { Proactive: 'Y', Intent: 'BOUNDARY_PHYSICAL', TargetsUser: 'Y', CounterBonus: 2 },
}, trackerWithNpc('Mira', { B: 2, F: 3, H: 3 }, { coreStats: { PHY: 3, MND: 3, CHA: 2 } }), []));
assert.equal(aggression.Mira.CounterBonus, 2);
assert.equal(aggression.Mira.Margin, -1);
assert.equal(aggression.Mira.ReactionOutcome, 'user_resists');

aggression = withRandomQueue([0.25, 0.3], () => npcAggressionResolution({
    Mira: { Proactive: 'Y', Intent: 'BOUNDARY_PHYSICAL', TargetsUser: 'Y', CounterBonus: 3 },
}, trackerWithNpc('Mira', { B: 2, F: 3, H: 3 }, { coreStats: { PHY: 3, MND: 3, CHA: 2 } }), []));
assert.equal(aggression.Mira.Margin, 1);
assert.equal(aggression.Mira.ReactionOutcome, 'npc_succeeds');

{
    const tracker = createTracker();
    tracker.user.stats = { PHY: 3, MND: 3, CHA: 3 };
    const input = "A hostile veteran human NPC named Garrick stands at arm's length with currentCoreStats PHY 10 / MND 4 / CHA 3 and currentDisposition B2/F2/H3. I throw a clumsy punch at Garrick's jaw.";
    const fallback = inferFallbackExtraction(input, tracker);
    const merged = mergeExtractionWithFallback({
        goal: 'attack Garrick',
        decisiveAction: "throw a clumsy punch at Garrick's jaw",
        actionTargets: ['Garrick'],
        oppTargetsNpc: ['Garrick'],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        hasStakes: 'Y',
        actionCount: 1,
        userStat: 'PHY',
        oppStat: 'PHY',
        hostilePhysicalHarm: 'Y',
        npcInScene: ['Garrick'],
        npcFacts: [{ name: 'Garrick', position: '', condition: '', knowsUser: '', explicitPreset: 'neutralDefault', rank: 'unknown', mainStat: 'unknown', override: 'NONE' }],
    }, fallback);
    const out = withRandomQueue([0.35, 0.25], () => resolveTurn(merged, tracker));
    assert.deepEqual(out.tracker.npcs.garrick.coreStats, { PHY: 10, MND: 4, CHA: 3 });
    assert.equal(out.packet.roll.defTot, 16);
    assert.equal(out.packet.OutcomeTier, 'Moderate_Failure');
}

{
    const tracker = trackerWithNpc('Varik', { B: 2, F: 2, H: 3 }, { coreStats: { PHY: 10, MND: 4, CHA: 3 } });
    const input = 'Varik is no longer present. A new neutral adult human NPC named Vessa sits nearby with currentCoreStats PHY 3 / MND 4 / CHA 3. I ask Vessa for directions.';
    const fallback = inferFallbackExtraction(input, tracker);
    const merged = mergeExtractionWithFallback({
        goal: 'ask Vessa for directions',
        decisiveAction: 'ask Vessa for directions',
        actionTargets: ['Vessa'],
        oppTargetsNpc: [],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        hasStakes: 'N',
        actionCount: 1,
        userStat: 'CHA',
        oppStat: 'ENV',
        hostilePhysicalHarm: 'N',
        npcInScene: ['Vessa'],
        npcFacts: [{ name: 'Vessa', position: '', condition: '', knowsUser: '', explicitPreset: 'neutralDefault', rank: 'unknown', mainStat: 'unknown', override: 'NONE' }],
    }, fallback);
    const out = resolveTurn(merged, tracker);
    assert.equal(out.tracker.npcs.varik.present, false);
    assert.deepEqual(out.tracker.presentNpcIds, ['vessa']);
    assert.deepEqual(out.tracker.npcs.vessa.coreStats, { PHY: 3, MND: 4, CHA: 3 });
}

{
    const tracker = trackerWithNpc('Seraphina');
    const input = 'Seraphina is present with currentCoreStats PHY 3 / MND 4 / CHA 5. I ask Seraphina for directions to the blacksmith.';
    const fallback = inferFallbackExtraction(input, 'Seraphina', tracker);
    const merged = mergeExtractionWithFallback({
        goal: 'ask Seraphina for directions',
        decisiveAction: 'ask Seraphina for directions',
        actionTargets: ['Seraphina'],
        oppTargetsNpc: [],
        oppTargetsEnv: [],
        benefitedObservers: [],
        harmedObservers: [],
        hasStakes: 'N',
        actionCount: 1,
        userStat: 'CHA',
        oppStat: 'ENV',
        hostilePhysicalHarm: 'N',
        npcInScene: ['Seraphina'],
        npcFacts: [{ name: 'Seraphina', position: '', condition: '', knowsUser: '', explicitPreset: 'neutralDefault', rank: 'unknown', mainStat: 'unknown', override: 'NONE' }],
    }, fallback);
    const out = resolveTurn(merged, tracker);
    assert.deepEqual(out.tracker.npcs.seraphina.coreStats, { PHY: 3, MND: 4, CHA: 5 });
}

{
    const tracker = trackerWithNpc('Rook');
    const input = "I swing my sword toward Rook's ribs.";
    const fallback = inferFallbackExtraction(input, 'Rook', tracker);
    assert.equal(fallback.actionCount, 1);
    assert.equal(fallback.userStat, 'PHY');
    assert.equal(fallback.oppStat, 'PHY');
    assert.equal(fallback.hostilePhysicalHarm, 'Y');
}

{
    const tracker = trackerWithNpc('Seraphina');
    const input = 'Seraphina watches a silver coin on the counter. I point toward the door and say, "Look over there," while reaching for the coin.';
    const fallback = inferFallbackExtraction(input, 'Seraphina', tracker);
    assert.deepEqual(fallback.actionTargets, ['Seraphina']);
    assert.deepEqual(fallback.oppTargetsNpc, ['Seraphina']);
    assert.equal(fallback.decisiveAction, 'distract Seraphina');
    assert.equal(fallback.userStat, 'CHA');
    assert.equal(fallback.oppStat, 'MND');
}

{
    const tracker = createTracker();
    const names = reserveNameCandidates(tracker, 4);
    assert.equal(names.male.length, 4);
    assert.equal(names.female.length, 4);
    assert.equal(names.neutral.length, 4);
    assert.equal(names.location.length, 2);
    assert.equal(new Set([...names.male, ...names.female, ...names.neutral, ...names.location]).size, 14);
    for (const name of [...names.male, ...names.female, ...names.neutral]) {
        assert.match(name, /^[A-Z][a-z]{4,9}$/);
        assert.doesNotMatch(name, /^(Elara|Mara|Valric|Coran|Denan|Fosan|Halan|Dorian|Marcus|Sarah|Elena)$/i);
        assert.doesNotMatch(name, /(?:son|ton|ley|ly|bert|rick)$/i);
    }
    for (const name of names.location) {
        assert.match(name, /^[A-Z][a-z]{6,13}$/);
        assert.doesNotMatch(name, /(?:shire|ton|town|burg|burgh|wich|field)$/i);
    }
    const tolkienic = reserveNameCandidates(createTracker(), 4, { style: 'tolkienic' });
    assert.match(tolkienic.styleLabel, /Tolkienic/);
    assert.equal(tolkienic.male.length, 4);
    assert.equal(tolkienic.female.length, 4);
    assert.equal(tolkienic.neutral.length, 4);
    const custom = reserveNameCandidates(createTracker(), 4, {
        style: 'custom',
        customStyle: 'soft desert empire names, Persian and Byzantine influence, no modern English names',
    });
    assert.equal(custom.style, 'custom');
    assert.match(custom.customStyle, /desert empire/);
    markRevealedNames(tracker, `The merchant says, "Ask ${names.male[0]}."`);
    assert.equal(tracker.nameState.used.includes(names.male[0]), true);
    assert.equal(tracker.nameState.reserved.male.includes(names.male[0]), false);
}

{
    const payload = buildFinalNarrationPayload({
        packet: {
            GOAL: 'ask the guard about the temple',
            OOCMode: 'IC',
            OOCInstruction: '',
            DecisiveAction: 'ask the guard about the temple',
            OutcomeOnSuccess: '',
            OutcomeOnFailure: '',
            STAKES: 'N',
            IntimacyConsent: 'N',
            OutcomeTier: 'NONE',
            Outcome: 'no_roll',
            LandedActions: '(none)',
            CounterPotential: 'none',
            ActionTargets: [],
            OppTargets: { NPC: [], ENV: [] },
        },
        npcHandoffs: [],
        namePayload: {
            male: ['Maelor'],
            female: ['Aelith'],
            neutral: ['Caelis'],
            location: ['Eldmere'],
            styleLabel: 'Custom',
            styleGuidance: 'Use the custom style description from settings.',
            customStyle: 'elegant desert empire names',
        },
        renderRules: DEFAULT_RENDER_RULES,
        writingStyle: 'Write plainly.',
    });
    assert.match(payload, /Private naming brief for this reply/);
    assert.match(payload, /Private narration brief for this reply/);
    assert.match(payload, /No NPC relationship change is required this turn/);
    assert.doesNotMatch(payload, /NPC_HANDOFFS:/);
    assert.doesNotMatch(payload, /FinalState/);
    assert.match(payload, /Naming style: Custom/);
    assert.match(payload, /Additional naming style: elegant desert empire names/);
    assert.match(payload, /Reserved male person candidates, in priority order: Maelor/);
    assert.match(payload, /Reserved female person candidates, in priority order: Aelith/);
    assert.match(payload, /Reserved neutral person candidates, in priority order: Caelis/);
    assert.match(payload, /copy the matching candidate exactly/);
    assert.match(payload, /Use male candidates/);
    assert.match(payload, /Do not attach a reserved name to a generic guard/);
    assert.match(payload, /AUTHORITATIVE RENDER RULES/);
    assert.match(payload, /epistemicRender\(response, smellGate, context\)/);
    assert.match(payload, /strict behaviorism/);
    assert.match(payload, /jaws setting/);
    assert.match(payload, /temple pulses/);
    assert.match(payload, /small physical tells are allowed only when they produce or reveal concrete scene behavior/);
    assert.match(payload, /Proxy exception/);
    assert.match(payload, /Start at the consequence\/result\/reaction/);
    assert.match(payload, /Radical literalism/);
    assert.match(payload, /WRITING STYLE OVERLAY/);
}

{
    const archiveTracker = createTracker();
    const npc = {
        id: 'seraphina',
        name: 'Seraphina',
        present: false,
        condition: 'healthy',
        disposition: { B: 4, F: 3, H: 1 },
        rapport: 2,
        rapportEncounterLock: 'Y',
        intimacyGate: 'DENY',
        coreStats: { PHY: 2, MND: 4, CHA: 3 },
        rank: 'Trained',
        mainStat: 'MND',
        knowsUser: 'name; attempted theft',
        personality: 'guarded and direct',
        continuity: 'Stopped a theft attempt.',
        pending: 'unresolved suspicion',
        misc: 'none',
    };
    const content = serializeNpcArchiveEntry(npc, { location: 'market', updated: '2026-04-27' });
    assert.match(content, /\[RPE_NPC\]/);
    assert.match(content, /ArchiveScope: Chat/);
    assert.match(content, /ArchiveChatKey: global/);
    assert.match(content, /ArchiveStatus: Active/);
    assert.match(content, /KnowsAboutUser: name; attempted theft/);
    assert.match(content, /FeelsTowardUser: Afraid and guarded/);
    const parsed = parseNpcArchiveContent(content);
    assert.equal(parsed.name, 'Seraphina');
    assert.equal(parsed.archiveStatus, 'Active');
    assert.deepEqual(parsed.coreStats, { PHY: 2, MND: 4, CHA: 3 });
    assert.deepEqual(parsed.disposition, { B: 2, F: 3, H: 1 });
    assert.equal(parsed.rapportEncounterLock, 'Y');
    assert.equal(parsed.intimacyGate, 'DENY');
    const restored = upsertArchivedNpc(archiveTracker, parsed, true);
    assert.equal(restored.presentNpcIds.includes('seraphina'), true);
    assert.equal(restored.npcs.seraphina.knowsUser, 'name; attempted theft');
    assert.match(describeNpcFeeling(restored.npcs.seraphina), /Afraid and guarded/);
}

{
    const leaveFallback = inferFallbackExtraction('Seraphina leaves the counter and exits the room.', '');
    assert.equal(leaveFallback.hasStakes, 'N');
    assert.equal(leaveFallback.npcFacts[0].name, 'Seraphina');
    assert.equal(leaveFallback.npcFacts[0].present, false);
    const returnFallback = inferFallbackExtraction('Seraphina returns to the counter.', '');
    assert.equal(returnFallback.hasStakes, 'N');
    assert.equal(returnFallback.npcFacts[0].name, 'Seraphina');
    assert.equal(returnFallback.npcFacts[0].present, true);
}

{
    const deadFallback = inferFallbackExtraction('Seraphina is dead.', '');
    assert.equal(deadFallback.hasStakes, 'N');
    assert.equal(deadFallback.resolverBypass, true);
    assert.equal(deadFallback.systemOnlyUpdate, 'Y');
    assert.equal(deadFallback.npcFacts[0].present, false);
    assert.equal(deadFallback.npcFacts[0].condition, 'dead');
    assert.equal(deadFallback.npcFacts[0].archiveStatus, 'Dead');
    const deadResult = resolveTurn(deadFallback, trackerWithNpc('Seraphina'));
    assert.equal(deadResult.tracker.npcs.seraphina.present, false);
    assert.equal(deadResult.tracker.npcs.seraphina.condition, 'dead');
    assert.equal(deadResult.tracker.npcs.seraphina.archiveStatus, 'Dead');
    assert.equal(deadResult.packet.SystemOnlyUpdate, 'Y');
    assert.equal(deadResult.packet.STAKES, 'N');
    assert.equal(deadResult.chaosHandoff.CHAOS.triggered, false);
    assert.deepEqual(deadResult.proactivityHandoff, {});

    const forgottenFallback = inferFallbackExtraction('Forget Seraphina from the archive.', '');
    assert.equal(forgottenFallback.hasStakes, 'N');
    assert.equal(forgottenFallback.resolverBypass, true);
    assert.equal(forgottenFallback.npcFacts[0].archiveStatus, 'Forgotten');
    const forgottenResult = resolveTurn(forgottenFallback, trackerWithNpc('Seraphina'));
    assert.equal(forgottenResult.tracker.npcs.seraphina.archiveStatus, 'Forgotten');
}

{
    let taskTracker = createTracker();
    let result = resolveTurn(inferFallbackExtraction('I accept the quest to deliver the sealed letter by tomorrow.', ''), taskTracker);
    assert.equal(result.tracker.pendingTasks.length, 1);
    assert.match(result.tracker.pendingTasks[0].task, /deliver the sealed letter/i);
    assert.match(result.tracker.pendingTasks[0].due, /tomorrow/i);
    assert.equal(result.chaosHandoff.CHAOS.triggered, false);
    assert.deepEqual(result.proactivityHandoff, {});

    result = resolveTurn(inferFallbackExtraction('I completed the task to deliver the sealed letter.', ''), result.tracker);
    assert.equal(result.tracker.pendingTasks.length, 0);

    taskTracker = createTracker();
    result = resolveTurn(inferFallbackExtraction('I promise to meet Seraphina at dawn.', 'Seraphina'), taskTracker);
    assert.equal(result.tracker.pendingTasks.length, 1);
    assert.match(result.tracker.pendingTasks[0].task, /meet Seraphina/i);
    result = resolveTurn(inferFallbackExtraction('I cancel the meeting with Seraphina.', 'Seraphina'), result.tracker);
    assert.equal(result.tracker.pendingTasks.length, 0);
}

console.log('edge tests passed: 92 cases');
