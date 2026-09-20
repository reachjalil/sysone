/** A host-side integration example. This returns advice and never plays audio. */
export async function recommendRecordedReaction(engine, input, { isCurrent, signal }) {
  const snapshot = structuredClone(input);
  const candidates = snapshot.candidates.filter(c => !snapshot.completedCues.includes(c.id)).slice(0, 8);
  const silence = { action: 'silence', candidateId: null };
  if (signal?.aborted || !isCurrent(snapshot.contextId)) return silence;
  if (!candidates.length || snapshot.silenceSeconds < 3) return silence;
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(2100)])
    : AbortSignal.timeout(2100);
  try {
    const reply = await engine.run('dialogue', { ...snapshot, candidates }, bounded);
    if (bounded.aborted || !isCurrent(snapshot.contextId)) return silence;
    const result = reply.result;
    if (result?.contextId !== snapshot.contextId) return silence;
    if (result.action === 'fallback') return { action: 'fallback', candidateId: null };
    if (result.action !== 'speak') return silence;
    if (!Number.isFinite(result.probability) || result.probability < 0.8 || result.probability > 1) return silence;
    if (!candidates.some(c => c.id === result.candidateId)) return silence;
    return { action: 'speak', candidateId: result.candidateId };
  } catch {
    return signal?.aborted || !isCurrent(snapshot.contextId)
      ? silence
      : { action: 'fallback', candidateId: null };
  }
}
