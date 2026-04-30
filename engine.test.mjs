import assert from 'node:assert/strict';
import {
    chaosInterrupt,
    applyCharacterCreatorReroll,
    applyCharacterCreatorSwap,
    buildCharacterSheet,
    createTracker,
    inferFallbackExtraction,
    mergeExtractionWithFallback,
    npcAggressionResolution,
    npcProactivityEngine,
    parseCoreStats,
    rollCharacterCreatorBasics,
    rollCharacterCreatorStats,
    resolveTurn,
} from './engine.js';

const stats = parseCoreStats('PHY[4] MND[6] CHA[2]');
assert.deepEqual(stats, { PHY: 4, MND: 6, CHA: 2 });

const creatorRoll = rollCharacterCreatorStats(() => 0.0);
assert.deepEqual(creatorRoll.pool, { PHY: [1, 1], MND: [1, 1], CHA: [1, 1] });
assert.deepEqual(creatorRoll.baseStats, { PHY: 1, MND: 1, CHA: 1 });
assert.equal(creatorRoll.rerollValue, 1);
const creatorHighRoll = rollCharacterCreatorStats(() => 0.99);
assert.deepEqual(creatorHighRoll.baseStats, { PHY: 10, MND: 10, CHA: 10 });
assert.equal(creatorHighRoll.rerollValue, 10);
const creatorBasicsLow = rollCharacterCreatorBasics(() => 0.0);
assert.equal(creatorBasicsLow.mode, 'random');
assert.equal(creatorBasicsLow.raceRoll, 1);
assert.equal(creatorBasicsLow.raceDie, 100);
assert.equal(creatorBasicsLow.race, 'Human');
const creatorBasicsHigh = rollCharacterCreatorBasics(() => 0.99);
assert.ok(creatorBasicsHigh.raceRoll > 1);
assert.equal(creatorBasicsHigh.raceDie, 100);
assert.deepEqual(applyCharacterCreatorReroll({ PHY: 4, MND: 6, CHA: 2 }, 'CHA', 8), { PHY: 4, MND: 6, CHA: 8 });
assert.deepEqual(applyCharacterCreatorReroll({ PHY: 4, MND: 6, CHA: 2 }, 'MND', 1), { PHY: 4, MND: 6, CHA: 2 });
assert.deepEqual(applyCharacterCreatorSwap({ PHY: 4, MND: 6, CHA: 2 }, 'PHY', 'CHA'), { PHY: 2, MND: 6, CHA: 4 });
const creatorSheet = buildCharacterSheet({
    basic: { name: 'Saryndel', race: 'veil-marked human', gender: 'unspecified', age: 'young adult' },
    appearance: { height: 'average', build: 'lean', hair: 'dark', eyes: 'gray', skin: 'warm brown', distinctFeatures: 'silver mark' },
    traits: [{ name: 'Low-Light Adaptation', effect: 'Sees shape and movement in dim natural light.' }],
    abilities: [{ name: 'Threshold Sense', effect: 'Can sense a recently crossed boundary when focusing.' }],
    inventory: ['travel cloak', 'bedroll'],
    notes: ['Private perceptions remain private.'],
}, { PHY: 4, MND: 6, CHA: 2 });
assert.match(creatorSheet, /PHY: 4/);
assert.match(creatorSheet, /MND: 6/);
assert.match(creatorSheet, /CHA: 2/);
assert.match(creatorSheet, /PRIVATE PERCEPTION RULE/);
assert.deepEqual(parseCoreStats(creatorSheet), { PHY: 4, MND: 6, CHA: 2 });
const creatorFlatSheet = buildCharacterSheet({
    name: 'Aerilon Drae',
    race: 'Troll-blooded human',
    gender: 'male',
    age: 24,
    appearance: 'Towering build, grey-green skin, amber eyes.',
    traits: ['Enduring constitution'],
    abilities: ['Regeneration surge'],
    inventory: ['traveler cloak'],
    notes: 'Private spirit-sense remains private.',
}, { PHY: 4, MND: 6, CHA: 10 });
assert.match(creatorFlatSheet, /Name: Aerilon Drae/);
assert.match(creatorFlatSheet, /Race: Troll-blooded human/);
assert.match(creatorFlatSheet, /Distinct Features \/ Style: Towering build, grey-green skin, amber eyes\./);
assert.match(creatorFlatSheet, /Private spirit-sense remains private/);

const tracker = createTracker();
tracker.user.stats = stats;

const oocStopFallback = inferFallbackExtraction('((What does B3 mean?))', '');
assert.equal(oocStopFallback.oocMode, 'STOP');
const oocStopResult = resolveTurn(oocStopFallback, tracker, { userStats: stats });
assert.equal(oocStopResult.packet.OOCMode, 'STOP');
assert.equal(oocStopResult.packet.STAKES, 'N');
assert.equal(oocStopResult.packet.Outcome, 'no_roll');
assert.equal(oocStopResult.npcHandoffs.length, 0);

const oocProxyFallback = inferFallbackExtraction('((Have my character slap Seraphina twice.))', '');
assert.equal(oocProxyFallback.oocMode, 'STOP');
const oocProxyResult = resolveTurn(oocProxyFallback, tracker, { userStats: stats });
assert.equal(oocProxyResult.packet.OOCMode, 'STOP');
assert.equal(oocProxyResult.packet.STAKES, 'N');

const oocTripleProxyFallback = inferFallbackExtraction('(((Have my character slap Seraphina twice.)))', '');
assert.equal(oocTripleProxyFallback.oocMode, 'PROXY');
assert.equal(oocTripleProxyFallback.actionCount, 2);
const oocTripleProxyResult = resolveTurn(oocTripleProxyFallback, tracker, { userStats: stats });
assert.equal(oocTripleProxyResult.packet.OOCMode, 'PROXY');
assert.deepEqual(oocTripleProxyResult.packet.actions, ['a1', 'a2']);
assert.equal(oocTripleProxyResult.packet.stats.USER, 'PHY');

