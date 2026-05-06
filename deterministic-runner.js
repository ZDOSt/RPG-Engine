import {
    createDice,
    hostilePhysicalOutcome,
    nonHostileOutcome,
    counterBonusFromPotential,
    aggressionReactionOutcome,
    classifyUserNonHuman,
    isDefaultGeneratedCore,
    initPreset,
    routeDispositionTarget,
    resolveStakeChangeByOutcome,
    applyMeaningfulBenefitReferee,
    relationToUserAction,
    proactivityRefereeGuard,
    updateRapport,
    applyPhysicalBoundaryPressure,
    applyHostilePhysicalPressure,
    deriveDirection,
    updateDisposition,
    classifyDisposition,
    checkThreshold,
    currentIntimacyGateAllows,
    getStakesOverrideEvidence,
    resolveIntimacyGate,
    getChaosContext,
    classifyBand,
    classifyMagnitude,
    pickAnchor,
    pickVector,
    classifyAction,
    deriveImpulse,
    classifyProactivityTier,
    thresholdFromTier,
    selectIntent,
    targetsUserFromIntent,
    isImmediateAttackIntent,
    isImmediateAttackIntentForType,
    buildNarrationGuidance,
    buildPersistencePolicy,
    trackerSummary,
    normalizeTrackerEntry,
    normalizeTargets,
    sanitizeTargets,
    sameTargets,
    targetSummary,
    normalizeNameKey,
    normalizeActionMarkers,
    normalizeCore,
    getUserCoreStats,
    statValue,
    normalizeMapStats,
    applyMapStatsHardRules,
    parseFinalState,
    deriveLock,
    landedBool,
    sameName,
    toRealArray,
    showNone,
    firstReal,
    isReal,
    bool,
    yn,
    unique,
    clamp,
    formatTargets,
    formatDisposition,
    compact,
    stableStringify,
} from './engines.js';

const NONE = '(none)';

export function buildTrackerSnapshot(context) {
    const source = context?.chatMetadata?.structuredPreflightTracker?.npcs || {};
    const snapshot = {};

    for (const [name, value] of Object.entries(source)) {
        snapshot[name] = normalizeTrackerEntry(value);
    }

    return snapshot;
}

export async function saveTrackerUpdate(context, trackerUpdate) {
    if (!context?.chatMetadata || !trackerUpdate?.npcs) return;

    const root = context.chatMetadata.structuredPreflightTracker || { npcs: {} };
    root.npcs = root.npcs || {};

    for (const [name, value] of Object.entries(trackerUpdate.npcs)) {
        root.npcs[name] = value;
    }

    context.chatMetadata.structuredPreflightTracker = root;

    if (typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    } else if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

export function runDeterministicEngines(ledger, trackerSnapshot, context, type) {
    const audit = [];
    const dice = createDice();
    const refereeContext = buildRefereeContext(context);
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit, refereeContext);
    const chaos = runChaos(ledger, relationships.handoffs, resolution.packet, dice, audit);
    const name = runNameGeneration(ledger, audit);
    const proactivity = runProactivity(ledger, relationships.handoffs, resolution.packet, chaos.handoff, dice, audit);
    const aggression = runAggression(ledger, trackerSnapshot, relationships.trackerUpdate, proactivity.results, resolution.packet, dice, audit);

    const trackerUpdate = { npcs: relationships.trackerUpdate };
    const finalNarrativeHandoff = {
        generationType: type || 'normal',
        resolutionPacket: resolution.packet,
        npcHandoffs: relationships.handoffs,
        chaosHandoff: chaos.handoff,
        nameGeneration: name,
        proactivityResults: proactivity.results,
        aggressionResults: aggression.results,
        persistencePolicy: buildPersistencePolicy(),
        resultLine: resolution.resultLine,
        narrationGuidance: buildNarrationGuidance(resolution.packet, relationships.handoffs, chaos.handoff, proactivity.results, aggression.results),
    };

    audit.push(`TRACKER_UPDATE_SAVED=${trackerSummary(trackerUpdate)}`);
    audit.push('RESULT_LINE=' + resolution.resultLine);

    return {
        auditLines: audit,
        semanticLedger: ledger,
        finalNarrativeHandoff,
        trackerUpdate,
    };
}

