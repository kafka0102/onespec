# OneSpec Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the OneSpec skill package so state recovery, phase gates, and skill contracts are deterministic and less prone to drift.

**Architecture:** Tighten the shell state machine first so phase and route decisions are enforced by code instead of only by prose. Then align the skill docs and tests with that state machine, including explicit fallback behavior for optional visual-companion dependencies.

**Tech Stack:** Node.js test runner, Bash shell scripts, Markdown skill assets

---

### Task 1: Lock state transitions and recovery output

**Files:**
- Modify: `assets/skills/onespec/scripts/onespec-state.sh`
- Test: `test/state.shell.test.js`

- [ ] **Step 1: Write the failing tests**

Add tests for invalid phase transitions, valid `implementing` transitions, and structured `recover` output including `next_skill`, `next_gate`, and `allowed_actions`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/state.shell.test.js`
Expected: FAIL because the script does not yet validate transitions or emit the structured recovery fields.

- [ ] **Step 3: Write minimal implementation**

Add enumerated state validation in `onespec-state.sh`, introduce legal phase transitions, and update `recover` to emit deterministic next-step metadata.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/state.shell.test.js`
Expected: PASS

### Task 2: Tighten skill contracts around execute and archive gates

**Files:**
- Modify: `assets/skills/onespec/SKILL.md`
- Modify: `assets/skills/onespec-design/SKILL.md`
- Modify: `assets/skills/onespec-execute/SKILL.md`
- Modify: `assets/skills/onespec-archive/SKILL.md`
- Test: `test/skill-content.test.js`

- [ ] **Step 1: Write the failing tests**

Extend content tests to require the new guardrails: `implementing` phase recording, recover-to-skill guidance, visual companion fallback, closeout confirmation wording, and archive wording that matches the intended policy.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/skill-content.test.js`
Expected: FAIL because the current skills do not include all required guardrail language.

- [ ] **Step 3: Write minimal implementation**

Update the skill markdown so the router and child skills explicitly describe state-backed routing, `implementing` phase recording, dependency fallback for `visual-companion.md`, and concrete archive/merge confirmation language.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/skill-content.test.js`
Expected: PASS

### Task 3: Verify the full package stays aligned

**Files:**
- Modify: `test/state.shell.test.js`
- Modify: `test/skill-content.test.js`

- [ ] **Step 1: Run the focused suites together**

Run: `node --test test/state.shell.test.js test/skill-content.test.js`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test --silent`
Expected: PASS

- [ ] **Step 3: Review for drift**

Confirm the final test expectations match the actual recovery text and skill policy, with no leftover assertions from older wording.