const oocTripleSneakFallback = inferFallbackExtraction('(((Have my character try to sneak past the guard.)))', '');
assert.equal(oocTripleSneakFallback.oocMode, 'PROXY');
assert.equal(oocTripleSneakFallback.oppStat, 'MND');
const oocTripleSneakResult = resolveTurn(oocTripleSneakFallback, tracker, { userStats: stats });
assert.equal(oocTripleSneakResult.packet.OOCMode, 'PROXY');
assert.equal(oocTripleSneakResult.packet.stats.USER, 'PHY');
assert.equal(oocTripleSneakResult.packet.stats.OPP, 'MND');

const fallback = inferFallbackExtraction('I shove past Seraphina before she can stop me.', '');
assert.deepEqual(fallback.actionTargets, ['Seraphina']);
assert.equal(fallback.hasStakes, 'Y');
assert.equal(fallback.userStat, 'PHY');
assert.match(fallback.decisiveAction, /shove/i);

const socialFallback = inferFallbackExtraction('I lower my voice and tell Seraphina that if she does not step aside, I will reveal her secret.', '');
assert.deepEqual(socialFallback.actionTargets, ['Seraphina']);
assert.equal(socialFallback.hasStakes, 'Y');
assert.equal(socialFallback.userStat, 'CHA');
assert.equal(socialFallback.oppStat, 'MND');
assert.match(socialFallback.decisiveAction, /tell/i);
const socialResult = resolveTurn(socialFallback, tracker, { userStats: stats });
assert.equal(socialResult.npcHandoffs[0].Target, 'Fear');
assert.equal(socialResult.npcHandoffs[0].FinalState, 'B2/F3/H2');
assert.match(socialResult.packet.DecisiveAction, /tell/i);

const semanticThreatResult = resolveTurn({
    ooc: 'N',
    goal: 'get past Seraphina',
    goalKind: 'Normal',
    goalEvidence: 'I threaten to expose her secret so she lets me pass.',
    decisiveAction: 'threaten Seraphina with exposing her secret',
    decisiveActionEvidence: 'threaten to expose her secret',
    outcomeOnSuccess: 'Seraphina is pressured into letting the user pass.',
    outcomeOnFailure: 'Seraphina resists the threat.',
    actionTargets: ['Seraphina'],
    oppTargetsNpc: ['Seraphina'],
    oppTargetsEnv: [],
    benefitedObservers: [],
    harmedObservers: [],
    npcInScene: ['Seraphina'],
    hasStakes: 'Y',
    stakesEvidence: 'Threat used to bypass an opposing NPC.',
    actionCount: 1,
    userStat: 'CHA',
    userStatEvidence: 'threaten',
    oppStat: 'MND',
    oppStatEvidence: 'resists coercion',
    hostilePhysicalHarm: 'N',
    newEncounter: 'N',
    scene: { location: '', time: '', weather: '' },
    npcFacts: [],
    inventoryDeltas: [],
}, tracker, { userStats: stats });
assert.equal(semanticThreatResult.npcHandoffs[0].Target, 'Fear');

const directionsFallback = inferFallbackExtraction('I ask Seraphina for directions.', '');
assert.deepEqual(directionsFallback.actionTargets, ['Seraphina']);
assert.deepEqual(directionsFallback.oppTargetsNpc, []);
assert.equal(directionsFallback.hasStakes, 'N');
const directionsResult = resolveTurn(directionsFallback, tracker, { userStats: stats });
assert.equal(directionsResult.packet.STAKES, 'N');
assert.equal(directionsResult.packet.roll, undefined);
assert.equal(directionsResult.npcHandoffs[0].Target, 'No Change');
assert.equal(directionsResult.npcHandoffs[0].FinalState, 'B2/F2/H2');

const complimentFallback = inferFallbackExtraction('I tell Seraphina she looks nice today.', '');
assert.deepEqual(complimentFallback.actionTargets, ['Seraphina']);
assert.deepEqual(complimentFallback.oppTargetsNpc, []);
assert.equal(complimentFallback.hasStakes, 'N');
const complimentResult = resolveTurn(complimentFallback, tracker, { userStats: stats });
assert.equal(complimentResult.packet.STAKES, 'N');
assert.equal(complimentResult.packet.roll, undefined);
assert.equal(complimentResult.npcHandoffs[0].Target, 'No Change');

const thanksFallback = inferFallbackExtraction('I thank Seraphina and apologize for bothering her.', '');
assert.deepEqual(thanksFallback.actionTargets, ['Seraphina']);
assert.deepEqual(thanksFallback.oppTargetsNpc, []);
assert.equal(thanksFallback.hasStakes, 'N');
const thanksResult = resolveTurn(thanksFallback, tracker, { userStats: stats });
assert.equal(thanksResult.packet.STAKES, 'N');
assert.equal(thanksResult.packet.roll, undefined);
assert.equal(thanksResult.npcHandoffs[0].Target, 'No Change');

const publicInfoFallback = inferFallbackExtraction('I ask Seraphina if she knows where the blacksmith is.', '');
assert.deepEqual(publicInfoFallback.actionTargets, ['Seraphina']);
assert.deepEqual(publicInfoFallback.oppTargetsNpc, []);
assert.equal(publicInfoFallback.hasStakes, 'N');
const publicInfoResult = resolveTurn(publicInfoFallback, tracker, { userStats: stats });
assert.equal(publicInfoResult.packet.STAKES, 'N');
assert.equal(publicInfoResult.packet.roll, undefined);
assert.equal(publicInfoResult.npcHandoffs[0].Target, 'No Change');

const secretPasswordFallback = inferFallbackExtraction('I ask Seraphina for the secret password.', '');
assert.deepEqual(secretPasswordFallback.actionTargets, ['Seraphina']);
assert.deepEqual(secretPasswordFallback.oppTargetsNpc, ['Seraphina']);
assert.equal(secretPasswordFallback.hasStakes, 'Y');
assert.equal(secretPasswordFallback.userStat, 'CHA');
assert.equal(secretPasswordFallback.oppStat, 'CHA');