function runResolution(ledger, trackerSnapshot, dice, audit, context, refereeContext) {
    const semantic = ledger.resolutionEngine || {};
    const targetClassifier = buildTargetClassifier(ledger, trackerSnapshot, context);
    const rawTargets = normalizeTargets(semantic.identifyTargets);
    const intimacyReferee = applyIntimacyAdvanceHardRules(semantic, audit);
    const intimacyAdvance = String(intimacyReferee.value || 'none').toLowerCase();
    let goal = intimacyAdvance === 'physical'
        ? 'IntimacyAdvancePhysical'
        : intimacyAdvance === 'verbal'
            ? 'IntimacyAdvanceVerbal'
            : String(semantic.identifyGoal || 'Normal_Interaction');
    if (goal === 'IntimacyAdvancePhysical' && intimacyReferee.value === 'verbal') {
        goal = 'IntimacyAdvanceVerbal';
    }
    const semanticHasStakes = bool(semantic.hasStakes) ? 'Y' : 'N';
    const preliminaryTargets = sanitizeTargets(rawTargets, targetClassifier, { hasStakes: 'Y', goal, intimacyConsent: 'N' });

    const rollPool = [dice.d20(), dice.d20(), dice.d20(), dice.d20(), dice.d20(), dice.d20()];
    audit.push('STEP 1: SILENT SEMANTIC PASS COMPLETE');
    audit.push('SEMANTIC_LEDGER=');
    audit.push(stableStringify(ledger));
    if (ledger.deterministicOverrides?.semanticLedgerExtraction) {
        audit.push(`SEMANTIC_LEDGER_EXTRACTION=${compact(ledger.deterministicOverrides.semanticLedgerExtraction)}`);
    }
    if (ledger.deterministicOverrides?.semanticLedgerRepair) {
        audit.push(`SEMANTIC_LEDGER_REPAIR=${compact(ledger.deterministicOverrides.semanticLedgerRepair)}`);
    }
    if (ledger.deterministicOverrides?.userCoreStats) {
        audit.push(`DETERMINISTIC_OVERRIDE.userCoreStats=${compact(ledger.deterministicOverrides.userCoreStats)}`);
    }
    audit.push('---');
    audit.push('STEP 2: EXECUTE ResolutionEngine(input) USING SEMANTIC_LEDGER');
    audit.push(`2.0 roll_pool=[r0=${rollPool[0]},r1=${rollPool[1]},r2=${rollPool[2]},r3=${rollPool[3]},r4=${rollPool[4]},r5=${rollPool[5]}]`);
    audit.push(`2.1 identifyGoal=${goal}`);
    audit.push(`2.1a identifyChallenge=${semantic.identifyChallenge || semantic.explicitMeans || goal}`);
    audit.push(`2.2 identifyTargets.semantic=${formatTargets(rawTargets)}`);

    const intimacyTarget = firstReal(preliminaryTargets.ActionTargets);
    const semanticRelationship = (ledger.relationshipEngine || []).find(item => sameName(item?.NPC, intimacyTarget)) || {};
    const targetState = trackerSnapshot[intimacyTarget] || null;
    const preliminaryInitFlags = applyInitFlagReferee(semanticRelationship.initFlags || {}, refereeContext, audit, `2.3 checkIntimacyGate.initPreset(${intimacyTarget || NONE})`);
    const preliminaryDisposition = targetState?.currentDisposition || initPreset(preliminaryInitFlags).disposition;
    const preliminaryThreshold = checkThreshold(preliminaryDisposition, semanticRelationship.overrideFlags || {});
    const intimacyAllowance = currentIntimacyGateAllows(targetState, preliminaryDisposition, preliminaryThreshold);
    const intimacyConsent = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)
        && intimacyAllowance.allows
        ? 'Y'
        : 'N';
    audit.push(`2.3 checkIntimacyGate=${intimacyConsent}`);
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)) {
        audit.push(`2.3a checkIntimacyGate.threshold=${compact(preliminaryThreshold)}`);
        audit.push(`2.3b checkIntimacyGate.evidence=${compact(intimacyAllowance)}`);
    }

    const isIntimacyAdvance = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal);
    const stakesOverrideEvidence = getStakesOverrideEvidence(goal, intimacyTarget, targetState, preliminaryDisposition, preliminaryThreshold, intimacyAllowance, semanticHasStakes, intimacyConsent);
    const hasStakes = stakesOverrideEvidence?.hasStakes || semanticHasStakes;
    const stakesRule = stakesOverrideEvidence?.rule || (isIntimacyAdvance ? 'semantic_final_intimacy_no_hard_override' : 'semantic_final');
    audit.push(`2.4a semanticHasStakes=${semanticHasStakes}`);
    audit.push(`2.4b deterministicStakesRule=${stakesRule}`);
    if (stakesOverrideEvidence) {
        audit.push(`2.4c deterministicStakesEvidence=${compact(stakesOverrideEvidence.evidence)}`);
    }
    audit.push(`2.4 hasStakes=${hasStakes}`);

    const targets = sanitizeTargets(rawTargets, targetClassifier, { hasStakes, goal, intimacyConsent });
    audit.push(`2.4d identifyTargets.final=${formatTargets(targets)}`);
    if (!sameTargets(rawTargets, targets)) {
        audit.push(`2.4e deterministicTargetSanitizer=${compact({
            reason: hasStakes === 'N'
                ? 'living targets only; non-living blockers moved to ENV; no-stakes living opposition converted to ActionTargets'
                : 'living targets only; non-living blockers moved to ENV; direct targets removed from observer lists',
            from: targetSummary(rawTargets),
            to: targetSummary(targets),
        })}`);
    }

    const npcInScene = unique([
        ...targets.ActionTargets,
        ...targets.OppTargets.NPC,
        ...targets.BenefitedObservers,
        ...targets.HarmedObservers,
        ...ledger.relationshipEngine.map(x => x.NPC).filter(name => targetClassifier.isLiving(name)),
    ].filter(name => isReal(name) && targetClassifier.isLiving(name)));
    audit.push(`2.5 NPCInScene=[${npcInScene.join(',') || NONE}]`);

    let actions = ['a1'];
    let outcome = {
        OutcomeTier: 'NONE',
        LandedActions: '(none)',
        Outcome: 'no_roll',
        CounterPotential: 'none',
    };
    let resultLine = 'No roll';
    let hostilePhysical = false;

    if (hasStakes === 'N') {
        audit.push('2.6 hasStakes=N');
        audit.push('2.6a actions=[a1]');
        audit.push(`2.6b resolveOutcome=${compact(outcome)}`);
    } else {
        actions = normalizeActionMarkers(semantic.actionCount);
        const semanticMapStats = normalizeMapStats(semantic.mapStats);
        let { userStat, oppStat } = applyMapStatsHardRules(semantic, goal, targets, semanticMapStats, audit, { intimacyConsent });
        const userCore = getUserCoreStats(ledger);
        let targetCore = null;
        const oppTargetsNpcFirst = firstReal(targets.OppTargets.NPC);
        const currentTargetCore = oppTargetsNpcFirst ? trackerSnapshot[oppTargetsNpcFirst]?.currentCoreStats : null;
        if (oppStat !== 'ENV' && !oppTargetsNpcFirst) {
            oppStat = 'ENV';
        }

        audit.push('2.7 hasStakes=Y');
        audit.push(`2.7a actionCount=[${actions.join(',')}]`);
        audit.push(`2.7b actions=[${actions.join(',')}]`);
        audit.push(`2.7c mapStats={USER:${userStat},OPP:${oppStat}}`);
        audit.push(`2.7d getUserCoreStats=${compact(userCore)}`);
        audit.push('2.7e targetCore=(none)');

        if (oppStat !== 'ENV') {
            audit.push('2.7f mapStats.OPP!=ENV');
            audit.push(`2.7g OppTargets.NPC[0]=${oppTargetsNpcFirst || NONE}`);
            if (currentTargetCore) {
                targetCore = normalizeCore(currentTargetCore, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${oppTargetsNpcFirst})=${compact(targetCore)}`);
                audit.push(`2.7n targetCore=${compact(targetCore)}`);
            } else {
                const generatedCoreSource = chooseGeneratedCore(ledger, semantic, oppTargetsNpcFirst);
                targetCore = normalizeCore(generatedCoreSource.core, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${oppTargetsNpcFirst || NONE})=missing`);
                audit.push('2.7i missing -> genStats');
                if (generatedCoreSource.source !== 'resolutionEngine.genStats') {
                    audit.push(`2.7i.1 genStats source=${generatedCoreSource.source}`);
                }
                audit.push(`2.7j genStats.Rank=${generatedCoreSource.core?.Rank || 'none'}`);
                audit.push(`2.7k genStats.MainStat=${generatedCoreSource.core?.MainStat || 'none'}`);
                audit.push(`2.7l genStats=${compact(targetCore)}`);
                audit.push(`2.7m targetCore=${compact(targetCore)}`);
                if (generatedCoreSource.defaultFallback) {
                    audit.push('2.7m.1 genStatsDefaultFallback=not persisted as explicit NPC stats');
                }
            }
        }

        const atkDie = rollPool[0];
        const defDie = rollPool[1];
        const atkTot = atkDie + statValue(userCore, userStat);
        const defTot = oppStat === 'ENV' ? defDie : defDie + statValue(targetCore, oppStat);
        const margin = atkTot - defTot;
        const hostileReferee = applyHostilePhysicalIntentHardRules(semantic, audit);
        const hostilePhysicalIntent = hostileReferee.value;
        hostilePhysical = userStat === 'PHY' && hostilePhysicalIntent;

        if (hostilePhysical) {
            outcome = hostilePhysicalOutcome(margin, actions.length);
        } else {
            outcome = nonHostileOutcome(margin);
        }

        audit.push(`2.7o resolveOutcome=atkDie:${atkDie}, atkTot:${atkTot}, defDie:${defDie}, defTot:${defTot}, margin:${margin}, classifyHostilePhysicalIntent:${hostilePhysical ? 'Y' : 'N'} -> ${compact(outcome)}`);
        resultLine = `1d20(${atkDie}) + ${userStat}(${statValue(userCore, userStat)}) = ${atkTot} vs 1d20(${defDie})${oppStat === 'ENV' ? '' : ` + ${oppStat}(${statValue(targetCore, oppStat)})`} = ${defTot} -> ${outcome.OutcomeTier}`;
    }

    const boundaryReferee = applyPhysicalBoundaryPressureHardRules(semantic, targets, {
        hasStakes,
        hostilePhysical,
        goal,
    }, audit);

    const packet = {
        GOAL: goal,
        actions,
        IntimacyConsent: intimacyConsent,
        STAKES: hasStakes,
        LandedActions: outcome.LandedActions,
        OutcomeTier: outcome.OutcomeTier,
        Outcome: outcome.Outcome,
        CounterPotential: outcome.CounterPotential,
        classifyHostilePhysicalIntent: hostilePhysical ? 'Y' : 'N',
        classifyPhysicalBoundaryPressure: boundaryReferee.value ? 'Y' : 'N',
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCInScene: showNone(npcInScene),
    };

    audit.push(`2.8 HANDOFF=${compact(packet)}`);
    audit.push('---');

    return { packet, resultLine };
}

