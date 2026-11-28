# Media surfaces tracer-bullet tickets

Methodology: to-tickets (vertical capability slices, blocking edges declared).

Surfaces: image/content.tsx (506), video/content.tsx (489), music/content.tsx (251).
Each is a Replicate-prediction generation flow sharing: react-hook-form + zodResolver,
POST to /api/{modality}, 3s setInterval poll of /api/{modality}/predictions/{id},
KoFiNudge + useSupportNudge (trackActivity), ParameterDrawer, and identical
loading/empty/error/output blocks.

Blocking graph: M1,M2,M3 → M4 → M5 (orchestrator collapse).

- [ ] M1 replicate-poll — extract the shared prediction POST + 3s poll + status
      state-machine into `media/useReplicatePrediction.ts`. Takes { submitUrl,
      pollUrl template, onSucceeded(output), trackActivity }. Removes the three
      copy-pasted `ReplicatePrediction` interfaces + three polling useEffects.
      Edges: none.
- [ ] M2 loading/empty/error states — extract the identical success/loading/
      error/empty display blocks into `media/GenerationStates.tsx` (accent prop:
      violet/emerald/rose). Edges: none.
- [ ] M3 media-composer — extract the Heading + form shell + submit button +
      ParameterDrawer wiring into `media/MediaComposer.tsx` (prompt input +
      optional parameter sections as children/slots). Edges: none.
- [ ] M4 generation-dispatch — extract each modality's submit handler (payload
      construction + model-preference persistence for image) into a thin
      modality-specific hook `media/useImageGen.ts` / `useVideoGen.ts` /
      `useMusicGen.ts` that composes M1. Edges: M1.
- [ ] M5 orchestrator-collapse — page/content files become thin orchestrators;
      purge orphaned imports + dead state; normalize the three duplicate
      `ReplicatePrediction` interfaces into one shared type under `media/types.ts`.
      Edges: all prior.

Proven reuse (from chat/code refactor): `useSupportNudge` already shared; keep
`ParameterDrawer`/`ParameterSection` as-is (already a shared component).