const coinLoanFallback = inferFallbackExtraction('I ask Seraphina to lend me ten coins.', '');
assert.deepEqual(coinLoanFallback.actionTargets, ['Seraphina']);
assert.deepEqual(coinLoanFallback.oppTargetsNpc, ['Seraphina']);
assert.equal(coinLoanFallback.hasStakes, 'Y');
assert.equal(coinLoanFallback.userStat, 'CHA');
assert.equal(coinLoanFallback.oppStat, 'CHA');

const hostilityExtraction = {
    ooc: 'N',
    goal: 'insult Seraphina',
    goalKind: 'Normal',
    goalEvidence: 'I insult Seraphina in front of everyone.',
    decisiveAction: 'insult Seraphina',
    decisiveActionEvidence: 'insult Seraphina',
    outcomeOnSuccess: 'Seraphina is insulted.',
    outcomeOnFailure: 'The insult fails to land.',
    actionTargets: ['Seraphina'],
    oppTargetsNpc: ['Seraphina'],
    oppTargetsEnv: [],
    benefitedObservers: [],
    harmedObservers: [],
    npcInScene: ['Seraphina'],
    hasStakes: 'Y',
    stakesEvidence: 'Direct hostile social action toward Seraphina.',
    actionCount: 1,
    userStat: 'CHA',
    userStatEvidence: 'insult',
    oppStat: 'MND',
    oppStatEvidence: 'resists hostile social action',
    hostilePhysicalHarm: 'N',
    newEncounter: 'N',
    scene: { location: '', time: '', weather: '' },
    npcFacts: [],
    inventoryDeltas: [],
};
const hostilityTracker = createTracker();
hostilityTracker.user.stats = stats;
hostilityTracker.presentNpcIds = ['seraphina'];
hostilityTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 3, F: 1, H: 2 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const hostilityResult = resolveTurn(hostilityExtraction, hostilityTracker, { userStats: stats });
assert.equal(hostilityResult.npcHandoffs[0].Target, 'Hostility');
assert.equal(hostilityResult.npcHandoffs[0].FinalState, 'B2/F1/H3');

const verbalIntimacyFallback = inferFallbackExtraction('I ask Seraphina to show me her panties.', '');
assert.equal(verbalIntimacyFallback.goalKind, 'IntimacyAdvanceVerbal');
assert.deepEqual(verbalIntimacyFallback.actionTargets, ['Seraphina']);
assert.equal(verbalIntimacyFallback.userStat, 'CHA');
assert.equal(verbalIntimacyFallback.oppStat, 'MND');
const verbalIntimacyResult = resolveTurn(verbalIntimacyFallback, tracker, { userStats: stats });
assert.equal(verbalIntimacyResult.packet.stats.USER, 'CHA');
assert.equal(verbalIntimacyResult.packet.stats.OPP, 'MND');

const slapOnceFallback = inferFallbackExtraction('I slap Seraphina once.', '');
assert.equal(slapOnceFallback.hostilePhysicalHarm, 'Y');
assert.equal(slapOnceFallback.actionCount, 1);
assert.equal(slapOnceFallback.userStat, 'PHY');
assert.equal(slapOnceFallback.oppStat, 'PHY');

const slapTwiceFallback = inferFallbackExtraction('I slap Seraphina twice.', '');
assert.equal(slapTwiceFallback.hostilePhysicalHarm, 'Y');
assert.equal(slapTwiceFallback.actionCount, 2);
assert.equal(slapTwiceFallback.userStat, 'PHY');
assert.equal(slapTwiceFallback.oppStat, 'PHY');

const comboTracker = createTracker();
comboTracker.presentNpcIds = ['seraphina'];
comboTracker.npcs.seraphina = { id: 'seraphina', name: 'Seraphina' };
const comboFallback = inferFallbackExtraction('I get up, and take a step towards her... then throw a sideways punch at the side of her face. Using the momentum of my swing, I pivot on my foot, bringing my other hand around in a backhand slap. Finally, I knee her in the stomach', '', comboTracker);
assert.equal(comboFallback.hostilePhysicalHarm, 'Y');
assert.equal(comboFallback.actionCount, 3);
assert.match(comboFallback.decisiveAction, /punch/i);
assert.match(comboFallback.decisiveAction, /slap/i);
assert.match(comboFallback.decisiveAction, /knee/i);

const loveFallback = inferFallbackExtraction('I tell Seraphina I love her.', '');
assert.equal(loveFallback.goalKind, 'Normal');
assert.equal(loveFallback.hasStakes, 'N');
assert.deepEqual(loveFallback.oppTargetsNpc, []);

const chasmFallback = inferFallbackExtraction('After taking a few steps back, I take off on a run as fast as I can. Once I reach the edge, I jump over the chasm.', '');
assert.equal(chasmFallback.goal, 'cross the chasm');
assert.match(chasmFallback.decisiveAction, /jump/i);
assert.equal(chasmFallback.userStat, 'PHY');
assert.equal(chasmFallback.oppStat, 'ENV');

const distractionFallback = inferFallbackExtraction('"Look over there!" I say, as I point to the side, just as I reach for the 100 dollar bill on the table.', '');
assert.equal(distractionFallback.goal, 'take the bill');
assert.equal(distractionFallback.decisiveAction, 'distract the observer');
assert.equal(distractionFallback.userStat, 'CHA');

