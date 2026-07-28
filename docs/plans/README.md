# ExecPlans

Checked-in execution plans for multi-hour, cross-surface, risky, or
uncertainty-heavy work. Plans live in the repo — never in an external file —
because the original scaffolder plan lived at
`~/.claude/plans/2-programmable-mcp-scaffolder.md` and was lost when that
environment changed. Repo-local plans survive context compaction, agent
restarts, and machine moves.

## When to write one

Use a lightweight inline plan (or none) for bounded changes. Create an
ExecPlan here when the work is any of:

- multi-hour or expected to span sessions/compactions;
- touching multiple generated surfaces (canonical + `lib/` + `example/`);
- risky (retrofit behavior, publication, CI shape, dependency majors);
- exploratory enough that discoveries will change the approach mid-flight.

## Convention

- One file per plan: `docs/plans/<yyyy-mm>-<slug>.md`.
- A plan is **self-contained and current**: someone with no chat history can
  resume from it. Update it as you work; a stale plan is worse than none.
- Required sections:
  - **Goal** — outcome + acceptance criteria, not a task list.
  - **Status** — `active` | `paused` | `complete`, with a dated progress log.
  - **Discoveries** — facts learned that changed (or could change) the plan.
  - **Decisions** — what was chosen, what was rejected, and why.
  - **Validation** — commands run and their observed results.
  - **Recovery** — how to safely resume or roll back mid-flight.
- Completed plans stay here with `Status: complete` — history is evidence,
  not clutter. Fold durable outcomes into
  [PROJECT_STATE.md](../PROJECT_STATE.md) and delete nothing.

## Active continuation records

The current thread's state is tracked in [`HANDOFF.md`](../../HANDOFF.md)
(front door: git state, do-not-repeat list, next decision) and
[PROJECT_STATE.md](../PROJECT_STATE.md) (durable record: history, verification
evidence, deferred work). An ExecPlan supplements those for a specific
work-stream; it does not replace them.
