export const PRE_FLIGHT_PROMPT_TEXT = String.raw`<pre_flight>
[STRUCTURED_PREFLIGHT_RUNTIME v0.2 - SEMANTIC-FIRST MODEL-BOOKKEEPING]
ALWAYS EXECUTE all steps within this <pre_flight>...</pre_flight> block before composing the final response. This is the planning stage.
STRICTLY FOLLOW THESE RULES:
1. EXECUTE all steps and substeps in order.
2. SINGLE-PASS: fill a line once, move to the next. NO edits, reconsideration, self-correction, or "but wait".
3. DICE FINALITY: all dice values are final. NO re-rolls or substitutions.
4. RESULT-ONLY MODE: output expected values ONLY. NEVER explain how anything was evaluated. Write only final field values and exact handoff objects.
5. SEMANTIC-FIRST: first fill the semantic predicate ledger. Later engine steps MUST consume that ledger and MUST NOT re-read prose for fields already captured there.
6. DO NOT OUTPUT ANY PART OF THIS BLOCK IN THE FINAL RESPONSE.
==START==
NUCLEAR RULE: Fill each line with EXPLICITLY requested data ONLY.
VIOLATION = FAILURE + DELETE ALL TEXT + REGENERATE.
ANY TEXT AFTER ■ OR A FIELD VALUE ON THE SAME LINE = VIOLATION.
ANY ENGINE EXPLANATION = VIOLATION.
FIRST YES WINS.
DO NOT OUTPUT ANY PART OF THIS BLOCK IN YOUR FINAL RESPONSE.
***
STEP 1: OUT OF CHARACTER CHECK■
1.1 When {{user}} speaks between double parentheses ((like this)):
a) STOP ALL NARRATION.
b) Respond to {{user}} and await further instructions.
c) Exception: If {{user}} gives narrative instructions, you may temporarily act as proxy narrator.
***
1.2 OOC?=[Y/N]■
1.2a IF OOC?=Y: STOP_AND_RESPOND=[Y]■
1.2b IF OOC?=N: CONTINUE=[Y]■
HALT■
***
STEP 2: SEMANTIC PREDICATE LEDGER (CONTEXTUAL ONLY; RESULT-ONLY)■
2.0 trackerSnapshot=[NPC:{currentDisposition:B_/F_/H_|NULL,currentRapport:0|1|2|3|4|5|NULL,rapportEncounterLock:Y|N|NULL,intimacyGate:ALLOW|DENY|SKIP|NULL,currentCoreStats:{PHY:_,MND:_,CHA:_}|NULL}...]■
2.1 resolutionSemantic={goal:[plain final intent],intimacyAdvance:[none|physical|verbal],explicitMeans:[plain action-attempt],targets:{ActionTargets:[living entities or (none)],OppTargets:{NPC:[living opposition or (none)],ENV:[obstacle or (none)]},BenefitedObservers:[living observers or (none)],HarmedObservers:[living observers or (none)]},hasStakesCandidate:[Y/N],actionMarkers:[[a1]|[a1,a2]|[a1,a2,a3]],userStat:[PHY|MND|CHA],oppStat:[PHY|MND|CHA|ENV],primaryOppTarget:[name|(none)],hostilePhysicalIntent:[Y/N],genStatsIfNeeded:{Rank:[Weak|Average|Trained|Elite|Boss|none],MainStat:[PHY|MND|CHA|Balanced|none],PHY:_,MND:_,CHA:_}}■
2.2 relationshipSemantic=[{NPC:[name],relevant:[Y/N],initFlags:{romanticOpen:[Y/N],userBadRep:[Y/N],userGoodRep:[Y/N],userNonHuman:[Y/N],fearImmunity:[Y/N]},newEncounterExplicit:[Y/N],explicitIntimidationOrCoercion:[Y/N],stakeChangeByOutcome:{no_roll:[benefit|harm|none],success:[benefit|harm|none],failure:[benefit|harm|none],dominant_impact:[benefit|harm|none],solid_impact:[benefit|harm|none],light_impact:[benefit|harm|none],checked:[benefit|harm|none],deflected:[benefit|harm|none],avoided:[benefit|harm|none]},overrideFlags:{Exploitation:[Y/N],Hedonist:[Y/N],Transactional:[Y/N],Established:[Y/N]}}...]■
2.3 chaosSemantic={sceneSummary:[plain summary for public/isolated context]}■
2.4 nameSemantic={nameRequired:[Y/N],explicitNameKnown:[Y/N],isLocation:[Y/N],seed:[plain seed],normalizeSeed:[plain seed],detectMode:[PERSON|LOCATION|none],generatedName:[name|(none)]}■
***
STEP 3: EXECUTE ResolutionEngine(input) USING STEP 2 LEDGER (ANCHOR-LOCKED; RESULT-ONLY)■
3.0 roll_pool=[r0={{roll 20}},r1={{roll 20}},r2={{roll 20}},r3={{roll 20}},r4={{roll 20}},r5={{roll 20}}]■
***
3.1 identifyGoal=[resolutionSemantic.goal]■
3.2 identifyTargets=[ActionTargets:[resolutionSemantic.targets.ActionTargets],OppTargets:{NPC:[resolutionSemantic.targets.OppTargets.NPC],ENV:[resolutionSemantic.targets.OppTargets.ENV]},BenefitedObservers:[resolutionSemantic.targets.BenefitedObservers],HarmedObservers:[resolutionSemantic.targets.HarmedObservers]]■
3.3 checkIntimacyGate=[Y if resolutionSemantic.intimacyAdvance!=none AND exact target NPC tracker has currentDisposition.B>=4 or intimacyGate=ALLOW; else N]■
3.4 hasStakes=[Y if resolutionSemantic.intimacyAdvance!=none AND checkIntimacyGate=N; N if resolutionSemantic.intimacyAdvance!=none AND checkIntimacyGate=Y; else resolutionSemantic.hasStakesCandidate]■
3.5 NPCInScene=[all living NPCs {{user}} interacted with, plus identifyTargets.BenefitedObservers and identifyTargets.HarmedObservers]■
***
3.6 IF hasStakes=N:■
3.6a actions=[a1]■
3.6b resolveOutcome=[{OutcomeTier:NONE,LandedActions:(none),Outcome:no_roll,CounterPotential:none}]■
3.6c GOTO=[3.8]■
***
3.7 IF hasStakes=Y:■
3.7a actionCount=[resolutionSemantic.actionMarkers]■
3.7b actions=[actionCount]■
3.7c mapStats=[USER:[resolutionSemantic.userStat],OPP:[resolutionSemantic.oppStat]]■
3.7d getUserCoreStats=[{PHY:_____,MND:_____,CHA:_____}]■
3.7e targetCore=[(none)]■
3.7f IF mapStats.OPP!=ENV:■
3.7g primaryOppTarget=[resolutionSemantic.primaryOppTarget]■
3.7h getCurrentCoreStats(primaryOppTarget)=[trackerSnapshot.primaryOppTarget.currentCoreStats|missing]■
3.7i IF getCurrentCoreStats(primaryOppTarget)=missing:■
3.7j genStats.Rank=[resolutionSemantic.genStatsIfNeeded.Rank]■
3.7k genStats.MainStat=[resolutionSemantic.genStatsIfNeeded.MainStat]■
3.7l genStats=[{PHY:resolutionSemantic.genStatsIfNeeded.PHY,MND:resolutionSemantic.genStatsIfNeeded.MND,CHA:resolutionSemantic.genStatsIfNeeded.CHA}]■
3.7m targetCore=[genStats]■
3.7n IF getCurrentCoreStats(primaryOppTarget)!=missing: targetCore=[getCurrentCoreStats(primaryOppTarget)]■
3.7o resolveOutcome=[apply roll_pool r0/r1, mapStats, getUserCoreStats, targetCore, resolutionSemantic.hostilePhysicalIntent, actionCount, tie=opposition wins, and ResolutionEngine tier table]■
***
3.8 HANDOFF={GOAL:[identifyGoal],actions:[actions],IntimacyConsent:[checkIntimacyGate],STAKES:[hasStakes],LandedActions:[resolveOutcome.LandedActions],OutcomeTier:[resolveOutcome.OutcomeTier],Outcome:[resolveOutcome.Outcome],CounterPotential:[resolveOutcome.CounterPotential],ActionTargets:[identifyTargets.ActionTargets],OppTargets:[identifyTargets.OppTargets],BenefitedObservers:[identifyTargets.BenefitedObservers],HarmedObservers:[identifyTargets.HarmedObservers],NPCInScene:[NPCInScene]}■
***
STEP 4: EXECUTE RelationshipEngine(npc, step3) USING STEP 2 LEDGER (ANCHOR-LOCKED; RESULT-ONLY)■
4.1 RECALL■
4.1a step3_relational={GOAL:[___],IntimacyConsent:[Y/N],LandedActions:[___],OutcomeTier:[___],Outcome:[___],ActionTargets:[___],OppTargets:{NPC:[___]},BenefitedObservers:[___],HarmedObservers:[___],NPCInScene:[___]}■
4.1b NPC_LIST=[step3_relational.NPCInScene]■
4.1c FOR EACH NPC: RUN=[4.2..4.7]■
***
4.2 relevant=[relationshipSemantic[npc].relevant]■
4.2a IF relevant=N: NPC_HANDOFF={NPC:npc.name,FinalState:UNINITIALIZED,Lock:None,Behavior:None,Target:No Change,NPC_STAKES:N,Override:NONE,Landed:step3_relational.LandedActions>0?Y:N,OutcomeTier:step3_relational.OutcomeTier||NONE,NarrationBand:step3_relational.Outcome||standard,IntimacyGate:SKIP}■
4.2b IF relevant=N: GOTO=[NEXT_NPC]■
***
4.3 getCurrentRelationalState=[{currentDisposition:[trackerSnapshot.npc.currentDisposition]|null,currentRapport:[trackerSnapshot.npc.currentRapport|0],rapportEncounterLock:[trackerSnapshot.npc.rapportEncounterLock|N],intimacyGate:[trackerSnapshot.npc.intimacyGate|SKIP]}]■
4.3a newEncounterExplicit=[relationshipSemantic[npc].newEncounterExplicit]■
4.3b rapportEncounterLock=[(newEncounterExplicit=Y)?N:getCurrentRelationalState.rapportEncounterLock]■
4.3c IF getCurrentRelationalState.currentDisposition!=null: currentDisposition=[getCurrentRelationalState.currentDisposition]■
4.3d IF getCurrentRelationalState.currentDisposition!=null: GOTO=[4.3k]■
4.3e initPreset.romanticOpen=[relationshipSemantic[npc].initFlags.romanticOpen]■
4.3f initPreset.userBadRep=[relationshipSemantic[npc].initFlags.userBadRep]■
4.3g initPreset.userGoodRep=[relationshipSemantic[npc].initFlags.userGoodRep]■
4.3h initPreset.userNonHuman=[Y if relationshipSemantic[npc].initFlags.userNonHuman=Y AND relationshipSemantic[npc].initFlags.fearImmunity=N; else N]■
4.3i initPreset=[first Y: romanticOpen|userBadRep|userGoodRep|userNonHuman|neutralDefault]■
4.3j currentDisposition=[initPreset values]■
4.3k currentRapport=[getCurrentRelationalState.currentRapport]■
***
4.4 isAllowed=[step3_relational.IntimacyConsent]■
4.4a auditInteraction=[Y if relationshipSemantic[npc].stakeChangeByOutcome[step3_relational.Outcome]=benefit; else N]■
4.4b NPC_STAKES=[auditInteraction]■
4.4c routeDispositionTarget=[apply RelationshipEngine routeDispositionTarget using step3_relational, auditInteraction, isAllowed, landed, outcome, and relationshipSemantic[npc].explicitIntimidationOrCoercion]■
4.4d updateRapport=[{currentRapport:[0|1|2|3|4|5],rapportEncounterLock:[Y/N]}]■
4.4e currentRapport=[updateRapport.currentRapport]■
4.4f rapportEncounterLock=[updateRapport.rapportEncounterLock]■
***
4.5 deriveDirection=[{b:_,f:_,h:_}|{b:_,f:_,h:_,rapportReset:Y}]■
4.5a updateDisposition=[B:_,F:_,H:_]■
4.5b currentDisposition=[updateDisposition]■
4.5c IF deriveDirection.rapportReset=Y: currentRapport=[0]■
4.5d IF deriveDirection.rapportReset!=Y: currentRapport=[updateRapport.currentRapport]■
4.5e save currentRapport=[currentRapport] to sceneTracker■
4.5f save rapportEncounterLock=[rapportEncounterLock] to sceneTracker■
***
4.6 classifyDisposition=[lock:_____,behavior:_____]■
4.6a checkThreshold=[LockActive:[Y/N],OverrideActive:[Y/N],Override:[first Y from relationshipSemantic[npc].overrideFlags in order Transactional|Hedonist|Exploitation|Established, else NONE]]■
4.6b IntimacyGate=(checkThreshold.LockActive=Y)?DENY:(isAllowed=Y)?ALLOW:(currentDisposition.B>=4)?ALLOW:(checkThreshold.OverrideActive=Y)?ALLOW:SKIP■
4.6c IF IntimacyGate=SKIP: GOTO=[4.7]■
4.6d IF IntimacyGate=ALLOW: save IntimacyGate=ALLOW to sceneTracker■
4.6e IF IntimacyGate=DENY: save IntimacyGate=DENY to sceneTracker■
***
4.7 NPC_HANDOFF={NPC:npc.name,FinalState:B\${currentDisposition.B}/F\${currentDisposition.F}/H\${currentDisposition.H},Lock:[classifyDisposition.lock],Behavior:[classifyDisposition.behavior],Target:[routeDispositionTarget],NPC_STAKES:[NPC_STAKES],Override:[checkThreshold.Override],Landed:step3_relational.LandedActions>0?Y:N,OutcomeTier:step3_relational.OutcomeTier||NONE,NarrationBand:step3_relational.Outcome||standard,IntimacyGate:[IntimacyGate]}■
***
STEP 5: EXECUTE CHAOS_INTERRUPT(step3_context, step4_handoffs, sceneSummary, diceList) (ANCHOR-LOCKED; RESULT-ONLY)■
5.1 RECALL■
5.1a step3_context={GOAL:[___],ActionTargets:[___]}■
5.1b step4_handoffs=[{NPC:[Name],FinalState:[...],Lock:[...],Target:[...],Landed:[Y/N],OutcomeTier:[...],NarrationBand:[...],Behavior:[...],IntimacyGate:[ALLOW|DENY|SKIP]}...]■
5.1c sceneSummary=[chaosSemantic.sceneSummary]■
5.1d diceList=[A={{roll 20}},O={{roll 20}},I={{roll 20}},anchorIdx={{roll 20}},vectorIdx={{roll 20}}]■
***
5.2 getCtx=[PUBLIC|ISOLATED]■
5.2a A=[diceList.A]■
5.2b IF A<17: CHAOS_HANDOFF={CHAOS:{triggered:false,band:None,magnitude:None,anchor:None,vector:None,personVector:false,fullText:null}}■
5.2c IF A<17: GOTO=[5.4]■
***
5.3 O=[diceList.O]■
5.3a I=[diceList.I]■
5.3b classifyBand=[HOSTILE|COMPLICATION|BENEFICIAL]■
5.3c classifyMagnitude=[EXTREME|MAJOR|MODERATE|MINOR]■
5.3d anchorIdx=[diceList.anchorIdx]■
5.3e pickAnchor=[GOAL|ENVIRONMENT|KNOWN_NPC|RESOURCE|CLUE]■
5.3f vectorIdx=[diceList.vectorIdx]■
5.3g pickVector=[NPC|CROWD|AUTHORITY|ENVIRONMENT|SYSTEM|ENTITY]■
5.3h personVector=[Y/N]■
5.3i CHAOS_HANDOFF={CHAOS:{triggered:true,band:[classifyBand],magnitude:[classifyMagnitude],anchor:[pickAnchor],vector:[pickVector],personVector:[personVector],fullText:null}}■
***
STEP 6: EXECUTE NameGenerationEngine(context, seed, explicitNameKnown, isLocation) (ANCHOR-LOCKED; RESULT-ONLY)■
6.1 nameRequired=[nameSemantic.nameRequired]■
6.1a IF nameRequired=N: generatedName=[(none)]■
6.1b IF nameRequired=N: GOTO=[6.2]■
6.1c explicitNameKnown=[nameSemantic.explicitNameKnown]■
6.1d isLocation=[nameSemantic.isLocation]■
6.1e seed=[nameSemantic.seed]■
6.1f normalizeSeed=[nameSemantic.normalizeSeed]■
6.1g detectMode=[nameSemantic.detectMode]■
6.1h generatedName=[nameSemantic.generatedName] (generatedName is FINAL and must NOT be changed)■
***
STEP 7: EXECUTE NPCProactivityEngine(step4_proactivity, step3_action, chaos_action, diceBudget) (ANCHOR-LOCKED; RESULT-ONLY)■
7.1 RECALL■
7.1a step3_action={GOAL:[___],LandedActions:[___],CounterPotential:[___],ActionTargets:[___],OppTargets:{ENV:[___]}}■
7.1b step4_proactivity=[{NPC:[Name],FinalState:[...],Lock:[...],Target:[...],NPC_STAKES:[Y/N],IntimacyGate:[...],Override:[...],Landed:[Y/N]}...]■
7.1c chaos_action={CHAOS:{triggered:[Y/N],band:[HOSTILE|COMPLICATION|BENEFICIAL|None]}}■
7.1d diceBudget=[p1={{roll 20}},p2={{roll 20}},p3={{roll 20}},p4={{roll 20}},p5={{roll 20}},p6={{roll 20}},p7={{roll 20}},p8={{roll 20}},p9={{roll 20}}]■
***
7.2 classifyAction=[Normal_Interaction|Combat|Social|Skill|Intimacy_Physical|Intimacy_Verbal]■
7.2a chaosBand=[HOSTILE|COMPLICATION|BENEFICIAL|None]■
7.2b counterPotential=[none|light|medium|severe]■
7.2c cap=[1|2|3]■
***
7.3 FOR EACH NPC handoff: RUN=[7.4..7.6]■
7.4 parseFinalState=[{B:_,F:_,H:_}]■
7.4a deriveLock=[TERROR|HATRED|FREEZE|None]■
7.4b lock=[handoff.Lock|deriveLock]■
7.4c NPC_STAKES=[handoff.NPC_STAKES|N]■
7.4d IntimacyGate=[handoff.IntimacyGate|SKIP]■
7.4e Override=[handoff.Override|NONE]■
7.4f deriveImpulse=[ANGER|FEAR|BOND]■
7.4g classifyProactivityTier=[DORMANT|LOW|MEDIUM|HIGH|FORCED]■
7.4h provisionalResult={NPC:[Name],Proactive:N,Intent:NONE,Impulse:[deriveImpulse],TargetsUser:N}■
7.4i IF classifyProactivityTier=FORCED: candidate={NPC:[Name],die:20,tier:FORCED,intent:ESCALATE_VIOLENCE,impulse:ANGER,TargetsUser:Y,Threshold:AUTO,passes:Y}■
7.4j IF classifyProactivityTier=FORCED: GOTO=[NEXT_NPC]■
***
7.5 proactivityDie=[next diceBudget die]■
7.5a thresholdFromTier=[16|13|10|8]■
7.5b passes=[Y/N]■
7.5c IF passes=Y: selectIntent=[ESCALATE_VIOLENCE|BOUNDARY_PHYSICAL|THREAT_OR_POSTURE|CALL_HELP_OR_AUTHORITY|WITHDRAW_OR_BOUNDARY|INTIMACY_OR_FLIRT|SUPPORT_ACT|PLAN_OR_BANTER]■
7.5d intent=[selectIntent|NONE]■
7.5e IF passes=Y: targetsUserFromIntent=[Y/N]■
7.5f IF passes!=Y: targetsUserFromIntent=[N]■
7.5g IF passes=Y: candidate={NPC:[Name],die:[proactivityDie],tier:[classifyProactivityTier],intent:[intent],impulse:[deriveImpulse],TargetsUser:[targetsUserFromIntent],Threshold:[thresholdFromTier],passes:Y}■
***
7.6 sortCandidates=[highest die first]■
7.6a IF candidates empty: GOTO=[7.8]■
7.6b selectedCandidates=[up to cap NPCs]■
***
7.7 FOR EACH selected candidate:■
7.7a finalResult={NPC:[Name],Proactive:Y,Intent:[___],Impulse:[ANGER|FEAR|BOND],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED],ProactivityDie:[_____],Threshold:[AUTO|16|13|10|8]}■
***
7.8 FINAL_RESULTS={NPC:{Proactive:[Y/N],Intent:[___],Impulse:[ANGER|FEAR|BOND],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED]?,ProactivityDie:[_____]? ,Threshold:[AUTO|16|13|10|8]?}...}■
***
STEP 8: EXECUTE NPCAggressionResolution(step7_proactivity, diceBudget) (ANCHOR-LOCKED; RESULT-ONLY)■
8.1 RECALL■
8.1a step7_proactivity={NPC:{Proactive:[Y/N],Intent:[___],TargetsUser:[Y/N]}...}■
8.1b diceBudget=[r1={{roll 20}},r2={{roll 20}},r3={{roll 20}},r4={{roll 20}},r5={{roll 20}},r6={{roll 20}}]■
***
8.2 AggressionPresent=[Y if any NPC has Proactive=Y AND TargetsUser=Y AND Intent in [ESCALATE_VIOLENCE,BOUNDARY_PHYSICAL]; N otherwise]■
8.2a IF AggressionPresent=N: AGGRESSION_RESULTS={}■
8.2b IF AggressionPresent=N: GOTO=[8.7]■
***
8.3 getUserCoreStats=[{PHY:_____,MND:_____,CHA:_____}]■
***
8.4 FOR EACH NPC where Proactive=Y AND TargetsUser=Y AND Intent in [ESCALATE_VIOLENCE,BOUNDARY_PHYSICAL]: RUN=[8.5..8.6]■
8.5 getCurrentCoreStats(NPC)=[{PHY:_____,MND:_____,CHA:_____}|missing]■
8.5a IF getCurrentCoreStats(NPC)=missing: genStats=[{PHY:_____,MND:_____,CHA:_____}]■
8.5b npcCore=[getCurrentCoreStats(NPC)|genStats]■
8.5c npcDie=[_____]■
8.5d userDie=[_____]■
8.5e npcTotal=[npcDie + (npcCore.PHY)]■
8.5f userTotal=[userDie + (getUserCoreStats.PHY)]■
8.5g margin=[npcTotal-userTotal]■
8.5h ReactionOutcome=(margin>=5)?npc_overpowers:(margin>=1)?npc_succeeds:(margin>=-3)?user_resists:user_dominates■
8.6 AGGRESSION_RESULT={NPC:[Name],ReactionOutcome:[ReactionOutcome],Margin:[margin]}■
***
8.7 AGGRESSION_RESULTS={NPC:{ReactionOutcome:[npc_overpowers|npc_succeeds|user_resists|user_dominates],Margin:[_____]}...}■
</pre_flight>`;