const distractionKissFallback = inferFallbackExtraction('I try to distract Seraphina, then kiss her if she looks away.', '');
assert.equal(distractionKissFallback.goalKind, 'IntimacyAdvancePhysical');
assert.equal(distractionKissFallback.goal, 'kiss Seraphina');
assert.match(distractionKissFallback.decisiveAction, /distract/i);
assert.equal(distractionKissFallback.userStat, 'CHA');
assert.equal(distractionKissFallback.oppStat, 'MND');
const twoNpcTracker = createTracker();
twoNpcTracker.presentNpcIds = ['assistant', 'seraphina'];
twoNpcTracker.npcs.assistant = { id: 'assistant', name: 'Assistant' };
twoNpcTracker.npcs.seraphina = { id: 'seraphina', name: 'Seraphina' };
const namedPronounKissFallback = inferFallbackExtraction('I point sharply behind Seraphina and say, "Look over there!" When she looks away, I step in and kiss her.', 'Assistant', twoNpcTracker);
assert.deepEqual(namedPronounKissFallback.actionTargets, ['Seraphina']);
assert.deepEqual(namedPronounKissFallback.oppTargetsNpc, ['Seraphina']);
const wrongAssistantExtraction = mergeExtractionWithFallback({
    goal: 'kiss Seraphina',
    goalKind: 'IntimacyAdvancePhysical',
    decisiveAction: 'distract Assistant',
    actionTargets: ['Assistant'],
    oppTargetsNpc: ['Assistant'],
    oppTargetsEnv: [],
    npcInScene: ['Assistant'],
    hasStakes: 'Y',
    userStat: 'CHA',
    oppStat: 'MND',
}, distractionKissFallback);
assert.deepEqual(wrongAssistantExtraction.actionTargets, ['Seraphina']);
assert.deepEqual(wrongAssistantExtraction.oppTargetsNpc, ['Seraphina']);
const distractionKissResult = resolveTurn(distractionKissFallback, tracker, { userStats: stats });
assert.equal(distractionKissResult.packet.GOAL, 'IntimacyAdvancePhysical');
assert.equal(distractionKissResult.packet.IntimacyConsent, 'N');
assert.equal(distractionKissResult.npcHandoffs[0].Target, 'FearHostility');
assert.equal(distractionKissResult.npcHandoffs[0].FinalState, 'B2/F3/H3');

const directKissFallback = inferFallbackExtraction('I kiss Seraphina.', '');
assert.equal(directKissFallback.goalKind, 'IntimacyAdvancePhysical');
assert.equal(directKissFallback.goal, 'kiss Seraphina');
assert.deepEqual(directKissFallback.actionTargets, ['Seraphina']);
assert.deepEqual(directKissFallback.oppTargetsNpc, ['Seraphina']);
assert.equal(directKissFallback.userStat, 'CHA');
assert.equal(directKissFallback.oppStat, 'MND');

const closeTracker = createTracker();
closeTracker.user.stats = stats;
closeTracker.presentNpcIds = ['seraphina'];
closeTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 4, F: 1, H: 1 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const closeKissResult = resolveTurn(directKissFallback, closeTracker, { userStats: stats });
assert.equal(closeKissResult.packet.IntimacyConsent, 'Y');
assert.equal(closeKissResult.packet.STAKES, 'N');
assert.equal(closeKissResult.packet.roll, undefined);
assert.equal(closeKissResult.npcHandoffs[0].Target, 'Bond');
assert.equal(closeKissResult.npcHandoffs[0].IntimacyGate, 'ALLOW');

const lockedCloseTracker = createTracker();
lockedCloseTracker.user.stats = stats;
lockedCloseTracker.presentNpcIds = ['seraphina'];
lockedCloseTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 4, F: 3, H: 1 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const lockedCloseKissResult = resolveTurn(directKissFallback, lockedCloseTracker, { userStats: stats });
assert.equal(lockedCloseKissResult.packet.IntimacyConsent, 'N');
assert.equal(lockedCloseKissResult.packet.STAKES, 'Y');
assert.equal(lockedCloseKissResult.npcHandoffs[0].Target, 'No Change');
assert.equal(lockedCloseKissResult.npcHandoffs[0].FinalState, 'B2/F3/H1');
assert.equal(lockedCloseKissResult.npcHandoffs[0].IntimacyGate, 'DENY');
assert.equal(lockedCloseKissResult.tracker.npcs.seraphina.rapport, 0);

const thresholdFearTracker = createTracker();
thresholdFearTracker.user.stats = stats;
thresholdFearTracker.presentNpcIds = ['seraphina'];
thresholdFearTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 4, F: 2, H: 2 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const thresholdFearResult = resolveTurn(socialFallback, thresholdFearTracker, { userStats: stats });
assert.equal(thresholdFearResult.npcHandoffs[0].Target, 'Fear');
assert.equal(thresholdFearResult.npcHandoffs[0].FinalState, 'B2/F3/H2');
assert.equal(thresholdFearResult.npcHandoffs[0].IntimacyGate, 'DENY');

const invalidLockedTracker = createTracker();
invalidLockedTracker.user.stats = stats;
invalidLockedTracker.presentNpcIds = ['seraphina'];
invalidLockedTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 4, F: 3, H: 1 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const invalidLockedLove = resolveTurn(loveFallback, invalidLockedTracker, { userStats: stats });
assert.equal(invalidLockedLove.npcHandoffs[0].FinalState, 'B2/F3/H1');
assert.equal(invalidLockedLove.npcHandoffs[0].Lock, 'FREEZE');

const terrorLockedTracker = createTracker();
terrorLockedTracker.user.stats = stats;
terrorLockedTracker.presentNpcIds = ['seraphina'];
terrorLockedTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 4, F: 4, H: 1 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const terrorLockedLove = resolveTurn(loveFallback, terrorLockedTracker, { userStats: stats });
assert.equal(terrorLockedLove.npcHandoffs[0].FinalState, 'B1/F4/H1');
assert.equal(terrorLockedLove.npcHandoffs[0].Lock, 'TERROR');

const terrorRemediationTracker = createTracker();
terrorRemediationTracker.user.stats = stats;
terrorRemediationTracker.presentNpcIds = ['seraphina'];
terrorRemediationTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 1, F: 4, H: 1 },
    rapport: 5,
    rapportEncounterLock: 'N',
    intimacyGate: 'DENY',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const terrorRemediation = resolveTurn(loveFallback, terrorRemediationTracker, { userStats: stats });
assert.equal(terrorRemediation.npcHandoffs[0].FinalState, 'B2/F3/H1');
assert.equal(terrorRemediation.tracker.npcs.seraphina.rapport, 0);

