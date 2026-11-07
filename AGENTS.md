<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Uploaded Flask Hub corrections are standalone versioned source deliveries, not a replacement for the TanStack preview; keep the external server dependency explicit.
- Railway Hub deliveries use Gunicorn with one worker, volume-backed SQLite and a mandatory environment-configured access gate; this preserves data and blocks anonymous access without changing the legacy internal login.
- Parse Hub CSV imports transactionally on the supplied server so expedition and labor inputs remain independent and invalid files cannot partially overwrite data.
- Reject standalone Hub client snapshots older than the latest CSV import; this prevents stale polling or queued saves from erasing imported data.
- Generate standalone labor display exports locally with canvas from assignment state; this keeps PNG downloads independent of external rendering services.
- Standalone Hub directions resolve to one exclusive Labor bank before rendering or allocation; ambiguous legacy directions require a manual choice to prevent cross-bank ownership.
- HC comparisons derive roster and absence counts from G&G unless explicitly overridden, subtracting mutually exclusive absence states once.
- Standalone Hub schedules keep monthly shift/notes settings and derive scheduled attendance from calendar-safe entry dates with versioned application signatures; sector operational status remains a separate field.
- Standalone Hub management bases and transfer decisions are server-owned state protected from client snapshots; verified internal cookie sessions enforce ADM creation and the other TL's approval transactionally.
- Standalone Hub conveyor GOL uses three subpost arrays within one GOL; migrate legacy names into movimentadores once to preserve assignments.
- Standalone expedition reports extend the legacy Labor UI; handover records are server-owned, and internal ADM sessions authorize expedition assignment changes to preserve exclusive manual banks.
- Standalone XPT and Recebimento share a vehicle-board renderer; XPT vehicles are nested within legacy team records and flattened for reports, while pure planning rules generate explicit, confirmed PLS plans to preserve compatibility and exclusive ownership.
- Standalone shared board clearing resets assignment slots only, preserving vehicle/report data and exclusive directions; body-level collaborator tooltips close on navigation and rerender so they cannot outlive their cards.
