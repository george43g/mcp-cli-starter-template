# ExecPlans

Checked-in execution plans for multi-hour, cross-cutting, risky, or
uncertainty-heavy work. Plans live in the repo — never in an external file — so
they survive context compaction, agent restarts, and machine moves.

## When to write one

Use a lightweight inline plan (or none) for bounded changes. Create an ExecPlan
here when the work is any of:

- multi-hour or expected to span sessions/compactions;
- touching many files or several surfaces at once (MCP / TUI / CLI / packages);
- risky (release shape, transport/auth, dependency majors, lifecycle);
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
- Completed plans stay here with `Status: complete` — history is evidence, not
  clutter. Fold durable outcomes into [PROJECT_STATE.md](../PROJECT_STATE.md).

## Active continuation records

The current thread's state lives in [`HANDOFF.md`](../../HANDOFF.md) (front door:
where you are, first steps, next decision) and
[PROJECT_STATE.md](../PROJECT_STATE.md) (durable record: what exists, why, and
what's deferred). An ExecPlan supplements those for a specific work-stream; it
does not replace them.