const doubleLockRemediationTracker = createTracker();
doubleLockRemediationTracker.user.stats = stats;
doubleLockRemediationTracker.presentNpcIds = ['seraphina'];
doubleLockRemediationTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 1, F: 4, H: 4 },
    rapport: 5,
    rapportEncounterLock: 'N',
    intimacyGate: 'DENY',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
const doubleLockRemediation = resolveTurn(loveFallback, doubleLockRemediationTracker, { userStats: stats });
assert.equal(doubleLockRemediation.npcHandoffs[0].FinalState, 'B1/F3/H4');
assert.equal(doubleLockRemediation.tracker.npcs.seraphina.rapport, 0);

const targetlessIntimacyResult = resolveTurn({
    goal: 'kiss nobody in particular',
    goalKind: 'IntimacyAdvancePhysical',
    decisiveAction: 'kiss',
    actionTargets: [],
    oppTargetsNpc: [],
    oppTargetsEnv: [],
    npcInScene: [],
    hasStakes: 'Y',
    actionCount: 1,
    userStat: 'CHA',
    oppStat: 'ENV',
    hostilePhysicalHarm: 'N',
    scene: {},
    npcFacts: [],
    inventoryDeltas: [],
}, tracker, { userStats: stats });
assert.equal(targetlessIntimacyResult.packet.OutcomeTier, 'Failure');
assert.equal(targetlessIntimacyResult.packet.Outcome, 'failure');
assert.equal(targetlessIntimacyResult.packet.roll, undefined);

const pronounDistractionFallback = inferFallbackExtraction('"Look over there!" I say, as I point to the side, just as I reach for the 100 dollar bill on the table.', '', distractionKissResult.tracker);
assert.equal(pronounDistractionFallback.decisiveAction, 'distract Seraphina');
assert.deepEqual(pronounDistractionFallback.actionTargets, ['Seraphina']);
assert.deepEqual(pronounDistractionFallback.oppTargetsNpc, ['Seraphina']);
assert.equal(pronounDistractionFallback.oppStat, 'MND');

const stealthFallback = inferFallbackExtraction('I sneak past the guard without being noticed.', '');
assert.deepEqual(stealthFallback.oppTargetsNpc, ['guard']);
assert.equal(stealthFallback.userStat, 'PHY');
assert.equal(stealthFallback.oppStat, 'MND');

const sleightObserverFallback = inferFallbackExtraction('I palm the coin while Seraphina watches me.', '');
assert.deepEqual(sleightObserverFallback.actionTargets, ['Seraphina']);
assert.deepEqual(sleightObserverFallback.oppTargetsNpc, ['Seraphina']);
assert.deepEqual(sleightObserverFallback.oppTargetsEnv, []);
assert.equal(sleightObserverFallback.hasStakes, 'Y');
assert.equal(sleightObserverFallback.userStat, 'PHY');
assert.equal(sleightObserverFallback.oppStat, 'MND');

const guardDiplomacyFallback = inferFallbackExtraction('I convince the guard to let me through honestly.', '');
assert.deepEqual(guardDiplomacyFallback.oppTargetsNpc, ['guard']);
assert.equal(guardDiplomacyFallback.userStat, 'CHA');
assert.equal(guardDiplomacyFallback.oppStat, 'CHA');

const doorFallback = inferFallbackExtraction('I kick the locked door open.', '');
assert.deepEqual(doorFallback.oppTargetsEnv, ['door']);
assert.equal(doorFallback.userStat, 'PHY');
assert.equal(doorFallback.oppStat, 'ENV');

const forageFallback = inferFallbackExtraction('I forage for edible plants in the woods.', '');
assert.deepEqual(forageFallback.oppTargetsEnv, ['plants']);
assert.equal(forageFallback.userStat, 'MND');
assert.equal(forageFallback.oppStat, 'ENV');

const badLivingEnvExtraction = {
    ooc: 'N',
    goal: 'fool Seraphina and take the bill',
    goalKind: 'Normal',
    goalEvidence: 'I distract Seraphina while reaching for the bill',
    decisiveAction: 'distract Seraphina',
    decisiveActionEvidence: 'I distract Seraphina',
    outcomeOnSuccess: 'User takes the bill.',
    outcomeOnFailure: 'Seraphina notices.',
    actionTargets: ['Seraphina'],
    oppTargetsNpc: ['Seraphina'],
    oppTargetsEnv: ['bill'],
    benefitedObservers: [],
    harmedObservers: [],
    npcInScene: ['Seraphina'],
    hasStakes: 'Y',
    stakesEvidence: 'Taking money has material stakes.',
    actionCount: 1,
    userStat: 'CHA',
    userStatEvidence: 'distract',
    oppStat: 'ENV',
    oppStatEvidence: 'bad model output',
    hostilePhysicalHarm: 'N',
    newEncounter: 'N',
    scene: { location: '', time: '', weather: '' },
    npcFacts: [],
    inventoryDeltas: [],
};
const correctedLivingEnv = resolveTurn(badLivingEnvExtraction, tracker, { userStats: stats });
assert.equal(correctedLivingEnv.packet.stats.USER, 'CHA');
assert.equal(correctedLivingEnv.packet.stats.OPP, 'MND');

const diplomacyExtraction = {
    ...badLivingEnvExtraction,
    goal: 'convince Seraphina to help',
    goalEvidence: 'I honestly convince Seraphina to help',
    decisiveAction: 'convince Seraphina honestly',
    decisiveActionEvidence: 'convince Seraphina honestly',
    oppTargetsEnv: [],
    userStat: 'MND',
    oppStat: 'ENV',
};
const correctedDiplomacy = resolveTurn(diplomacyExtraction, tracker, { userStats: stats });
assert.equal(correctedDiplomacy.packet.stats.USER, 'CHA');
assert.equal(correctedDiplomacy.packet.stats.OPP, 'CHA');

