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
    const resolution = runResolution(ledger, trackerSnapshot, dice, audit, context);
    const relationships = runRelationships(ledger, trackerSnapshot, resolution.packet, audit);
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

function runResolution(ledger, trackerSnapshot, dice, audit, context) {
    const semantic = ledger.resolutionEngine || {};
    const targetClassifier = buildTargetClassifier(ledger, trackerSnapshot, context);
    const rawTargets = normalizeTargets(semantic.identifyTargets);
    const targets = sanitizeTargets(rawTargets, targetClassifier);
    const intimacyAdvance = String(semantic.intimacyAdvance || 'none').toLowerCase();
    const goal = intimacyAdvance === 'physical'
        ? 'IntimacyAdvancePhysical'
        : intimacyAdvance === 'verbal'
            ? 'IntimacyAdvanceVerbal'
            : String(semantic.identifyGoal || 'Normal_Interaction');
    semantic.primaryOppTarget = firstReal(targets.OppTargets.NPC) || NONE;

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
    audit.push(`2.2 identifyTargets=${formatTargets(targets)}`);
    if (!sameTargets(rawTargets, targets)) {
        audit.push(`2.2a deterministicTargetSanitizer=${compact({
            reason: 'living targets only; non-living blockers moved to ENV',
            from: targetSummary(rawTargets),
            to: targetSummary(targets),
        })}`);
    }

    const intimacyTarget = firstReal(targets.ActionTargets);
    const targetState = trackerSnapshot[intimacyTarget] || null;
    const intimacyConsent = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)
        && targetState
        && currentIntimacyGateAllows(targetState)
        ? 'Y'
        : 'N';
    audit.push(`2.3 checkIntimacyGate=${intimacyConsent}`);

    const semanticHasStakes = bool(semantic.hasStakes) ? 'Y' : 'N';
    const isIntimacyAdvance = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal);
    const stakesOverrideEvidence = getStakesOverrideEvidence(goal, intimacyTarget, targetState, semanticHasStakes, intimacyConsent);
    const hasStakes = stakesOverrideEvidence?.hasStakes || semanticHasStakes;
    const stakesRule = stakesOverrideEvidence?.rule || (isIntimacyAdvance ? 'semantic_final_intimacy_no_hard_override' : 'semantic_final');
    audit.push(`2.4a semanticHasStakes=${semanticHasStakes}`);
    audit.push(`2.4b deterministicStakesRule=${stakesRule}`);
    if (stakesOverrideEvidence) {
        audit.push(`2.4c deterministicStakesEvidence=${compact(stakesOverrideEvidence.evidence)}`);
    }
    audit.push(`2.4 hasStakes=${hasStakes}`);

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
        let { userStat, oppStat } = applyMapStatsHardRules(semantic, goal, targets, semanticMapStats, audit);
        const userCore = getUserCoreStats(ledger);
        let targetCore = null;
        const primaryOppTarget = firstReal(targets.OppTargets.NPC);
        const currentTargetCore = primaryOppTarget ? trackerSnapshot[primaryOppTarget]?.currentCoreStats : null;
        if (oppStat !== 'ENV' && !primaryOppTarget) {
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
            audit.push(`2.7g primaryOppTarget=${primaryOppTarget || NONE}`);
            if (currentTargetCore) {
                targetCore = normalizeCore(currentTargetCore, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${primaryOppTarget})=${compact(targetCore)}`);
                audit.push(`2.7n targetCore=${compact(targetCore)}`);
            } else {
                const generatedCoreSource = chooseGeneratedCore(ledger, semantic, primaryOppTarget);
                targetCore = normalizeCore(generatedCoreSource.core, { PHY: 1, MND: 1, CHA: 1 });
                audit.push(`2.7h getCurrentCoreStats(${primaryOppTarget || NONE})=missing`);
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
        const hostilePhysicalIntent = bool(semantic.classifyHostilePhysicalIntent);
        hostilePhysical = userStat === 'PHY' && hostilePhysicalIntent;

        if (hostilePhysical) {
            outcome = hostilePhysicalOutcome(margin, actions.length);
        } else {
            outcome = nonHostileOutcome(margin);
        }

        audit.push(`2.7o resolveOutcome=atkDie:${atkDie}, atkTot:${atkTot}, defDie:${defDie}, defTot:${defTot}, margin:${margin}, classifyHostilePhysicalIntent:${hostilePhysical ? 'Y' : 'N'} -> ${compact(outcome)}`);
        resultLine = `1d20(${atkDie}) + ${userStat}(${statValue(userCore, userStat)}) = ${atkTot} vs 1d20(${defDie})${oppStat === 'ENV' ? '' : ` + ${oppStat}(${statValue(targetCore, oppStat)})`} = ${defTot} -> ${outcome.OutcomeTier}`;
    }

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

function runRelationships(ledger, trackerSnapshot, resolutionPacket, audit) {
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
            const init = initPreset(sem.initFlags || {});
            currentDisposition = init.disposition;
            audit.push(`3.3e initPreset.romanticOpen=${yn(sem.initFlags?.romanticOpen)}`);
            audit.push(`3.3f initPreset.userBadRep=${yn(sem.initFlags?.userBadRep)}`);
            audit.push(`3.3g initPreset.userGoodRep=${yn(sem.initFlags?.userGoodRep)}`);
            audit.push(`3.3h initPreset.userNonHuman=${yn(sem.initFlags?.userNonHuman)} fearImmunity=${yn(sem.initFlags?.fearImmunity)}`);
            audit.push(`3.3i initPreset=${init.label}`);
            audit.push(`3.3j currentDisposition=${formatDisposition(currentDisposition)}`);
        } else {
            audit.push(`3.3c currentDisposition=${formatDisposition(currentDisposition)}`);
        }

        audit.push(`3.3k currentRapport=${currentRapport}`);

        const isAllowed = resolutionPacket.IntimacyConsent;
        const outcomeKey = String(resolutionPacket.Outcome || 'no_roll');
        const stakeChange = sem.stakeChangeByOutcome?.[outcomeKey] || 'none';
        const auditInteraction = resolutionPacket.STAKES === 'Y' && stakeChange === 'benefit' ? 'Y' : 'N';
        const routedTarget = routeDispositionTarget(npc, resolutionPacket, auditInteraction, isAllowed, sem);
        const hostilePressureResult = applyHostilePhysicalPressure(npc, resolutionPacket, {
            currentDisposition,
            hostilePressure,
            hostileLandedPressure,
            dominantLock,
            pressureMode,
        });
        const target = hostilePressureResult?.target || routedTarget;
        const rapport = updateRapport(currentRapport, target, rapportEncounterLock, hostilePressureResult ? 'hostilePressure' : 'normal');
        currentRapport = rapport.currentRapport;
        rapportEncounterLock = rapport.rapportEncounterLock;
        hostilePressure = hostilePressureResult?.hostilePressure ?? hostilePressure;
        hostileLandedPressure = hostilePressureResult?.hostileLandedPressure ?? hostileLandedPressure;
        dominantLock = hostilePressureResult?.dominantLock ?? dominantLock;
        pressureMode = hostilePressureResult?.pressureMode ?? pressureMode;

        audit.push(`3.4 isAllowed=${isAllowed}`);
        audit.push(`3.4a auditInteraction=stakeChangeByOutcome[${outcomeKey}]=${stakeChange} -> ${auditInteraction}`);
        audit.push(`3.4b NPC_STAKES=${auditInteraction}`);
        audit.push(`3.4c routeDispositionTarget=${routedTarget}`);
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

        const deltas = hostilePressureResult?.deltas || deriveDirection(target, currentDisposition, currentRapport, auditInteraction);
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
        const resolvedGate = resolveIntimacyGate(state, threshold, currentDisposition, isAllowed);
        const intimacyGate = resolvedGate.IntimacyGate;
        const intimacyGateSource = resolvedGate.IntimacyGateSource;

        audit.push(`3.6 classifyDisposition=${compact(classified)}`);
        audit.push(`3.6a checkThreshold=${compact(threshold)}`);
        audit.push(`3.6b IntimacyGate=${intimacyGate}`);
        audit.push(`3.6c IntimacyGateSource=${intimacyGateSource}`);

        const handoff = {
            NPC: npc,
            FinalState: `B${currentDisposition.B}/F${currentDisposition.F}/H${currentDisposition.H}`,
            Lock: classified.lock,
            Behavior: classified.behavior,
            Target: target,
            NPC_STAKES: auditInteraction,
            Override: threshold.Override,
            Landed: landedBool(resolutionPacket.LandedActions) ? 'Y' : 'N',
            OutcomeTier: resolutionPacket.OutcomeTier || 'NONE',
            NarrationBand: resolutionPacket.Outcome || 'standard',
            IntimacyGate: intimacyGate,
            IntimacyGateSource: intimacyGateSource,
            HostilePressure: hostilePressure,
            HostileLandedPressure: hostileLandedPressure,
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
            intimacyGate,
            intimacyGateSource,
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
    const attackType = criticalSuccess ? 'None' : counterAllowed ? 'CounterAttack' : retaliationAllowed ? 'Retaliation' : 'None';
    const proactiveAggressive = Object.entries(proactivityResults).filter(([, result]) =>
        attackType !== 'None'
        &&
        result.Proactive === 'Y'
        && result.TargetsUser === 'Y'
        && isImmediateAttackIntent(result.Intent));
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

function createDice() {
    return {
        d20() {
            return Math.floor(Math.random() * 20) + 1;
        },
    };
}

function hostilePhysicalOutcome(margin, actionLength) {
    let outcome;
    if (margin >= 8) outcome = { OutcomeTier: 'Critical_Success', LandedActions: 3, Outcome: 'dominant_impact', CounterPotential: 'none' };
    else if (margin >= 5) outcome = { OutcomeTier: 'Moderate_Success', LandedActions: 2, Outcome: 'solid_impact', CounterPotential: 'none' };
    else if (margin >= 1) outcome = { OutcomeTier: 'Minor_Success', LandedActions: 1, Outcome: 'light_impact', CounterPotential: 'none' };
    else if (margin === 0) outcome = { OutcomeTier: 'Stalemate', LandedActions: 0, Outcome: 'struggle', CounterPotential: 'none' };
    else if (margin >= -3) outcome = { OutcomeTier: 'Minor_Failure', LandedActions: 0, Outcome: 'checked', CounterPotential: 'light' };
    else if (margin >= -7) outcome = { OutcomeTier: 'Moderate_Failure', LandedActions: 0, Outcome: 'deflected', CounterPotential: 'medium' };
    else outcome = { OutcomeTier: 'Critical_Failure', LandedActions: 0, Outcome: 'avoided', CounterPotential: 'severe' };
    outcome.LandedActions = Math.min(outcome.LandedActions, actionLength);
    return outcome;
}

function nonHostileOutcome(margin) {
    if (margin >= 1) return { OutcomeTier: 'Success', LandedActions: '(none)', Outcome: 'success', CounterPotential: 'none' };
    if (margin === 0) return { OutcomeTier: 'Stalemate', LandedActions: '(none)', Outcome: 'struggle', CounterPotential: 'none' };
    return { OutcomeTier: 'Failure', LandedActions: '(none)', Outcome: 'failure', CounterPotential: 'none' };
}

function counterBonusFromPotential(counterPotential) {
    if (counterPotential === 'light') return 2;
    if (counterPotential === 'medium') return 4;
    if (counterPotential === 'severe') return 6;
    return 0;
}

function aggressionReactionOutcome(margin) {
    if (margin >= 5) return 'npc_overpowers';
    if (margin >= 1) return 'npc_succeeds';
    if (margin === 0) return 'stalemate';
    if (margin >= -3) return 'user_resists';
    return 'user_dominates';
}

function chooseGeneratedCore(ledger, resolutionEngine, primaryOppTarget) {
    const resolutionCore = resolutionEngine?.genStats;
    if (!isDefaultGeneratedCore(resolutionCore)) {
        return { core: resolutionCore, source: 'resolutionEngine.genStats' };
    }

    const relationshipCore = (ledger.relationshipEngine || [])
        .find(item => sameName(item?.NPC, primaryOppTarget))
        ?.genStats;

    if (!isDefaultGeneratedCore(relationshipCore)) {
        return { core: relationshipCore, source: `relationshipEngine[${primaryOppTarget}].genStats` };
    }

    return { core: { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 }, source: 'engine default core fallback', defaultFallback: true };
}

function isDefaultGeneratedCore(core) {
    if (!core) return true;
    const rank = String(core.Rank || 'none');
    const mainStat = String(core.MainStat || 'none');
    return rank === 'none'
        && mainStat === 'none'
        && Number(core.PHY ?? 1) === 1
        && Number(core.MND ?? 1) === 1
        && Number(core.CHA ?? 1) === 1;
}

function initPreset(flags) {
    if (bool(flags.romanticOpen)) return { label: 'romanticOpen', disposition: { B: 4, F: 1, H: 1 } };
    if (bool(flags.userBadRep)) return { label: 'userBadRep', disposition: { B: 1, F: 2, H: 3 } };
    if (bool(flags.userGoodRep)) return { label: 'userGoodRep', disposition: { B: 3, F: 1, H: 2 } };
    if (bool(flags.userNonHuman) && !bool(flags.fearImmunity)) return { label: 'userNonHuman', disposition: { B: 1, F: 3, H: 2 } };
    return { label: 'neutralDefault', disposition: { B: 2, F: 2, H: 2 } };
}

function routeDispositionTarget(npc, packet, auditInteraction, isAllowed, sem) {
    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isBenefited = includesName(packet.BenefitedObservers, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    const landed = landedBool(packet.LandedActions);
    const g = packet.GOAL;
    const out = packet.Outcome;
    const hasStakes = packet.STAKES === 'Y';

    if (!isDirect && !isOpp && !isBenefited && !isHarmed) return 'No Change';
    if (!hasStakes) {
        if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(g) && isAllowed === 'Y') return 'Bond';
        return 'No Change';
    }
    if (auditInteraction === 'Y' && !isHarmed) return 'Bond';
    if (!isDirect && !isOpp && isBenefited) return auditInteraction === 'Y' ? 'Bond' : 'No Change';
    if (!isDirect && !isOpp && isHarmed) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(g)) {
        if (isAllowed === 'Y') return 'Bond';
        if (g === 'IntimacyAdvancePhysical') return 'FearHostility';
        return 'Hostility';
    }
    if (bool(sem.explicitIntimidationOrCoercion)) return 'Fear';
    if (landed && (isDirect || isOpp || isHarmed)) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (auditInteraction === 'Y') return 'Bond';
    return 'No Change';
}

function relationToUserAction(npc, packet) {
    return {
        isDirect: includesName(packet.ActionTargets, npc),
        isOpp: includesName(packet.OppTargets?.NPC, npc),
        isBenefited: includesName(packet.BenefitedObservers, npc),
        isHarmed: includesName(packet.HarmedObservers, npc),
    };
}

function proactivityRefereeGuard(handoff, packet) {
    const relation = handoff.RelationToUserAction || relationToUserAction(handoff.NPC, packet);
    if (relation.isDirect || relation.isOpp || relation.isHarmed) return null;
    if (relation.isBenefited && handoff.Target === 'Bond') {
        return 'benefited observer cannot target user with aggression unless also direct/opposing/harmed';
    }
    if (handoff.NPC_STAKES === 'Y' && handoff.Target === 'Bond' && handoff.Landed === 'Y') {
        return 'positive-stakes observer cannot convert benefit into user-targeting aggression';
    }
    if (handoff.Target === 'Bond'
        && handoff.PressureMode === 'none'
        && !['FREEZE', 'TERROR', 'HATRED'].includes(handoff.Lock)
        && packet.classifyHostilePhysicalIntent !== 'Y'
        && !['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)) {
        return 'Bond-routed non-hostile interaction cannot become hostile proactivity without harm, opposition, lock, or pressure evidence';
    }
    return null;
}

function updateRapport(currentRapport, target, rapportEncounterLock, mode = 'normal') {
    if (rapportEncounterLock === 'Y') return { currentRapport, rapportEncounterLock: 'Y' };
    if (mode === 'hostilePressure' && target === 'No Change') return { currentRapport, rapportEncounterLock: 'Y' };
    if (['Bond', 'No Change'].includes(target)) return { currentRapport: Math.min(5, currentRapport + 1), rapportEncounterLock: 'Y' };
    if (['Hostility', 'Fear', 'FearHostility'].includes(target)) return { currentRapport: Math.max(0, currentRapport - 1), rapportEncounterLock: 'Y' };
    return { currentRapport, rapportEncounterLock };
}

function applyHostilePhysicalPressure(npc, packet, state) {
    if (packet.classifyHostilePhysicalIntent !== 'Y') return null;
    if (packet.STAKES !== 'Y') return null;

    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    if (!isDirect && !isOpp && !isHarmed) return null;

    const landed = landedBool(packet.LandedActions);
    const severity = hostilePressureSeverity(packet.Outcome);
    const hostilePressure = clamp(state.hostilePressure + Math.max(1, severity), 0, 20);
    const hostileLandedPressure = landed
        ? clamp(state.hostileLandedPressure + Math.max(1, severity), 0, 20)
        : state.hostileLandedPressure;

    const pressureState = {
        disposition: state.currentDisposition,
        dominantLock: state.dominantLock,
        pressureMode: state.pressureMode,
    };

    let deltas = { b: 0, f: 0, h: 0 };
    let dominatedFearBreak = false;

    if (!landed) {
        if (hostilePressure >= 2) {
            deltas = addDispositionPressure(pressureState, 1, 'failed');
        }
    } else if (packet.Outcome === 'light_impact') {
        deltas = addDispositionPressure(pressureState, 1, 'landed');
    } else if (['solid_impact', 'dominant_impact'].includes(packet.Outcome)) {
        deltas = addDispositionPressure(pressureState, severity, 'dominance');
        dominatedFearBreak = pressureState.pressureMode === 'dominated';
    }

    const target = targetFromDeltas(deltas);

    return {
        target,
        deltas,
        hostilePressure,
        hostileLandedPressure,
        dominantLock: pressureState.dominantLock,
        pressureMode: pressureState.pressureMode,
        dominatedFearBreak,
    };
}

function hostilePressureSeverity(outcome) {
    if (outcome === 'dominant_impact') return 2;
    if (outcome === 'solid_impact') return 2;
    return 1;
}

function addDispositionPressure(state, amount, mode) {
    const disposition = state.disposition;
    let deltas;

    if (mode === 'failed') {
        deltas = disposition.H > disposition.F
            ? addHostilityPressure(state, amount)
            : addFearPressure(state, amount);
    } else if (mode === 'landed') {
        deltas = disposition.F > disposition.H
            ? addFearPressure(state, amount)
            : addHostilityPressure(state, amount);
    } else if (state.dominantLock === 'HOSTILITY' || disposition.H >= 4) {
        state.pressureMode = 'dominated';
        deltas = addFearPressure(state, amount, { noCorneredOverflow: true });
    } else if (disposition.F > disposition.H) {
        deltas = addFearPressure(state, amount);
    } else if (disposition.H > disposition.F) {
        deltas = addHostilityPressure(state, amount);
    } else {
        deltas = { b: -1, f: 1, h: 1 };
    }

    const projected = updateDisposition(disposition, deltas);
    updatePressureLockState(state, disposition, projected);
    return deltas;
}

function addFearPressure(state, amount, options = {}) {
    const room = Math.max(0, 4 - state.disposition.F);
    const f = Math.min(amount, room);
    const overflow = Math.max(0, amount - f);
    const h = options.noCorneredOverflow ? 0 : overflow;

    if (overflow > 0 && !options.noCorneredOverflow) {
        state.pressureMode = 'cornered';
        if (state.dominantLock === 'None') state.dominantLock = 'FEAR';
    }

    return { b: f || h ? -1 : 0, f, h };
}

function addHostilityPressure(state, amount) {
    return { b: -1, f: 0, h: amount };
}

function updatePressureLockState(state, before, after) {
    if (state.dominantLock !== 'None') return;

    const fearHit = before.F < 4 && after.F >= 4;
    const hostilityHit = before.H < 4 && after.H >= 4;

    if (fearHit && !hostilityHit) state.dominantLock = 'FEAR';
    else if (hostilityHit && !fearHit) state.dominantLock = 'HOSTILITY';
    else if (fearHit && hostilityHit) state.dominantLock = state.pressureMode === 'cornered' ? 'FEAR' : 'HOSTILITY';
}

function targetFromDeltas(deltas) {
    if ((deltas.f || 0) > 0 && (deltas.h || 0) > 0) return 'FearHostility';
    if ((deltas.f || 0) > 0) return 'Fear';
    if ((deltas.h || 0) > 0) return 'Hostility';
    return 'No Change';
}

function deriveDirection(target, currentDisposition, currentRapport, auditInteraction) {
    if (target === 'No Change') return { b: 0, f: 0, h: 0 };
    if (target === 'Hostility') return { b: -1, f: 0, h: 1 };
    if (target === 'Fear') return { b: -1, f: 1, h: 0 };
    if (target === 'FearHostility') return { b: -1, f: 1, h: 1 };
    if (currentDisposition.F === 4 || currentDisposition.H === 4) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return { b: 0, f: currentDisposition.F === 4 ? -1 : 0, h: currentDisposition.H === 4 ? -1 : 0, rapportReset: 'Y' };
        }
        return { b: 0, f: 0, h: 0 };
    }
    if (currentDisposition.F === 3 || currentDisposition.H === 3) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return { b: 0, f: currentDisposition.F === 3 ? -1 : 0, h: currentDisposition.H === 3 ? -1 : 0 };
        }
        return { b: 0, f: 0, h: 0 };
    }
    if (target === 'Bond') {
        if (currentDisposition.B === 1) return currentRapport >= 1 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 2) return currentRapport >= 3 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 3) return currentRapport >= 5 && auditInteraction === 'Y' ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
    }
    return { b: 0, f: 0, h: 0 };
}

function updateDisposition(disposition, deltas) {
    const next = {
        B: clamp(disposition.B + (deltas.b || 0), 1, 4),
        F: clamp(disposition.F + (deltas.f || 0), 1, 4),
        H: clamp(disposition.H + (deltas.h || 0), 1, 4),
    };
    if (next.F >= 3 || next.H >= 3) next.B = 1;
    return next;
}

function classifyDisposition(disposition) {
    const lock = disposition.F === 4 ? 'TERROR' : disposition.H === 4 ? 'HATRED' : (disposition.F === 3 || disposition.H === 3) ? 'FREEZE' : 'None';
    const behavior = lock !== 'None' ? lock : disposition.B === 4 ? 'CLOSE' : disposition.B === 3 ? 'FRIENDLY' : disposition.B === 2 ? 'NEUTRAL' : 'BROKEN';
    return { lock, behavior };
}

function checkThreshold(disposition, flags) {
    const LockActive = disposition.F >= 3 || disposition.H >= 3 ? 'Y' : 'N';
    let Override = 'NONE';
    if (disposition.B < 4) {
        if (bool(flags.Exploitation)) Override = 'Exploitation';
        else if (bool(flags.Hedonist)) Override = 'Hedonist';
        else if (bool(flags.Transactional)) Override = 'Transactional';
        else if (bool(flags.Established)) Override = 'Established';
    }
    return { LockActive, OverrideActive: Override !== 'NONE' ? 'Y' : 'N', Override };
}

function currentIntimacyGateAllows(state) {
    if (state?.intimacyGate !== 'ALLOW') return state?.currentDisposition?.B >= 4;
    if (state?.currentDisposition?.F >= 3 || state?.currentDisposition?.H >= 3) return false;
    if (state?.intimacyGateSource === 'B4' && state?.currentDisposition?.B < 4) return false;
    return true;
}

function getStakesOverrideEvidence(goal, intimacyTarget, targetState, semanticHasStakes, intimacyConsent) {
    if (!['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)) return null;

    const disposition = targetState?.currentDisposition || null;
    const evidence = {
        target: intimacyTarget || NONE,
        currentDisposition: disposition ? formatDisposition(disposition) : null,
        priorIntimacyGate: targetState?.intimacyGate || 'SKIP',
        priorIntimacyGateSource: targetState?.intimacyGateSource || 'NONE',
        intimacyConsent,
    };

    if (semanticHasStakes === 'Y' && intimacyConsent === 'Y' && targetState?.intimacyGate === 'ALLOW') {
        return {
            hasStakes: 'N',
            rule: 'hard_override_allowed_intimacy_prior_ALLOW',
            evidence: {
                ...evidence,
                hardRule: 'ResolutionEngine.hasStakes: allowed intimacy advance returns N',
            },
        };
    }

    if (semanticHasStakes === 'Y' && intimacyConsent === 'Y' && disposition?.B >= 4 && disposition.F < 3 && disposition.H < 3) {
        return {
            hasStakes: 'N',
            rule: 'hard_override_allowed_intimacy_B4',
            evidence: {
                ...evidence,
                hardRule: 'ResolutionEngine.hasStakes: allowed intimacy advance returns N',
            },
        };
    }

    if (semanticHasStakes === 'N' && intimacyConsent === 'N') {
        return {
            hasStakes: 'Y',
            rule: 'hard_override_denied_intimacy_no_allow',
            evidence: {
                ...evidence,
                hardRule: 'ResolutionEngine.hasStakes: denied intimacy advance returns Y',
            },
        };
    }

    return null;
}

function resolveIntimacyGate(previousState, threshold, disposition, isAllowed) {
    if (threshold.LockActive === 'Y') {
        return { IntimacyGate: 'DENY', IntimacyGateSource: 'LOCK' };
    }

    if (isAllowed === 'Y') {
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: previousState.intimacyGateSource || 'PRIOR_ALLOW' };
    }

    if (threshold.OverrideActive === 'Y') {
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: `OVERRIDE:${threshold.Override}` };
    }

    if (disposition.B >= 4) {
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: 'B4' };
    }

    if (previousState.intimacyGate === 'ALLOW') {
        if (previousState.intimacyGateSource === 'B4' && disposition.B < 4) {
            return { IntimacyGate: 'SKIP', IntimacyGateSource: 'NONE' };
        }
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: previousState.intimacyGateSource || 'PRIOR_ALLOW' };
    }

    if (previousState.intimacyGate === 'DENY') {
        return { IntimacyGate: 'DENY', IntimacyGateSource: previousState.intimacyGateSource || 'PRIOR_DENY' };
    }

    return { IntimacyGate: 'SKIP', IntimacyGateSource: 'NONE' };
}

function getChaosContext(handoffs, sceneSummary) {
    if (handoffs.length >= 2) return 'PUBLIC';
    if (/\b(public|crowd|open|market|tavern|street|square)\b/i.test(sceneSummary)) return 'PUBLIC';
    return 'ISOLATED';
}

function classifyBand(o) {
    if (o <= 5) return 'HOSTILE';
    if (o <= 14) return 'COMPLICATION';
    return 'BENEFICIAL';
}

function classifyMagnitude(o) {
    if (o === 1 || o === 20) return 'EXTREME';
    if (o <= 2 || o >= 19) return 'MAJOR';
    if (o <= 4 || o >= 17) return 'MODERATE';
    return 'MINOR';
}

function pickAnchor(index) {
    return ['GOAL', 'ENVIRONMENT', 'KNOWN_NPC', 'RESOURCE', 'CLUE'][index % 5];
}

function pickVector(ctx, i, index) {
    const values = ctx === 'PUBLIC'
        ? ['NPC', 'CROWD', 'AUTHORITY', 'ENVIRONMENT', 'SYSTEM']
        : i >= 17
            ? ['ENVIRONMENT', 'SYSTEM', 'ENTITY']
            : ['ENVIRONMENT', 'SYSTEM'];
    return values[index % values.length];
}

function classifyAction(packet) {
    if (packet.STAKES === 'N') return 'Normal_Interaction';
    if (packet.GOAL === 'IntimacyAdvancePhysical') return 'Intimacy_Physical';
    if (packet.GOAL === 'IntimacyAdvanceVerbal') return 'Intimacy_Verbal';
    if (packet.classifyHostilePhysicalIntent === 'Y') return 'Combat';
    if (landedBool(packet.LandedActions)) return 'Combat';
    if (toRealArray(packet.ActionTargets).length >= 1 && packet.LandedActions === '(none)') return 'Social';
    if (toRealArray(packet.OppTargets?.ENV).length >= 1) return 'Skill';
    return 'Normal_Interaction';
}

function deriveImpulse(kind, lock, fin, intimacyGate, pressureMode = 'none', target = 'No Change') {
    if (pressureMode === 'cornered') return 'ANGER';
    if (pressureMode === 'dominated') return 'FEAR';
    if (lock === 'HATRED') return 'ANGER';
    if (lock === 'TERROR') return 'FEAR';
    if (['Combat', 'Social'].includes(kind) && fin.H >= fin.F && fin.H >= fin.B) return 'ANGER';
    if (kind === 'Social' && fin.F >= fin.H && fin.F >= fin.B) return 'FEAR';
    if (['Intimacy_Physical', 'Intimacy_Verbal'].includes(kind) && intimacyGate === 'DENY') return 'ANGER';
    if (['Normal_Interaction', 'Skill'].includes(kind) && fin.B >= fin.H && fin.B >= fin.F) return 'BOND';
    if (fin.H >= fin.F && fin.H >= fin.B) return 'ANGER';
    if (fin.F >= fin.H && fin.F >= fin.B) return 'FEAR';
    return 'BOND';
}

function classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin) {
    const NPC_STAKES = handoff.NPC_STAKES || 'N';
    const Target = handoff.Target || 'No Change';
    const Landed = handoff.Landed || 'N';
    if (['light', 'medium', 'severe'].includes(counterPotential) && ['HATRED', 'FREEZE'].includes(lock)) return 'FORCED';
    if (NPC_STAKES === 'N' && Target === 'No Change' && chaosBand === 'None') {
        if (fin.B >= 3 || fin.H >= 3) return 'MEDIUM';
        return 'DORMANT';
    }
    if (lock !== 'None' && (Target !== 'No Change' || Landed === 'Y')) return 'HIGH';
    if (NPC_STAKES === 'Y' && (Target !== 'No Change' || Landed === 'Y')) return 'HIGH';
    if (lock !== 'None' && chaosBand !== 'None') return 'HIGH';
    if (lock !== 'None') return 'MEDIUM';
    if (NPC_STAKES === 'Y') return 'MEDIUM';
    if (Target !== 'No Change' || Landed === 'Y') return 'MEDIUM';
    if (chaosBand !== 'None') return 'LOW';
    return 'DORMANT';
}

function thresholdFromTier(tier) {
    if (tier === 'HIGH') return 8;
    if (tier === 'MEDIUM') return 10;
    if (tier === 'LOW') return 13;
    return 16;
}

function selectIntent(impulse, kind, fin, intimacyGate, override, pressureMode = 'none') {
    if (pressureMode === 'cornered') {
        return fin.H >= 4 ? 'ESCALATE_VIOLENCE' : 'BOUNDARY_PHYSICAL';
    }

    if (pressureMode === 'dominated') {
        return fin.F >= 4 ? 'CALL_HELP_OR_AUTHORITY' : 'WITHDRAW_OR_BOUNDARY';
    }

    if (impulse === 'ANGER') {
        if (kind === 'Intimacy_Physical' && intimacyGate === 'DENY') return 'BOUNDARY_PHYSICAL';
        if (kind === 'Combat' || fin.H >= 4) return 'ESCALATE_VIOLENCE';
        return 'THREAT_OR_POSTURE';
    }
    if (impulse === 'FEAR') {
        if (fin.F >= 4) return 'CALL_HELP_OR_AUTHORITY';
        return 'WITHDRAW_OR_BOUNDARY';
    }
    if ((intimacyGate === 'ALLOW' || override !== 'NONE') && fin.B >= 3) return 'INTIMACY_OR_FLIRT';
    if (['Skill', 'Social'].includes(kind)) return 'SUPPORT_ACT';
    return 'PLAN_OR_BANTER';
}

function targetsUserFromIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(intent) ? 'Y' : 'N';
}

function isImmediateAttackIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(intent);
}

function buildNarrationGuidance(resolution, handoffs, chaos, proactivity, aggression) {
    return {
        resolution: `${resolution.OutcomeTier}/${resolution.Outcome}`,
        relationshipStates: handoffs.map(h => `${h.NPC}:${h.FinalState}:${h.Behavior}:${h.IntimacyGate}`),
        chaos: chaos.CHAOS,
        proactivity,
        aggression,
        instruction: 'Narrate according to these computed outcomes. Do not expose mechanics unless the user asks OOC.',
    };
}

function buildPersistencePolicy() {
    return {
        staticUntilExplicitChange: ['currentCoreStats.Rank', 'currentCoreStats.MainStat', 'currentCoreStats.PHY', 'currentCoreStats.MND', 'currentCoreStats.CHA'],
        persistentRuleMutated: ['currentDisposition', 'currentRapport', 'rapportEncounterLock', 'intimacyGate', 'intimacyGateSource', 'hostilePressure', 'hostileLandedPressure', 'dominantLock', 'pressureMode'],
        perTurn: ['GOAL', 'ActionTargets', 'OppTargets', 'STAKES', 'OutcomeTier', 'Outcome', 'LandedActions', 'CounterPotential', 'classifyHostilePhysicalIntent', 'CHAOS', 'proactivityResults', 'aggressionResults'],
    };
}

function trackerSummary(trackerUpdate) {
    const npcs = Object.entries(trackerUpdate?.npcs || {});
    if (!npcs.length) return 'N';

    return npcs.map(([name, value]) => {
        const disposition = value?.currentDisposition ? formatDisposition(value.currentDisposition) : 'UNINITIALIZED';
        const stats = value?.currentCoreStats
            ? `stats:${value.currentCoreStats.PHY}/${value.currentCoreStats.MND}/${value.currentCoreStats.CHA}`
            : 'stats:none';
        return [
            name,
            disposition,
            `rapport:${value?.currentRapport ?? 0}`,
            `gate:${value?.intimacyGate ?? 'SKIP'}`,
            stats,
            `pressure:${value?.hostilePressure ?? 0}/${value?.hostileLandedPressure ?? 0}/${value?.dominantLock ?? 'None'}/${value?.pressureMode ?? 'none'}`,
        ].join('/');
    }).join(';');
}

function normalizeTrackerEntry(value) {
    return {
        currentDisposition: normalizeDisposition(value?.currentDisposition),
        currentRapport: clamp(Number(value?.currentRapport ?? 0), 0, 5),
        rapportEncounterLock: value?.rapportEncounterLock === 'Y' ? 'Y' : 'N',
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(value?.intimacyGate) ? value.intimacyGate : 'SKIP',
        intimacyGateSource: normalizeIntimacyGateSource(value?.intimacyGateSource),
        currentCoreStats: value?.currentCoreStats ? normalizeCore(value.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 }) : null,
        hostilePressure: clamp(Number(value?.hostilePressure ?? 0), 0, 20),
        hostileLandedPressure: clamp(Number(value?.hostileLandedPressure ?? 0), 0, 20),
        dominantLock: ['FEAR', 'HOSTILITY'].includes(value?.dominantLock) ? value.dominantLock : 'None',
        pressureMode: ['none', 'cornered', 'dominated'].includes(value?.pressureMode) ? value.pressureMode : 'none',
    };
}

function normalizeIntimacyGateSource(value) {
    const text = String(value ?? 'NONE');
    if (text === 'B4' || text === 'LOCK' || text === 'NONE' || text === 'PRIOR_ALLOW' || text === 'PRIOR_DENY') return text;
    if (text.startsWith('OVERRIDE:')) return text;
    return 'NONE';
}

function normalizeDisposition(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const match = value.match(/B(\d+)\/F(\d+)\/H(\d+)/i);
        if (match) return { B: Number(match[1]), F: Number(match[2]), H: Number(match[3]) };
    }
    if (typeof value === 'object' && value.B && value.F && value.H) {
        return { B: clamp(Number(value.B), 1, 4), F: clamp(Number(value.F), 1, 4), H: clamp(Number(value.H), 1, 4) };
    }
    return null;
}

function normalizeTargets(value) {
    return {
        ActionTargets: toRealArray(value?.ActionTargets),
        OppTargets: {
            NPC: toRealArray(value?.OppTargets?.NPC),
            ENV: toRealArray(value?.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(value?.BenefitedObservers),
        HarmedObservers: toRealArray(value?.HarmedObservers),
    };
}

function sanitizeTargets(targets, classifier) {
    const actionTargets = [];
    const oppNpc = [];
    const oppEnv = [...targets.OppTargets.ENV];
    const benefitedCandidates = [];
    const harmedCandidates = [];

    for (const name of targets.ActionTargets) {
        if (classifier.isLiving(name)) actionTargets.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.OppTargets.NPC) {
        if (classifier.isLiving(name)) oppNpc.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.BenefitedObservers) {
        if (classifier.isLiving(name)) benefitedCandidates.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.HarmedObservers) {
        if (classifier.isLiving(name)) harmedCandidates.push(name);
        else oppEnv.push(name);
    }

    const directOrOpposed = new Set([...actionTargets, ...oppNpc].map(normalizeNameKey));
    const benefited = benefitedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));
    const harmed = harmedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));

    return {
        ActionTargets: unique(actionTargets),
        OppTargets: {
            NPC: unique(oppNpc),
            ENV: unique(oppEnv.filter(isReal)),
        },
        BenefitedObservers: unique(benefited),
        HarmedObservers: unique(harmed),
    };
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

function sameTargets(a, b) {
    return JSON.stringify(targetSummary(a)) === JSON.stringify(targetSummary(b));
}

function targetSummary(targets) {
    return {
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: {
            NPC: showNone(targets.OppTargets?.NPC),
            ENV: showNone(targets.OppTargets?.ENV),
        },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
    };
}

function normalizeNameKey(name) {
    const text = String(name ?? '').trim().toLowerCase();
    return isReal(text) ? text : '';
}

function normalizeActionMarkers(markers) {
    if (!Array.isArray(markers) || markers.length === 0) return ['a1'];
    return markers.slice(0, 3).map((_, index) => `a${index + 1}`);
}

function normalizeCore(value, fallback) {
    return {
        Rank: normalizeRank(value?.Rank ?? fallback.Rank),
        MainStat: normalizeMainStat(value?.MainStat ?? fallback.MainStat),
        PHY: clamp(Number(value?.PHY ?? fallback.PHY), 1, 10),
        MND: clamp(Number(value?.MND ?? fallback.MND), 1, 10),
        CHA: clamp(Number(value?.CHA ?? fallback.CHA), 1, 10),
    };
}

function getUserCoreStats(ledger) {
    return normalizeCore(ledger?.engineContext?.userCoreStats, { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 });
}

function normalizeRank(value) {
    return ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'none'].includes(value) ? value : 'none';
}

function normalizeMainStat(value) {
    return ['PHY', 'MND', 'CHA', 'Balanced', 'none'].includes(value) ? value : 'none';
}

function statValue(core, stat) {
    return normalizeCore(core, { PHY: 1, MND: 1, CHA: 1 })[stat] || 1;
}

function normalizeStat(value, fallback) {
    return ['PHY', 'MND', 'CHA'].includes(value) ? value : fallback;
}

function normalizeOppStat(value) {
    return ['PHY', 'MND', 'CHA', 'ENV'].includes(value) ? value : 'ENV';
}

function normalizeMapStats(value) {
    return {
        userStat: normalizeStat(value?.USER, 'PHY'),
        oppStat: normalizeOppStat(value?.OPP),
    };
}

function applyMapStatsHardRules(semantic, goal, targets, mapStats, audit) {
    let { userStat, oppStat } = mapStats;
    const evidence = [];

    if (isBodyAffectingMagic(semantic, goal, targets)) {
        if (userStat !== 'MND' || oppStat !== 'PHY') {
            evidence.push({
                hardRule: 'ResolutionEngine.mapStats: body-affecting magic against a living target is USER=MND and OPP=PHY',
                from: { USER: userStat, OPP: oppStat },
                to: { USER: 'MND', OPP: 'PHY' },
            });
        }
        userStat = 'MND';
        oppStat = 'PHY';
    }

    const hasLivingOpposition = toRealArray(targets.OppTargets?.NPC).length > 0;
    if (!hasLivingOpposition && oppStat !== 'ENV') {
        evidence.push({
            hardRule: 'ResolutionEngine.mapStats: no living opposing target means OPP=ENV',
            from: { USER: userStat, OPP: oppStat },
            to: { USER: userStat, OPP: 'ENV' },
        });
        oppStat = 'ENV';
    }

    if (evidence.length) {
        audit.push(`2.7c.1 deterministicMapStatsReferee=${compact(evidence)}`);
    }

    return { userStat, oppStat };
}

function isBodyAffectingMagic(semantic, goal, targets) {
    if (!firstReal(targets.OppTargets?.NPC) && !firstReal(targets.ActionTargets)) return false;
    if (bool(semantic.classifyHostilePhysicalIntent)) return false;

    const source = [
        semantic.identifyGoal,
        goal,
        semantic.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();

    const hasMagic = /\b(magic|magical|spell|arcane|hex|curse|supernatural|enchant|enchantment|sorcery|power)\b/.test(source);
    const affectsBody = /\b(paraly[sz]e|paralysis|poison|venom|blind|blindness|deafen|numb|sleep|pain|muscle|blood|breath|choke|disease|sicken|transmut|petrif|bind|bodily|body|immobiliz|lock|freeze|stun)\b/.test(source);
    return hasMagic && affectsBody;
}

function parseFinalState(value) {
    return normalizeDisposition(value) || { B: 2, F: 2, H: 2 };
}

function deriveLock(fin) {
    if (fin.F === 4) return 'TERROR';
    if (fin.H === 4) return 'HATRED';
    if (fin.F === 3 || fin.H === 3) return 'FREEZE';
    return 'None';
}

function landedBool(value) {
    return Number(value) > 0;
}

function includesName(list, name) {
    return toRealArray(list).some(x => String(x).toLowerCase() === String(name).toLowerCase());
}

function sameName(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function toRealArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(x => String(x).trim()).filter(isReal);
}

function showNone(value) {
    const array = Array.isArray(value) ? value.filter(isReal) : [];
    return array.length ? array : [NONE];
}

function firstReal(value) {
    return toRealArray(value)[0] || null;
}

function isReal(value) {
    const text = String(value ?? '').trim();
    return text && text !== NONE && text.toLowerCase() !== 'none' && text.toLowerCase() !== 'null';
}

function bool(value) {
    return value === true || value === 'Y' || value === 'y' || value === 'true';
}

function yn(value) {
    return bool(value) ? 'Y' : 'N';
}

function unique(values) {
    return [...new Set(values)];
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function formatTargets(targets) {
    return compact({
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
    });
}

function formatDisposition(disposition) {
    return `B${disposition.B}/F${disposition.F}/H${disposition.H}`;
}

function compact(value) {
    return JSON.stringify(value);
}

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}