function runRelationships(ledger, trackerSnapshot, resolutionPacket, audit, refereeContext) {
    const resolutionSemantic = ledger.resolutionEngine || {};
    const semanticMap = new Map((ledger.relationshipEngine || []).filter(x => x?.NPC).map(x => [x.NPC, x]));
    const npcList = toRealArray(resolutionPacket.NPCInScene);
    const handoffs = [];
    const trackerUpdate = {};

    audit.push('STEP 3: EXECUTE RelationshipEngine(npc, resolutionPacket) USING SEMANTIC_LEDGER');
    audit.push(`3.1 NPC_LIST=[${npcList.join(',') || NONE}]`);

    for (const npc of npcList) {
        const sem = semanticMap.get(npc) || { NPC: npc, relevant: false, initFlags: {}, stakeChangeByOutcome: {}, overrideFlags: {} };
        const relevant = bool(sem.relevant) ? 'Y' : 'N';
        audit.push(`3.2 ${npc}.relevant=${relevant}`);

        if (relevant === 'N') {
            const handoff = {
                NPC: npc,
                FinalState: 'UNINITIALIZED',
                Lock: 'None',
                Behavior: 'None',
                Target: 'No Change',
                NPC_STAKES: 'N',
                Override: 'NONE',
                Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
                OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
                NarrationBand: resolutionPacket.Outcome || 'standard',
                IntimacyGate: 'SKIP',
            };
            handoffs.push(handoff);
            audit.push(`3.2a NPC_HANDOFF=${compact(handoff)}`);
            continue;
        }

        const state = normalizeTrackerEntry(trackerSnapshot[npc] || {});
        const newEncounter = bool(sem.newEncounterExplicit) ? 'Y' : 'N';
        let rapportEncounterLock = newEncounter === 'Y' ? 'N' : state.rapportEncounterLock;
        let currentDisposition = state.currentDisposition;
        let currentRapport = state.currentRapport;
        let hostilePressure = state.hostilePressure;
        let hostileLandedPressure = state.hostileLandedPressure;
        let dominantLock = state.dominantLock;
        let pressureMode = state.pressureMode;

        audit.push(`3.3 getCurrentRelationalState=${compact(state)}`);
        audit.push(`3.3a newEncounterExplicit=${newEncounter}`);
        audit.push(`3.3b rapportEncounterLock=${rapportEncounterLock}`);

        if (!currentDisposition) {
            const effectiveInitFlags = applyInitFlagReferee(sem.initFlags || {}, refereeContext, audit, `3.3 ${npc}.initPreset`);
            const init = initPreset(effectiveInitFlags);
            currentDisposition = init.disposition;
            audit.push(`3.3d initPreset.activeEnemy=${yn(effectiveInitFlags.activeEnemy)}`);
            audit.push(`3.3e initPreset.romanticOpen=${yn(effectiveInitFlags.romanticOpen)}`);
            audit.push(`3.3f initPreset.userBadRep=${yn(effectiveInitFlags.userBadRep)}`);
            audit.push(`3.3g initPreset.userGoodRep=${yn(effectiveInitFlags.userGoodRep)}`);
            audit.push(`3.3h initPreset.userNonHuman=${yn(effectiveInitFlags.userNonHuman)} fearImmunity=${yn(effectiveInitFlags.fearImmunity)}`);
            audit.push(`3.3i initPreset=${init.label}`);
            audit.push(`3.3j currentDisposition=${formatDisposition(currentDisposition)}`);
        } else {
            audit.push(`3.3c currentDisposition=${formatDisposition(currentDisposition)}`);
        }

        audit.push(`3.3k currentRapport=${currentRapport}`);

        const isAllowed = resolutionPacket.IntimacyConsent;
        const outcomeKey = String(resolutionPacket.Outcome || 'no_roll');
        const stakeReferee = resolveStakeChangeByOutcome(npc, sem, resolutionPacket);
        const benefitReferee = applyMeaningfulBenefitReferee(npc, resolutionPacket, stakeReferee.value, {
            ...sem,
            identifyGoal: resolutionSemantic.identifyGoal,
            identifyChallenge: resolutionSemantic.identifyChallenge,
            explicitMeans: resolutionSemantic.explicitMeans,
        });
        const stakeChange = benefitReferee.value;
        const npcStakes = resolutionPacket.STAKES === 'Y' && ['benefit', 'harm'].includes(stakeChange) ? 'Y' : 'N';
        const auditInteraction = npcStakes === 'Y' && stakeChange === 'benefit' ? 'Y' : 'N';
        const routedTarget = routeDispositionTarget(npc, resolutionPacket, auditInteraction, isAllowed, sem);
        const boundaryPressureResult = applyPhysicalBoundaryPressure(npc, resolutionPacket, {
            currentDisposition,
        });
        const hostilePressureResult = applyHostilePhysicalPressure(npc, resolutionPacket, {
            currentDisposition,
            hostilePressure,
            hostileLandedPressure,
            dominantLock,
            pressureMode,
        });
        const target = hostilePressureResult?.target || boundaryPressureResult?.target || routedTarget;
        const rapport = updateRapport(currentRapport, target, rapportEncounterLock, hostilePressureResult ? 'hostilePressure' : 'normal');
        currentRapport = rapport.currentRapport;
        rapportEncounterLock = rapport.rapportEncounterLock;
        hostilePressure = hostilePressureResult?.hostilePressure ?? hostilePressure;
        hostileLandedPressure = hostilePressureResult?.hostileLandedPressure ?? hostileLandedPressure;
        dominantLock = hostilePressureResult?.dominantLock ?? dominantLock;
        pressureMode = hostilePressureResult?.pressureMode ?? pressureMode;

        audit.push(`3.4 isAllowed=${isAllowed}`);
        audit.push(`3.4a auditInteraction=stakeChangeByOutcome[${outcomeKey}]=${stakeChange} -> ${auditInteraction}`);
        if (stakeReferee.referee) {
            audit.push(`3.4a.1 deterministicStakeChangeReferee=${compact(stakeReferee.referee)}`);
        }
        if (benefitReferee.referee) {
            audit.push(`3.4a.2 deterministicBenefitReferee=${compact(benefitReferee.referee)}`);
        }
        audit.push(`3.4b NPC_STAKES=${npcStakes}`);
        audit.push(`3.4c routeDispositionTarget=${routedTarget}`);
        if (boundaryPressureResult) {
            audit.push(`3.4c.0 physicalBoundaryPressure=${compact({
                target,
                deltas: boundaryPressureResult.deltas,
            })}`);
        }
        if (hostilePressureResult) {
            audit.push(`3.4c.1 hostilePhysicalPressure=${compact({
                target,
                hostilePressure,
                hostileLandedPressure,
                dominantLock,
                pressureMode,
                deltas: hostilePressureResult.deltas,
            })}`);
        }
        audit.push(`3.4d updateRapport=${compact(rapport)}`);

        const deltas = hostilePressureResult?.deltas || boundaryPressureResult?.deltas || deriveDirection(target, currentDisposition, currentRapport, auditInteraction, resolutionPacket);
        const updatedDisposition = updateDisposition(currentDisposition, deltas);
        currentDisposition = updatedDisposition;
        if (hostilePressureResult?.dominatedFearBreak && currentDisposition.F >= 4 && currentDisposition.H >= 3) {
            currentDisposition = { ...currentDisposition, H: clamp(currentDisposition.H - 1, 1, 4) };
            audit.push(`3.5a.1 dominatedFearBreak lowers hostility -> ${formatDisposition(currentDisposition)}`);
        }
        currentRapport = deltas.rapportReset === 'Y' ? 0 : currentRapport;

        audit.push(`3.5 deriveDirection=${compact(deltas)}`);
        audit.push(`3.5a updateDisposition=${formatDisposition(updatedDisposition)}`);
        audit.push(`3.5e save currentRapport=${currentRapport} to sceneTracker`);
        audit.push(`3.5f save rapportEncounterLock=${rapportEncounterLock} to sceneTracker`);

        const classified = classifyDisposition(currentDisposition);
        const threshold = checkThreshold(currentDisposition, sem.overrideFlags || {});
        const resolvedGate = resolveIntimacyGate(state, threshold, currentDisposition, isAllowed, resolutionPacket.GOAL);
        const intimacyGate = resolvedGate.IntimacyGate;
        const intimacyGateSource = resolvedGate.IntimacyGateSource;
        const persistedGate = intimacyGate !== 'SKIP' && intimacyGateSource !== 'CURRENT_DENIED'
            ? intimacyGate
            : 'SKIP';
        const persistedGateSource = persistedGate === 'SKIP' ? 'NONE' : intimacyGateSource;

        audit.push(`3.6 classifyDisposition=${compact(classified)}`);
        audit.push(`3.6a checkThreshold=${compact(threshold)}`);
        audit.push(`3.6b IntimacyGate=${intimacyGate}`);
        audit.push(`3.6c IntimacyGateSource=${intimacyGateSource}`);
        audit.push(`3.6d persistedIntimacyGate=${persistedGate}`);
        audit.push(`3.6e persistedIntimacyGateSource=${persistedGateSource}`);

        const handoff = {
            NPC: npc,
            FinalState: `B${currentDisposition.B}/F${currentDisposition.F}/H${currentDisposition.H}`,
            Lock: classified.lock,
            Behavior: classified.behavior,
            Target: target,
            NPC_STAKES: npcStakes,
            Override: threshold.Override,
            Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
            OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
            NarrationBand: resolutionPacket.Outcome || 'standard',
            IntimacyGate: intimacyGate,
            IntimacyGateSource: intimacyGateSource,
            HostilePressure: hostilePressure,
            HostileLandedPressure: hostileLandedPressure,
            BoundaryPressure: boundaryPressureResult ? 'Y' : 'N',
            DominantLock: dominantLock,
            PressureMode: pressureMode,
            RelationToUserAction: relationToUserAction(npc, resolutionPacket),
        };
        handoffs.push(handoff);

        const generatedCore = normalizeCore(sem.genStats, { PHY: 1, MND: 1, CHA: 1 });
        const coreStats = state.currentCoreStats || (isDefaultGeneratedCore(generatedCore) ? null : generatedCore);
        if (!state.currentCoreStats && !coreStats) {
            audit.push(`3.7a currentCoreStats not persisted for ${npc}: semantic genStats was default 1/1/1`);
        }
        trackerUpdate[npc] = {
            currentDisposition,
            currentRapport,
            rapportEncounterLock,
            intimacyGate: persistedGate,
            intimacyGateSource: persistedGateSource,
            currentCoreStats: coreStats,
            hostilePressure,
            hostileLandedPressure,
            dominantLock,
            pressureMode,
        };

        audit.push(`3.7 NPC_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoffs, trackerUpdate };
}

function runChaos(ledger, handoffs, resolutionPacket, dice, audit) {
    const diceList = {
        A: dice.d20(),
        O: dice.d20(),
        I: dice.d20(),
        anchorIdx: dice.d20(),
        vectorIdx: dice.d20(),
    };
    const sceneSummary = ledger.chaosSemantic?.sceneSummary || '';
    const ctx = getChaosContext(handoffs, sceneSummary);

    audit.push('STEP 4: EXECUTE CHAOS_INTERRUPT');
    audit.push(`4.1a step_context={GOAL:${resolutionPacket.GOAL},ActionTargets:${compact(resolutionPacket.ActionTargets)}}`);
    audit.push(`4.1b step_handoffs=${compact(handoffs)}`);
    audit.push(`4.1c sceneSummary=${sceneSummary}`);
    audit.push(`4.1d diceList=${compact(diceList)}`);
    audit.push(`4.2 getCtx=${ctx}`);

    let handoff;
    if (diceList.A < 17) {
        handoff = { CHAOS: { triggered: false, band: 'None', magnitude: 'None', anchor: 'None', vector: 'None', personVector: false, fullText: null } };
        audit.push(`4.2b A=${diceList.A}<17 -> CHAOS_HANDOFF=${compact(handoff)}`);
    } else {
        const band = classifyBand(diceList.O);
        const magnitude = classifyMagnitude(diceList.O);
        const anchor = pickAnchor(diceList.anchorIdx);
        const vector = pickVector(ctx, diceList.I, diceList.vectorIdx);
        const personVector = vector === 'NPC' || vector === 'AUTHORITY';
        handoff = { CHAOS: { triggered: true, band, magnitude, anchor, vector, personVector, fullText: null } };
        audit.push(`4.3 classifyBand=${band}`);
        audit.push(`4.3c classifyMagnitude=${magnitude}`);
        audit.push(`4.3e pickAnchor=${anchor}`);
        audit.push(`4.3g pickVector=${vector}`);
        audit.push(`4.3h personVector=${personVector ? 'Y' : 'N'}`);
        audit.push(`4.3i CHAOS_HANDOFF=${compact(handoff)}`);
    }

    audit.push('---');
    return { handoff };
}

function runNameGeneration(ledger, audit) {
    const sem = ledger.nameSemantic || {};
    const result = {
        nameRequired: yn(sem.nameRequired),
        explicitNameKnown: yn(sem.explicitNameKnown),
        isLocation: yn(sem.isLocation),
        seed: sem.seed || NONE,
        normalizeSeed: sem.normalizeSeed || NONE,
        detectMode: sem.detectMode || 'none',
        generatedName: bool(sem.nameRequired) ? (sem.generatedName || NONE) : NONE,
    };
    audit.push('STEP 5: EXECUTE NameGenerationEngine');
    audit.push(`5.1 nameRequired=${result.nameRequired}`);
    audit.push(`5.1h generatedName=${result.generatedName}`);
    audit.push('---');
    return result;
}

function runProactivity(ledger, handoffs, resolutionPacket, chaosHandoff, dice, audit) {
    const kind = classifyAction(resolutionPacket);
    const chaosBand = chaosHandoff.CHAOS?.triggered ? chaosHandoff.CHAOS.band : 'None';
    const counterPotential = resolutionPacket.CounterPotential || 'none';
    const cap = clamp(Number(ledger.proactivitySemantic?.cap || 1), 1, 3);
    const candidates = [];
    const results = {};

    audit.push('STEP 6: EXECUTE NPCProactivityEngine');
    audit.push(`6.2 classifyAction=${kind}`);
    audit.push(`6.2a chaosBand=${chaosBand}`);
    audit.push(`6.2b counterPotential=${counterPotential}`);
    audit.push(`6.2c cap=${cap}`);

    for (const handoff of handoffs) {
        const fin = parseFinalState(handoff.FinalState);
        const lock = handoff.Lock && handoff.Lock !== 'None' ? handoff.Lock : deriveLock(fin);
        const impulse = deriveImpulse(kind, lock, fin, handoff.IntimacyGate, handoff.PressureMode, handoff.Target);
        const proactivityGuard = proactivityRefereeGuard(handoff, resolutionPacket);
        const tier = proactivityGuard
            ? 'DORMANT'
            : classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin);

        results[handoff.NPC] = {
            Proactive: 'N',
            Intent: 'NONE',
            Impulse: 'NONE',
            TargetsUser: 'N',
            ProactivityTier: tier,
        };

        audit.push(`6.3 FOR ${handoff.NPC}`);
        audit.push(`6.4 parseFinalState=${compact(fin)}`);
        audit.push(`6.4b lock=${lock}`);
        audit.push(`6.4f deriveImpulse=${impulse}`);
        audit.push(`6.4g classifyProactivityTier=${tier}`);
        if (proactivityGuard) {
            audit.push(`6.4g.1 proactivityRefereeGuard=${proactivityGuard}`);
        }

        if (tier === 'FORCED') {
            const intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override, handoff.PressureMode);
            const targetsUser = proactivityGuard ? 'N' : targetsUserFromIntent(intent);
            candidates.push({ NPC: handoff.NPC, die: 20, tier, intent, impulse, TargetsUser: targetsUser, Threshold: 'AUTO', passes: 'Y' });
            audit.push('6.4i FORCED candidate');
            continue;
        }

        const die = dice.d20();
        const threshold = thresholdFromTier(tier);
        const passes = die >= threshold ? 'Y' : 'N';
        audit.push(`6.5 proactivityDie=${die}`);
        audit.push(`6.5a thresholdFromTier=${threshold}`);
        audit.push(`6.5b passes=${passes}`);

        results[handoff.NPC].ProactivityDie = die;
        results[handoff.NPC].Threshold = threshold;

        if (passes === 'Y') {
            const intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override, handoff.PressureMode);
            const targetsUser = proactivityGuard ? 'N' : targetsUserFromIntent(intent);
            candidates.push({ NPC: handoff.NPC, die, tier, intent, impulse, TargetsUser: targetsUser, Threshold: threshold, passes });
            audit.push(`6.5c selectIntent=${intent}`);
            audit.push(`6.5e targetsUserFromIntent=${targetsUser}`);
        } else {
            audit.push('6.5c Proactive=N -> Intent=NONE, Impulse=NONE, TargetsUser=N');
        }
    }

    candidates.sort((a, b) => b.die - a.die);
    const selected = candidates.slice(0, cap);
    audit.push(`6.6 sortCandidates=${compact(candidates)}`);

    for (const candidate of selected) {
        results[candidate.NPC] = {
            Proactive: 'Y',
            Intent: candidate.intent,
            Impulse: candidate.impulse,
            TargetsUser: candidate.TargetsUser,
            ProactivityTier: candidate.tier,
            ProactivityDie: candidate.die,
            Threshold: candidate.Threshold,
        };
    }

    audit.push(`6.8 FINAL_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}

function runAggression(ledger, trackerSnapshot, trackerUpdate, proactivityResults, resolutionPacket, dice, audit) {
    const userCore = getUserCoreStats(ledger);
    const counterPotential = resolutionPacket?.CounterPotential || 'none';
    const counterAllowed = ['light', 'medium', 'severe'].includes(counterPotential);
    const counterBonus = counterBonusFromPotential(counterPotential);
    const criticalSuccess = resolutionPacket?.OutcomeTier === 'Critical_Success';
    const retaliationAllowed = resolutionPacket?.classifyHostilePhysicalIntent === 'Y';
    const proactiveAttackAllowed = Object.values(proactivityResults || {}).some(result =>
        result?.Proactive === 'Y'
        && result?.TargetsUser === 'Y'
        && result?.Intent === 'ESCALATE_VIOLENCE');
    const attackType = criticalSuccess
        ? 'None'
        : counterAllowed
            ? 'CounterAttack'
            : retaliationAllowed
                ? 'Retaliation'
                : proactiveAttackAllowed
                    ? 'ProactiveAttack'
                    : 'None';
    const proactiveAggressive = Object.entries(proactivityResults).filter(([, result]) =>
        attackType !== 'None'
        &&
        result.Proactive === 'Y'
        && result.TargetsUser === 'Y'
        && isImmediateAttackIntentForType(result.Intent, attackType));
    const counterTarget = counterAllowed ? firstReal(resolutionPacket?.OppTargets?.NPC) || firstReal(resolutionPacket?.ActionTargets) : null;
    const aggressive = counterAllowed && !criticalSuccess && counterTarget
        ? [proactiveAggressive.find(([npc]) => sameName(npc, counterTarget)) || [counterTarget, {
            Proactive: 'Y',
            Intent: 'BOUNDARY_PHYSICAL',
            Impulse: 'ANGER',
            TargetsUser: 'Y',
            ProactivityTier: 'FORCED',
            ProactivityDie: 20,
            Threshold: 'AUTO',
        }]]
        : proactiveAggressive;
    const results = {};

    audit.push('STEP 7: EXECUTE NPCAggressionResolution');
    audit.push(`7.1 counterPotential=${counterPotential}`);
    audit.push(`7.1a counterBonus=${counterBonus}`);
    audit.push(`7.1b immediateAttackType=${attackType}`);
    audit.push(`7.1c counterTarget=${counterTarget || NONE}`);
    audit.push(`7.2 AggressionPresent=${aggressive.length ? 'Y' : 'N'}`);

        if (!aggressive.length) {
            if (criticalSuccess) audit.push('7.2a Critical_Success -> no immediate NPC attack roll');
            else if (counterAllowed) audit.push('7.2a no qualifying proactive counterattack');
            else if (retaliationAllowed) audit.push('7.2a no qualifying proactive retaliation');
            else if (proactiveAttackAllowed) audit.push('7.2a no qualifying proactive attack');
            else audit.push('7.2a no immediate counterattack/retaliation trigger');
        audit.push('7.2a AGGRESSION_RESULTS={}');
        audit.push('---');
        return { results };
    }

    audit.push(`7.3 getUserCoreStats=${compact(userCore)}`);

    for (const [npc, proactivityResult] of aggressive) {
        const npcCore = normalizeCore(trackerUpdate[npc]?.currentCoreStats || trackerSnapshot[npc]?.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 });
        const npcDie = dice.d20();
        const userDie = dice.d20();
        const npcTotal = npcDie + npcCore.PHY + counterBonus;
        const userTotal = userDie + userCore.PHY;
        const margin = npcTotal - userTotal;
        const ReactionOutcome = aggressionReactionOutcome(margin);
        results[npc] = { AttackType: attackType, AttackIntent: proactivityResult.Intent, CounterPotential: counterPotential, CounterBonus: counterBonus, ReactionOutcome, Margin: margin };
        audit.push(`7.5 ${npc}.npcCore=${compact(npcCore)}`);
        audit.push(`7.5e npcTotal=${npcDie}+${npcCore.PHY}+${counterBonus}=${npcTotal}`);
        audit.push(`7.5f userTotal=${userDie}+${userCore.PHY}=${userTotal}`);
        audit.push(`7.6 AGGRESSION_RESULT=${compact(results[npc])}`);
    }

    audit.push(`7.7 AGGRESSION_RESULTS=${compact(results)}`);
    audit.push('---');
    return { results };
}






function chooseGeneratedCore(ledger, resolutionEngine, oppTargetsNpcFirst) {
    const resolutionCore = resolutionEngine?.genStats;
    if (!isDefaultGeneratedCore(resolutionCore)) {
        return { core: resolutionCore, source: 'resolutionEngine.genStats' };
    }

    const relationshipCore = (ledger.relationshipEngine || [])
        .find(item => sameName(item?.NPC, oppTargetsNpcFirst))
        ?.genStats;

    if (!isDefaultGeneratedCore(relationshipCore)) {
        return { core: relationshipCore, source: `relationshipEngine[${oppTargetsNpcFirst}].genStats` };
    }

    return { core: { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 }, source: 'engine default core fallback', defaultFallback: true };
}

function buildRefereeContext(context) {
    const fields = getCardFields(context);
    const userText = String(fields.persona ?? '');

    return {
        userNonHuman: classifyUserNonHuman(userText),
    };
}

function getCardFields(context) {
    try {
        return typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function applyInitFlagReferee(flags, refereeContext, audit, label) {
    const effective = { ...flags };
    const classification = refereeContext?.userNonHuman;
    if (bool(effective.activeEnemy)) {
        audit.push(`${label}.activeEnemy=Y`);
    }
    if (!classification || classification.value == null) return effective;

    const current = bool(effective.userNonHuman);
    if (current === classification.value) return effective;

    effective.userNonHuman = classification.value;
    audit.push(`${label}.userNonHumanReferee=${compact({
        hardRule: 'RelationshipEngine.initPreset: explicit user race/species evidence determines monster/non-typical userNonHuman flag',
        from: current,
        to: classification.value,
        source: classification.source,
        evidence: classification.evidence,
    })}`);
    return effective;
}

function applyIntimacyAdvanceHardRules(semantic, audit) {
    let value = ['physical', 'verbal', 'none'].includes(String(semantic.intimacyAdvance || '').toLowerCase())
        ? String(semantic.intimacyAdvance || '').toLowerCase()
        : 'none';
    const source = semanticSourceText(semantic);
    if (value === 'none' && semantic?.identifyGoal === 'IntimacyAdvancePhysical') value = 'physical';
    if (value === 'none' && semantic?.identifyGoal === 'IntimacyAdvanceVerbal') value = 'verbal';

    if (value === 'physical' && isVerbalIntimacyRequest(source) && !hasUserInitiatedIntimateContact(source)) {
        audit.push(`2.1b deterministicIntimacyAdvanceReferee=${compact({
            hardRule: 'ResolutionEngine.identifyGoal: asking/requesting/proposing intimacy is verbal unless the user attempts physical contact',
            from: 'physical',
            to: 'verbal',
            evidence: source.slice(0, 220),
        })}`);
        value = 'verbal';
    }

    return { value };
}

function applyHostilePhysicalIntentHardRules(semantic, audit) {
    const semanticValue = bool(semantic.classifyHostilePhysicalIntent);
    const source = semanticSourceText(semantic);

    if (semanticValue && isObjectBoundaryContest(source) && !hasDirectBodilyAggression(source)) {
        audit.push(`2.7o.1 deterministicHostilePhysicalIntentReferee=${compact({
            hardRule: 'ResolutionEngine.classifyHostilePhysicalIntent: forceful object/possession/space contest is not hostile physical intent unless the NPC body is attacked/restrained/controlled',
            from: 'Y',
            to: 'N',
            evidence: source.slice(0, 220),
        })}`);
        return { value: false };
    }

    return { value: semanticValue };
}

function applyPhysicalBoundaryPressureHardRules(semantic, targets, options, audit) {
    const source = semanticSourceText(semantic);
    const hasLivingOpposition = firstReal(targets.OppTargets?.NPC);
    let value = bool(semantic.classifyPhysicalBoundaryPressure);
    const hardBoundary = options.hasStakes === 'Y'
        && !options.hostilePhysical
        && hasLivingOpposition
        && isObjectBoundaryContest(source)
        && !hasDirectBodilyAggression(source);

    if (value && (options.hasStakes !== 'Y' || options.hostilePhysical || !hasLivingOpposition)) {
        audit.push(`2.7p deterministicPhysicalBoundaryPressureReferee=${compact({
            hardRule: 'ResolutionEngine.classifyPhysicalBoundaryPressure requires stakes-bearing living opposition and no hostilePhysicalIntent',
            from: 'Y',
            to: 'N',
            hasStakes: options.hasStakes,
            hostilePhysical: options.hostilePhysical ? 'Y' : 'N',
            hasLivingOpposition: hasLivingOpposition ? 'Y' : 'N',
        })}`);
        value = false;
    } else if (!value && hardBoundary) {
        audit.push(`2.7p deterministicPhysicalBoundaryPressureReferee=${compact({
            hardRule: 'ResolutionEngine.classifyPhysicalBoundaryPressure: forceful object/possession/space contest against resisting NPC applies boundary pressure',
            from: 'N',
            to: 'Y',
            evidence: source.slice(0, 220),
        })}`);
        value = true;
    }

    return { value };
}

function semanticSourceText(semantic) {
    return [
        semantic?.identifyGoal,
        semantic?.identifyChallenge,
        semantic?.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();
}

function isVerbalIntimacyRequest(source) {
    return /\b(will you|would you|could you|can you|may i|can i|could i|let me|please|ask(?:s|ed|ing)?|request(?:s|ed|ing)?|invite(?:s|d)?|propos(?:e|es|ed|ing)|want you to)\b.{0,80}\b(kiss|touch|hold|embrace|sleep with|sex|intimacy|intimate|bed|caress)\b/.test(source)
        || /\b(kiss|touch|hold|embrace|sleep with|sex|intimacy|intimate|bed|caress)\b.{0,80}\b(me|you|permission|allow|let)\b/.test(source);
}

function hasUserInitiatedIntimateContact(source) {
    return /\b(i|user|{{user}})\s+(?:try|tries|tried|attempt|attempts|attempted|lean|leans|leaned|move|moves|moved|reach|reaches|reached|press|presses|pressed|pull|pulls|pulled|grab|grabs|grabbed|touch|touches|touched|kiss|kisses|kissed|cup|cups|cupped|caress|caresses|caressed|grope|gropes|groped)\b/.test(source)
        && /\b(kiss|lips|mouth|touch|hold|embrace|body|waist|chin|face|cheek|neck|hair|hand|caress|grope|undress|clothes|shirt|dress|skirt|underwear)\b/.test(source);
}

function isObjectBoundaryContest(source) {
    const forcefulObject = /\b(snatch(?:es|ed|ing)?|grab(?:s|bed|bing)?|take(?:s|n)?|took|pull(?:s|ed|ing)?|yank(?:s|ed|ing)?|wrench(?:es|ed|ing)?|rip(?:s|ped|ping)?|steal(?:s|ing|stole|stolen)?|seize(?:s|d|ing)?|force(?:s|d|ing)? past|push(?:es|ed|ing)? past|shove(?:s|d)? past|barge(?:s|d|ing)?|open(?:s|ed|ing)?|unlock(?:s|ed|ing)?)\b/.test(source);
    const objectOrBoundary = /\b(scroll|book|letter|coin|purse|bag|weapon|sword|dagger|key|door|gate|chest|box|object|item|possession|path|passage|doorway|threshold|room|space|hand|table|desk|belt|pouch)\b/.test(source);
    return forcefulObject && objectOrBoundary;
}

function hasDirectBodilyAggression(source) {
    return /\b(punch(?:es|ed|ing)?|kick(?:s|ed|ing)?|strike(?:s|struck|striking)?|hit(?:s|ting)?|slash(?:es|ed|ing)?|stab(?:s|bed|bing)?|cut(?:s|ting)?|choke(?:s|d|ing)?|tackle(?:s|d|ing)?|slam(?:s|med|ming)?|shove(?:s|d|ing)?\s+(?:him|her|them|npc|guard|bandit|woman|man)|grab(?:s|bed|bing)?\s+(?:him|her|them|npc|guard|bandit|woman|man|wrist|arm|hand|throat|neck|shoulder|body|waist|hair|face|leg|ankle)\b|restrain(?:s|ed|ing)?|pin(?:s|ned|ning)?|immobiliz(?:e|es|ed|ing)|drag(?:s|ged|ging)?\s+(?:him|her|them|npc|guard|bandit|woman|man)|force(?:s|d|ing)?\s+(?:him|her|them|npc|guard|bandit|woman|man)\b|block(?:s|ed|ing)?\s+(?:his|her|their)?\s*(?:escape|movement))\b/.test(source);
}















































function buildTargetClassifier(ledger, trackerSnapshot, context) {
    const livingNames = new Set();

    for (const name of Object.keys(trackerSnapshot || {})) addLivingName(livingNames, name);
    for (const item of ledger.relationshipEngine || []) addLivingName(livingNames, item?.NPC);

    try {
        const fields = typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
        addLivingName(livingNames, fields?.name);
    } catch {
        // Non-fatal; semantic/tracker names are still available.
    }

    addLivingName(livingNames, context?.name2);
    addLivingName(livingNames, context?.name1);

    return {
        isLiving(name) {
            const normalized = normalizeNameKey(name);
            if (!normalized) return false;
            return livingNames.has(normalized);
        },
    };
}

function addLivingName(set, name) {
    const normalized = normalizeNameKey(name);
    if (normalized) set.add(normalized);
}

