const forageExtraction = {
    ...badLivingEnvExtraction,
    goal: 'find edible plants',
    goalEvidence: 'I forage for edible plants in the woods',
    decisiveAction: 'forage for edible plants',
    decisiveActionEvidence: 'forage for edible plants',
    actionTargets: [],
    oppTargetsNpc: [],
    oppTargetsEnv: ['woods'],
    npcInScene: [],
    userStat: 'PHY',
    oppStat: 'CHA',
};
const correctedForage = resolveTurn(forageExtraction, tracker, { userStats: stats });
assert.equal(correctedForage.packet.stats.USER, 'MND');
assert.equal(correctedForage.packet.stats.OPP, 'ENV');

const extraction = {
    ooc: 'N',
    goal: 'shove past Mira',
    goalKind: 'Normal',
    goalEvidence: 'I shove past Mira',
    decisiveAction: 'shove past Mira',
    decisiveActionEvidence: 'I shove past Mira',
    outcomeOnSuccess: 'User gets past Mira.',
    outcomeOnFailure: 'Mira blocks the user.',
    actionTargets: ['Mira'],
    oppTargetsNpc: ['Mira'],
    oppTargetsEnv: [],
    benefitedObservers: [],
    harmedObservers: [],
    npcInScene: ['Mira'],
    hasStakes: 'Y',
    stakesEvidence: 'Mira blocks the way',
    actionCount: 1,
    userStat: 'PHY',
    userStatEvidence: 'shove',
    oppStat: 'PHY',
    oppStatEvidence: 'blocks physically',
    hostilePhysicalHarm: 'N',
    newEncounter: 'N',
    scene: { location: 'Gate', time: 'night', weather: '' },
    npcFacts: [{
        name: 'Mira',
        position: 'by the gate',
        condition: 'healthy',
        knowsUser: 'name',
        explicitPreset: 'neutralDefault',
        rank: 'Average',
        mainStat: 'PHY',
        override: 'NONE',
    }],
    inventoryDeltas: [{ action: 'gain', item: 'iron key', evidence: 'I pick up the iron key' }],
};

const result = resolveTurn(extraction, tracker, { userStats: stats });
assert.equal(result.packet.STAKES, 'Y');
assert.equal(result.packet.ActionTargets[0], 'Mira');
assert.equal(result.npcHandoffs.length, 1);
assert.equal(result.tracker.inventory.includes('iron key'), true);
assert.equal(result.tracker.presentNpcIds.length, 1);

const originalRandom = Math.random;
const benefitExtraction = {
    ooc: 'N',
    goal: 'free Seraphina from the cage',
    goalKind: 'Normal',
    goalEvidence: 'I force the cage door open to free Seraphina',
    decisiveAction: 'force the cage door open',
    decisiveActionEvidence: 'force the cage door open',
    outcomeOnSuccess: 'Seraphina is freed.',
    outcomeOnFailure: 'The cage stays shut.',
    actionTargets: [],
    oppTargetsNpc: [],
    oppTargetsEnv: ['cage door'],
    benefitedObservers: ['Seraphina'],
    harmedObservers: [],
    npcInScene: ['Seraphina'],
    hasStakes: 'Y',
    stakesEvidence: 'Seraphina autonomy improves only if the cage opens.',
    actionCount: 1,
    userStat: 'PHY',
    userStatEvidence: 'force door',
    oppStat: 'ENV',
    oppStatEvidence: 'cage door',
    hostilePhysicalHarm: 'N',
    newEncounter: 'N',
    scene: { location: '', time: '', weather: '' },
    npcFacts: [],
    inventoryDeltas: [],
};
const failedBenefitTracker = createTracker();
failedBenefitTracker.user.stats = stats;
failedBenefitTracker.presentNpcIds = ['seraphina'];
failedBenefitTracker.npcs.seraphina = { id: 'seraphina', name: 'Seraphina', disposition: { B: 2, F: 2, H: 2 }, coreStats: { PHY: 2, MND: 2, CHA: 2 } };
let randomQueue = [0, 0.99];
Math.random = () => randomQueue.shift() ?? 0;
const failedBenefit = resolveTurn(benefitExtraction, failedBenefitTracker, { userStats: stats });
assert.equal(failedBenefit.packet.OutcomeTier, 'Failure');
assert.equal(failedBenefit.npcHandoffs[0].Target, 'No Change');
assert.equal(failedBenefit.npcHandoffs[0].NPC_STAKES, 'N');

const successfulBenefitTracker = createTracker();
successfulBenefitTracker.user.stats = stats;
successfulBenefitTracker.presentNpcIds = ['seraphina'];
successfulBenefitTracker.npcs.seraphina = { id: 'seraphina', name: 'Seraphina', disposition: { B: 2, F: 2, H: 2 }, coreStats: { PHY: 2, MND: 2, CHA: 2 } };
randomQueue = [0.99, 0];
Math.random = () => randomQueue.shift() ?? 0;
const successfulBenefit = resolveTurn(benefitExtraction, successfulBenefitTracker, { userStats: stats });
assert.equal(successfulBenefit.packet.OutcomeTier, 'Success');
assert.equal(successfulBenefit.npcHandoffs[0].Target, 'Bond');
assert.equal(successfulBenefit.npcHandoffs[0].NPC_STAKES, 'Y');
Math.random = originalRandom;

let chaosRolls = [];
let chaosQueue = [0.80, 0.99, 0.84, 0.09, 0];
Math.random = () => chaosQueue.shift() ?? 0;
const triggeredChaos = chaosInterrupt(
    { GOAL: 'take the bill', ActionTargets: ['Seraphina'] },
    [{ NPC: 'Seraphina' }, { NPC: 'Mira' }],
    'busy public market square',
    chaosRolls,
);
assert.equal(chaosRolls.length, 5);
assert.equal(triggeredChaos.CHAOS.triggered, true);
assert.equal(triggeredChaos.CHAOS.ctx, 'PUBLIC');
assert.equal(triggeredChaos.CHAOS.band, 'BENEFICIAL');
assert.equal(triggeredChaos.CHAOS.magnitude, 'EXTREME');
assert.equal(triggeredChaos.CHAOS.anchor, 'KNOWN_NPC');
assert.equal(triggeredChaos.CHAOS.vector, 'CROWD');
assert.equal(triggeredChaos.CHAOS.personVector, false);

