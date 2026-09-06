Datapulse CapitalOS — next session (post-audit). Plain text: Ctrl+A to copy this whole file.

=== Datapulse CapitalOS — next session (post-audit) ===

REPO (canonical code):
  c:\Users\evanl\Downloads\datapulse\CapitalOS

WORK IN nil-project ONLY FOR PLANNING; DataPulse code lives under CapitalOS backend/ and frontend/.

--- ALREADY DONE (backend) ---
- backend/supabase/pivot_signals_2026_05.sql  (signal_scores_daily + demand_signals_daily columns + RLS)
- backend/src/data/mock.ts  (SignalId, DemandSignalPoint with per-signal fields)
- backend/src/store/Store.ts + MemoryStore + SupabaseStore  (upsertSignalScore, getRecentSignalScores, appendDemandSignal columns)
- backend/src/pricing/pivotPricing.ts  (10-signal composite, renormalization, conflict rule)
- backend/src/workers/*  (googleTrends, edgarRates, noaaRates, socialVelocity, academic, competitor, govtCalendar, satellite, bloomberg/FRED)
- backend/src/server.ts  (wires all pricing workers + fredOracleWorker)
- backend/src/routes/transparency.ts  (GET /datasets/:id returns 10 signals; GET /datasets/:id/signals for history)

NOTE: Live GUIDE_WEIGHTS uses oracle 0.18 and bloomberg 0.02 (FRED), not the older 0.20 / 0.00 from the original written plan.

--- DO NEXT (highest impact) ---
1. [ ] Ops: Run pivot_signals_2026_05.sql on target Supabase; boot API with service role; confirm signal_scores_daily gets rows and workers log OK.
2. [ ] Frontend: frontend/app/(app)/datasets/[id]/page.tsx — widen types + UI to show all 10 signals and effective weights (API already sends them); fix card copy ("platform + oracle" is wrong).
3. [ ] Optional: Chart or table from GET /api/transparency/datasets/:id/signals?days=30
4. [ ] If sqlite demos matter: backend/src/store/DBStore.ts — implement signal score methods or document "use Supabase for external signals"
5. [ ] Polish: OracleSection.tsx "Five signals"; bloombergWorker.ts header vs GUIDE_WEIGHTS (bloomberg 2%)

=== end ===

Full plan with YAML todos + mermaid: c:\Users\evanl\.cursor\plans\datapulse_session_focus_0e1bb5e0.plan.md
