export const PRE_FLIGHT_PROMPT_TEXT = String.raw`<pre_flight>
ALWAYS EXECUTE all steps within this <pre_flight>...</pre_flight> block before composing the final response. This is the planning stage.
STRICTLY FOLLOW THESE RULES:
1. EXECUTE all steps and substeps in order.
2. SINGLE-PASS: fill a line once, move to the next. NO edits, reconsideration, self-correction, or "but wait".
3. DICE FINALITY: all dice values are final. NO re-rolls or substitutions.
4. RESULT-ONLY MODE: output expected values ONLY. NEVER explain how anything was evaluated. Write only final field values and exact handoff objects.
5. DO NOT OUTPUT ANY PART OF THIS BLOCK IN THE FINAL RESPONSE.
==START==
NUCLEAR RULE: Fill each line with EXPLICITLY requested data ONLY.
VIOLATION = FAILURE + DELETE ALL TEXT + REGENERATE.
ANY TEXT AFTER ■ OR A FIELD VALUE ON THE SAME LINE = VIOLATION.
ANY ENGINE EXPLANATION = VIOLATION.
FIRST YES WINS.
DO NOT OUTPUT ANY PART OF THIS BLOCK IN YOUR FINAL RESPONSE.
==START==
NUCLEAR RULE: Fill each line with EXPLICITLY requested data ONLY. NO TEXT AFTER ■ OR A FIELD VALUE.
VIOLATION = FAILURE + DELETE ALL TEXT + REGENERATE.
FIRST YES WINS.
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
STEP 2: EXECUTE ResolutionEngine(input) (ANCHOR-LOCKED; RESULT-ONLY)■
2.0 roll_pool=[r0={{roll 20}},r1={{roll 20}},r2={{roll 20}},r3={{roll 20}},r4={{roll 20}},r5={{roll 20}}]■
***
2.1 identifyGoal=[_____]■
2.2 identifyTargets=[ActionTargets:[_____],OppTargets:{NPC:[_____],ENV:[_____]},BenefitedObservers:[_____],HarmedObservers:[_____]]■
2.3 checkIntimacyGate=[Y/N]■
2.4 hasStakes=[Y/N]■
2.5 NPCInScene=[all living NPCs {{user}} interacted with, plus identifyTargets.BenefitedObservers and identifyTargets.HarmedObservers]■
***
2.6 IF hasStakes=N:■
2.6a actions=[a1]■
2.6b resolveOutcome=[{OutcomeTier:NONE,LandedActions:(none),Outcome:no_roll,CounterPotential:none}]■
2.6c GOTO=[2.8]■
***
2.7 IF hasStakes=Y:■
2.7a actionCount=[[a1] or [a1,a2] or [a1,a2,a3]]■
2.7b actions=[actionCount]■
2.7c mapStats (from explicit means in input; use goal only if needed)=[USER:[_____],OPP:[_____]]■
2.7d getUserCoreStats=[{PHY:_____,MND:_____,CHA:_____}]■
2.7e targetCore=[(none)]■
2.7f IF mapStats.OPP!=ENV:■
2.7g primaryOppTarget=[first identifyTargets.OppTargets.NPC]■
2.7h getCurrentCoreStats(primaryOppTarget)=[{PHY:_____,MND:_____,CHA:_____}|missing]■
2.7i IF getCurrentCoreStats(primaryOppTarget)=missing:■
2.7j genStats.Rank=[_____]■
2.7k genStats.MainStat=[_____]■
2.7l genStats=[{PHY:_____,MND:_____,CHA:_____}]■
2.7m targetCore=[genStats]■
2.7n IF getCurrentCoreStats(primaryOppTarget)!=missing: targetCore=[getCurrentCoreStats(primaryOppTarget)]■
2.7o resolveOutcome=[{OutcomeTier:_____,LandedActions:_____,Outcome:_____,CounterPotential:_____}]■
***
2.8 HANDOFF={GOAL:[identifyGoal],actions:[actions],IntimacyConsent:[checkIntimacyGate],STAKES:[hasStakes],LandedActions:[resolveOutcome.LandedActions],OutcomeTier:[resolveOutcome.OutcomeTier],Outcome:[resolveOutcome.Outcome],CounterPotential:[resolveOutcome.CounterPotential],ActionTargets:[identifyTargets.ActionTargets],OppTargets:[identifyTargets.OppTargets],BenefitedObservers:[identifyTargets.BenefitedObservers],HarmedObservers:[identifyTargets.HarmedObservers],NPCInScene:[NPCInScene]}■
***
STEP 3: EXECUTE RelationshipEngine(npc, step2) (ANCHOR-LOCKED; RESULT-ONLY)■
3.1 RECALL■
3.1a step2_relational={GOAL:[___],IntimacyConsent:[Y/N],LandedActions:[___],OutcomeTier:[___],Outcome:[___],ActionTargets:[___],OppTargets:{NPC:[___]},BenefitedObservers:[___],HarmedObservers:[___],NPCInScene:[___]}■
3.1b NPC_LIST=[step2_relational.NPCInScene]■
3.1c FOR EACH NPC: RUN=[3.2..3.7]■
***
3.2 relevant=[Y/N]■
3.2a IF relevant=N: NPC_HANDOFF={NPC:npc.name,FinalState:UNINITIALIZED,Lock:None,Behavior:None,Target:No Change,NPC_STAKES:N,Override:NONE,Landed:step2_relational.LandedActions>0?Y:N,OutcomeTier:step2_relational.OutcomeTier||NONE,NarrationBand:step2_relational.Outcome||standard,IntimacyGate:SKIP}■
3.2b IF relevant=N: GOTO=[NEXT_NPC]■
***
3.3 getCurrentRelationalState=[{currentDisposition:[B:_,F:_,H:_]|null,currentRapport:[0|1|2|3|4|5],rapportEncounterLock:[Y/N],intimacyGate:[ALLOW|DENY|SKIP]}]■
3.3a newEncounterExplicit=[Y/N]■
3.3b rapportEncounterLock=[(newEncounterExplicit=Y)?N:getCurrentRelationalState.rapportEncounterLock]■
3.3c IF getCurrentRelationalState.currentDisposition!=null: currentDisposition=[getCurrentRelationalState.currentDisposition]■
3.3d IF getCurrentRelationalState.currentDisposition!=null: GOTO=[3.3k]■
3.3e initPreset.romanticOpen=[Y/N]■
3.3f initPreset.userBadRep=[Y/N]■
3.3g initPreset.userGoodRep=[Y/N]■
3.3h initPreset.userNonHuman=[Y/N]■
3.3i initPreset=[first Y: romanticOpen|userBadRep|userGoodRep|userNonHuman|neutralDefault]■
3.3j currentDisposition=[initPreset]■
3.3k currentRapport=[getCurrentRelationalState.currentRapport]■
***
3.4 isAllowed=[step2_relational.IntimacyConsent]■
3.4a auditInteraction=[Y/N]■
3.4b NPC_STAKES=[auditInteraction]■
3.4c routeDispositionTarget=[Bond|Hostility|Fear|FearHostility|No Change]■
3.4d updateRapport=[{currentRapport:[0|1|2|3|4|5],rapportEncounterLock:[Y/N]}]■
3.4e currentRapport=[updateRapport.currentRapport]■
3.4f rapportEncounterLock=[updateRapport.rapportEncounterLock]■
***
3.5 deriveDirection=[{b:_,f:_,h:_}|{b:_,f:_,h:_,rapportReset:Y}]■
3.5a updateDisposition=[B:_,F:_,H:_]■
3.5b currentDisposition=[updateDisposition]■
3.5c IF deriveDirection.rapportReset=Y: currentRapport=[0]■
3.5d IF deriveDirection.rapportReset!=Y: currentRapport=[updateRapport.currentRapport]■
3.5e save currentRapport=[currentRapport] to sceneTracker■
3.5f save rapportEncounterLock=[rapportEncounterLock] to sceneTracker■
***
3.6 classifyDisposition=[lock:_____,behavior:_____]■
3.6a checkThreshold=[LockActive:[Y/N],OverrideActive:[Y/N],Override:[Transactional|Hedonist|Exploitation|Established|NONE]]■
3.6b IntimacyGate=(checkThreshold.LockActive=Y)?DENY:(isAllowed=Y)?ALLOW:(currentDisposition.B>=4)?ALLOW:(checkThreshold.OverrideActive=Y)?ALLOW:SKIP■
3.6c IF IntimacyGate=SKIP: GOTO=[3.7]■
3.6d IF IntimacyGate=ALLOW: save IntimacyGate=ALLOW to sceneTracker■
3.6e IF IntimacyGate=DENY: save IntimacyGate=DENY to sceneTracker■
***
3.7 NPC_HANDOFF={NPC:npc.name,FinalState:B\${currentDisposition.B}/F\${currentDisposition.F}/H\${currentDisposition.H},Lock:[classifyDisposition.lock],Behavior:[classifyDisposition.behavior],Target:[routeDispositionTarget],NPC_STAKES:[NPC_STAKES],Override:[checkThreshold.Override],Landed:step2_relational.LandedActions>0?Y:N,OutcomeTier:step2_relational.OutcomeTier||NONE,NarrationBand:step2_relational.Outcome||standard,IntimacyGate:[IntimacyGate]}■
***
STEP 4: EXECUTE CHAOS_INTERRUPT(step2_context, step3_handoffs, sceneSummary, diceList) (ANCHOR-LOCKED; RESULT-ONLY)■
4.1 RECALL■
4.1a step2_context={GOAL:[___],ActionTargets:[___]}■
4.1b step3_handoffs=[{NPC:[Name],FinalState:[...],Lock:[...],Target:[...],Landed:[Y/N],OutcomeTier:[...],NarrationBand:[...],Behavior:[...],IntimacyGate:[ALLOW|DENY|SKIP]}...]■
4.1c sceneSummary=[_____]■
4.1d diceList=[A={{roll 20}},O={{roll 20}},I={{roll 20}},anchorIdx={{roll 20}},vectorIdx={{roll 20}}]■
***
4.2 getCtx=[PUBLIC|ISOLATED]■
4.2a A=[diceList.A]■
4.2b IF A<17: CHAOS_HANDOFF={CHAOS:{triggered:false,band:None,magnitude:None,anchor:None,vector:None,personVector:false,fullText:null}}■
4.2c IF A<17: GOTO=[4.4]■
***
4.3 O=[diceList.O]■
4.3a I=[diceList.I]■
4.3b classifyBand=[HOSTILE|COMPLICATION|BENEFICIAL]■
4.3c classifyMagnitude=[EXTREME|MAJOR|MODERATE|MINOR]■
4.3d anchorIdx=[diceList.anchorIdx]■
4.3e pickAnchor=[GOAL|ENVIRONMENT|KNOWN_NPC|RESOURCE|CLUE]■
4.3f vectorIdx=[diceList.vectorIdx]■
4.3g pickVector=[NPC|CROWD|AUTHORITY|ENVIRONMENT|SYSTEM|ENTITY]■
4.3h personVector=[Y/N]■
4.3i CHAOS_HANDOFF={CHAOS:{triggered:true,band:[classifyBand],magnitude:[classifyMagnitude],anchor:[pickAnchor],vector:[pickVector],personVector:[personVector],fullText:null}}■
***
STEP 5: EXECUTE NameGenerationEngine(context, seed, explicitNameKnown, isLocation) (ANCHOR-LOCKED; RESULT-ONLY)■
5.1 nameRequired=[Y if a distinct unnamed person or location may appear, enter, be introduced, be identified, or be specifically mentioned in the immediate response being composed; N otherwise]■
5.1a IF nameRequired=N: generatedName=[(none)]■
5.1b IF nameRequired=N: GOTO=[5.2]■
5.1c explicitNameKnown=[Y/N]■
5.1d isLocation=[Y/N]■
5.1e seed=[...]■
5.1f normalizeSeed=[...]■
5.1g detectMode=[PERSON|LOCATION]■
5.1h generatedName=[...] (generatedName is FINAL and must NOT be changed)■
***
STEP 6: EXECUTE NPCProactivityEngine(step3_proactivity, step2_action, chaos_action, diceBudget) (ANCHOR-LOCKED; RESULT-ONLY)■
6.1 RECALL■
6.1a step2_action={GOAL:[___],LandedActions:[___],CounterPotential:[___],ActionTargets:[___],OppTargets:{ENV:[___]}}■
6.1b step3_proactivity=[{NPC:[Name],FinalState:[...],Lock:[...],Target:[...],NPC_STAKES:[Y/N],IntimacyGate:[...],Override:[...],Landed:[Y/N]}...]■
6.1c chaos_action={CHAOS:{triggered:[Y/N],band:[HOSTILE|COMPLICATION|BENEFICIAL|None]}}■
6.1d diceBudget=[p1={{roll 20}},p2={{roll 20}},p3={{roll 20}},p4={{roll 20}},p5={{roll 20}},p6={{roll 20}},p7={{roll 20}},p8={{roll 20}},p9={{roll 20}}]■
***
6.2 classifyAction=[Normal_Interaction|Combat|Social|Skill|Intimacy_Physical|Intimacy_Verbal]■
6.2a chaosBand=[HOSTILE|COMPLICATION|BENEFICIAL|None]■
6.2b counterPotential=[none|light|medium|severe]■
6.2c cap=[1|2|3]■
***
6.3 FOR EACH NPC handoff: RUN=[6.4..6.6]■
6.4 parseFinalState=[{B:_,F:_,H:_}]■
6.4a deriveLock=[TERROR|HATRED|FREEZE|None]■
6.4b lock=[handoff.Lock|deriveLock]■
6.4c NPC_STAKES=[handoff.NPC_STAKES|N]■
6.4d IntimacyGate=[handoff.IntimacyGate|SKIP]■
6.4e Override=[handoff.Override|NONE]■
6.4f deriveImpulse=[ANGER|FEAR|BOND]■
6.4g classifyProactivityTier=[DORMANT|LOW|MEDIUM|HIGH|FORCED]■
6.4h provisionalResult={NPC:[Name],Proactive:N,Intent:NONE,Impulse:[deriveImpulse],TargetsUser:N}■
6.4i IF classifyProactivityTier=FORCED: candidate={NPC:[Name],die:20,tier:FORCED,intent:ESCALATE_VIOLENCE,impulse:ANGER,TargetsUser:Y,Threshold:AUTO,passes:Y}■
6.4j IF classifyProactivityTier=FORCED: GOTO=[NEXT_NPC]■
***
6.5 proactivityDie=[next diceBudget die]■
6.5a thresholdFromTier=[16|13|10|8]■
6.5b passes=[Y/N]■
6.5c IF passes=Y: selectIntent=[ESCALATE_VIOLENCE|BOUNDARY_PHYSICAL|THREAT_OR_POSTURE|CALL_HELP_OR_AUTHORITY|WITHDRAW_OR_BOUNDARY|INTIMACY_OR_FLIRT|SUPPORT_ACT|PLAN_OR_BANTER]■
6.5d intent=[selectIntent|NONE]■
6.5e IF passes=Y: targetsUserFromIntent=[Y/N]■
6.5f IF passes!=Y: targetsUserFromIntent=[N]■
6.5g IF passes=Y: candidate={NPC:[Name],die:[proactivityDie],tier:[classifyProactivityTier],intent:[intent],impulse:[deriveImpulse],TargetsUser:[targetsUserFromIntent],Threshold:[thresholdFromTier],passes:Y}■
***
6.6 sortCandidates=[highest die first]■
6.6a IF candidates empty: GOTO=[6.8]■
6.6b selectedCandidates=[up to cap NPCs]■
***
6.7 FOR EACH selected candidate:■
6.7a finalResult={NPC:[Name],Proactive:Y,Intent:[___],Impulse:[ANGER|FEAR|BOND],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED],ProactivityDie:[_____],Threshold:[AUTO|16|13|10|8]}■
***
6.8 FINAL_RESULTS={NPC:{Proactive:[Y/N],Intent:[___],Impulse:[ANGER|FEAR|BOND],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED]?,ProactivityDie:[_____]? ,Threshold:[AUTO|16|13|10|8]?}...}■
***
STEP 7: EXECUTE NPCAggressionResolution(step6_proactivity, diceBudget) (ANCHOR-LOCKED; RESULT-ONLY)■
7.1 RECALL■
7.1a step6_proactivity={NPC:{Proactive:[Y/N],Intent:[___],TargetsUser:[Y/N]}...}■
7.1b diceBudget=[r1={{roll 20}},r2={{roll 20}},r3={{roll 20}},r4={{roll 20}},r5={{roll 20}},r6={{roll 20}}]■
***
7.2 AggressionPresent=[Y if any NPC has Proactive=Y AND TargetsUser=Y AND Intent in [ESCALATE_VIOLENCE,BOUNDARY_PHYSICAL]; N otherwise]■
7.2a IF AggressionPresent=N: AGGRESSION_RESULTS={}■
7.2b IF AggressionPresent=N: GOTO=[7.7]■
***
7.3 getUserCoreStats=[{PHY:_____,MND:_____,CHA:_____}]■
***
7.4 FOR EACH NPC where Proactive=Y AND TargetsUser=Y AND Intent in [ESCALATE_VIOLENCE,BOUNDARY_PHYSICAL]: RUN=[7.5..7.6]■
7.5 getCurrentCoreStats(NPC)=[{PHY:_____,MND:_____,CHA:_____}|missing]■
7.5a IF getCurrentCoreStats(NPC)=missing: genStats=[{PHY:_____,MND:_____,CHA:_____}]■
7.5b npcCore=[getCurrentCoreStats(NPC)|genStats]■
7.5c npcDie=[_____]■
7.5d userDie=[_____]■
7.5e npcTotal=[npcDie + (npcCore.PHY)]■
7.5f userTotal=[userDie + (getUserCoreStats.PHY)]■
7.5g margin=[npcTotal-userTotal]■
7.5h ReactionOutcome=(margin>=5)?npc_overpowers:(margin>=1)?npc_succeeds:(margin>=-3)?user_resists:user_dominates■
7.6 AGGRESSION_RESULT={NPC:[Name],ReactionOutcome:[ReactionOutcome],Margin:[margin]}■
***
7.7 AGGRESSION_RESULTS={NPC:{ReactionOutcome:[npc_overpowers|npc_succeeds|user_resists|user_dominates],Margin:[_____]}...}■
</pre_flight>`;