chaosRolls = [];
chaosQueue = [0, 0.2, 0.2, 0.2, 0.2];
Math.random = () => chaosQueue.shift() ?? 0;
const quietChaos = chaosInterrupt(
    { GOAL: 'ask directions', ActionTargets: ['Seraphina'] },
    [{ NPC: 'Seraphina' }],
    'quiet private room',
    chaosRolls,
);
assert.equal(chaosRolls.length, 5);
assert.equal(quietChaos.CHAOS.triggered, false);
assert.equal(quietChaos.CHAOS.band, 'None');
assert.equal(quietChaos.CHAOS.ctx, 'ISOLATED');

const proactiveTracker = createTracker();
proactiveTracker.user.stats = stats;
proactiveTracker.presentNpcIds = ['seraphina'];
proactiveTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 2, F: 3, H: 3 },
    rapport: 0,
    rapportEncounterLock: 'Y',
    intimacyGate: 'DENY',
    coreStats: { PHY: 2, MND: 2, CHA: 2 },
    override: 'NONE',
};
let proactiveRolls = [];
let proactiveQueue = [0.49];
Math.random = () => proactiveQueue.shift() ?? 0;
const proactivity = npcProactivityEngine(
    [{
        NPC: 'Seraphina',
        FinalState: 'B2/F3/H3',
        Lock: 'FREEZE',
        Target: 'FearHostility',
        NPC_STAKES: 'N',
        Override: 'NONE',
        Landed: 'Y',
        IntimacyGate: 'DENY',
    }],
    { GOAL: 'IntimacyAdvancePhysical', LandedActions: '(none)', ActionTargets: ['Seraphina'], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    proactiveTracker,
    proactiveRolls,
);
assert.equal(proactivity.Seraphina.Proactive, 'Y');
assert.equal(proactivity.Seraphina.Intent, 'BOUNDARY_PHYSICAL');
assert.equal(proactivity.Seraphina.Impulse, 'ANGER');
assert.equal(proactivity.Seraphina.TargetsUser, 'Y');
assert.equal(proactivity.Seraphina.ProactivityTier, 'HIGH');
assert.equal(proactivity.Seraphina.ProactivityDie, 10);
assert.equal(proactivity.Seraphina.Threshold, 8);

let aggressionRolls = [];
let aggressionQueue = [0.74, 0.04];
Math.random = () => aggressionQueue.shift() ?? 0;
const aggression = npcAggressionResolution(proactivity, proactiveTracker, aggressionRolls);
assert.equal(aggression.Seraphina.ReactionOutcome, 'npc_overpowers');
assert.equal(aggression.Seraphina.Margin, 12);
assert.equal(aggression.Seraphina.npcTotal, 17);
assert.equal(aggression.Seraphina.userTotal, 5);
assert.equal(aggressionRolls.length, 2);

proactiveRolls = [];
proactiveQueue = [];
Math.random = () => proactiveQueue.shift() ?? 0;
const forcedProactivity = npcProactivityEngine(
    [{
        NPC: 'Seraphina',
        FinalState: 'B2/F3/H3',
        Lock: 'FREEZE',
        Target: 'No Change',
        NPC_STAKES: 'N',
        Override: 'NONE',
        Landed: 'N',
        IntimacyGate: 'DENY',
    }],
    { GOAL: 'failed strike', LandedActions: 0, ActionTargets: ['Seraphina'], OppTargets: { ENV: [] }, CounterPotential: 'medium' },
    { CHAOS: { triggered: false, band: 'None' } },
    proactiveTracker,
    proactiveRolls,
);
assert.equal(forcedProactivity.Seraphina.Proactive, 'Y');
assert.equal(forcedProactivity.Seraphina.ProactivityTier, 'FORCED');
assert.equal(forcedProactivity.Seraphina.ProactivityDie, 20);
assert.equal(forcedProactivity.Seraphina.Threshold, 'AUTO');
assert.equal(forcedProactivity.Seraphina.CounterPotential, 'medium');
assert.equal(forcedProactivity.Seraphina.CounterBonus, 2);
assert.equal(proactiveRolls.length, 0);

proactiveRolls = [];
proactiveQueue = [0.49];
Math.random = () => proactiveQueue.shift() ?? 0;
const hatredInitiative = npcProactivityEngine(
    [{
        NPC: 'Seraphina',
        FinalState: 'B1/F2/H4',
        Lock: 'HATRED',
        Target: 'No Change',
        NPC_STAKES: 'N',
        Override: 'NONE',
        Landed: 'N',
        IntimacyGate: 'DENY',
    }],
    { GOAL: 'ordinary presence', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    proactiveTracker,
    proactiveRolls,
);
assert.equal(hatredInitiative.Seraphina.Proactive, 'Y');
assert.equal(hatredInitiative.Seraphina.Impulse, 'ANGER');
assert.equal(hatredInitiative.Seraphina.Intent, 'ESCALATE_VIOLENCE');
assert.equal(hatredInitiative.Seraphina.TargetsUser, 'Y');
assert.equal(hatredInitiative.Seraphina.ProactivityTier, 'MEDIUM');
assert.equal(hatredInitiative.Seraphina.Threshold, 10);

proactiveRolls = [];
proactiveQueue = [0.74];
Math.random = () => proactiveQueue.shift() ?? 0;
const girlfriendInitiative = npcProactivityEngine(
    [{
        NPC: 'Seraphina',
        FinalState: 'B4/F1/H1',
        Lock: 'None',
        Target: 'No Change',
        NPC_STAKES: 'N',
        Override: 'NONE',
        Landed: 'N',
        IntimacyGate: 'ALLOW',
    }],
    { GOAL: 'walk together', LandedActions: '(none)', ActionTargets: [], OppTargets: { ENV: [] }, CounterPotential: 'none' },
    { CHAOS: { triggered: false, band: 'None' } },
    proactiveTracker,
    proactiveRolls,
);
assert.equal(girlfriendInitiative.Seraphina.Proactive, 'Y');
assert.equal(girlfriendInitiative.Seraphina.Impulse, 'BOND');
assert.equal(girlfriendInitiative.Seraphina.Intent, 'INTIMACY_OR_FLIRT');
assert.equal(girlfriendInitiative.Seraphina.TargetsUser, 'N');
assert.equal(girlfriendInitiative.Seraphina.ProactivityTier, 'MEDIUM');
assert.equal(girlfriendInitiative.Seraphina.Threshold, 10);

const ambientFriendTracker = createTracker();
ambientFriendTracker.user.stats = stats;
ambientFriendTracker.presentNpcIds = ['seraphina'];
ambientFriendTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 4, F: 1, H: 1 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'ALLOW',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
let ambientQueue = [0, 0, 0, 0, 0, 0.74];
Math.random = () => ambientQueue.shift() ?? 0;
const ambientFriendResult = resolveTurn({
    ooc: 'N',
    goal: 'walk through the garden',
    goalKind: 'Normal',
    goalEvidence: 'I walk through the garden.',
    decisiveAction: 'walk through the garden',
    decisiveActionEvidence: 'I walk through the garden.',
    outcomeOnSuccess: '',
    outcomeOnFailure: '',
    actionTargets: [],
    oppTargetsNpc: [],
    oppTargetsEnv: [],
    benefitedObservers: [],
    harmedObservers: [],
    npcInScene: [],
    hasStakes: 'N',
    stakesEvidence: 'Harmless movement with no explicit obstacle.',
    actionCount: 1,
    userStat: 'PHY',
    userStatEvidence: 'walk',
    oppStat: 'ENV',
    oppStatEvidence: '',
    hostilePhysicalHarm: 'N',
    newEncounter: 'N',
    scene: { location: '', time: '', weather: '' },
    npcFacts: [],
    inventoryDeltas: [],
}, ambientFriendTracker, { userStats: stats });
assert.equal(ambientFriendResult.npcHandoffs.length, 0);
assert.equal(ambientFriendResult.proactivityHandoff.Seraphina.Proactive, 'Y');
assert.equal(ambientFriendResult.proactivityHandoff.Seraphina.Intent, 'INTIMACY_OR_FLIRT');
assert.equal(ambientFriendResult.proactivityHandoff.Seraphina.ProactivityTier, 'MEDIUM');
assert.equal(ambientFriendResult.chaosHandoff.CHAOS.triggered, false);
assert.deepEqual(ambientFriendResult.tracker.presentNpcIds, ['seraphina']);

const ambientBanterTracker = createTracker();
ambientBanterTracker.user.stats = stats;
ambientBanterTracker.presentNpcIds = ['mira'];
ambientBanterTracker.npcs.mira = {
    id: 'mira',
    name: 'Mira',
    present: true,
    disposition: { B: 3, F: 1, H: 2 },
    rapport: 2,
    rapportEncounterLock: 'Y',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 3, MND: 4, CHA: 4 },
    override: 'NONE',
};
ambientQueue = [0, 0, 0, 0, 0, 0.74];
Math.random = () => ambientQueue.shift() ?? 0;
const ambientBanterResult = resolveTurn({
    ooc: 'N',
    goal: 'sort my backpack',
    goalKind: 'Normal',
    goalEvidence: 'I sort my backpack by the fountain.',
    decisiveAction: 'sort my backpack',
    decisiveActionEvidence: 'I sort my backpack by the fountain.',
    outcomeOnSuccess: '',
    outcomeOnFailure: '',
    actionTargets: [],
    oppTargetsNpc: [],
    oppTargetsEnv: [],
    benefitedObservers: [],
    harmedObservers: [],
    hasStakes: 'N',
    stakesEvidence: 'No risk, contest, cost, or meaningful consequence is stated.',
    actionCount: 1,
    userStat: 'MND',
    oppStat: 'ENV',
    hostilePhysicalHarm: 'N',
    npcInScene: [],
    npcFacts: [],
    inventoryDeltas: [],
}, ambientBanterTracker, { userStats: stats });
assert.equal(ambientBanterResult.npcHandoffs.length, 0);
assert.equal(ambientBanterResult.proactivityHandoff.Mira.Proactive, 'Y');
assert.equal(ambientBanterResult.proactivityHandoff.Mira.Intent, 'PLAN_OR_BANTER');
assert.equal(ambientBanterResult.proactivityHandoff.Mira.Impulse, 'BOND');
assert.equal(ambientBanterResult.proactivityHandoff.Mira.ProactivityTier, 'MEDIUM');

const fullChainTracker = createTracker();
fullChainTracker.user.stats = stats;
fullChainTracker.presentNpcIds = ['seraphina'];
fullChainTracker.npcs.seraphina = {
    id: 'seraphina',
    name: 'Seraphina',
    present: true,
    disposition: { B: 2, F: 2, H: 2 },
    rapport: 0,
    rapportEncounterLock: 'N',
    intimacyGate: 'SKIP',
    coreStats: { PHY: 2, MND: 3, CHA: 3 },
    override: 'NONE',
};
let fullChainQueue = [0.49, 0.49, 0, 0, 0, 0, 0, 0.99, 0.99, 0];
Math.random = () => fullChainQueue.shift() ?? 0;
const fullChainResult = resolveTurn(directKissFallback, fullChainTracker, { userStats: stats });
assert.equal(fullChainResult.packet.IntimacyConsent, 'N');
assert.equal(fullChainResult.packet.STAKES, 'Y');
assert.equal(fullChainResult.chaosHandoff.CHAOS.triggered, false);
assert.equal(fullChainResult.proactivityHandoff.Seraphina.Proactive, 'Y');
assert.equal(fullChainResult.proactivityHandoff.Seraphina.Intent, 'BOUNDARY_PHYSICAL');
assert.equal(fullChainResult.aggressionResults.Seraphina.ReactionOutcome, 'npc_overpowers');
assert.ok(fullChainResult.audit.chaosHandoff);
assert.ok(fullChainResult.audit.proactivityHandoff);
assert.ok(fullChainResult.audit.aggressionResults);

Math.random = originalRandom;

console.log('engine tests passed');
