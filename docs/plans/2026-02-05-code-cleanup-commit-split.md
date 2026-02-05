# Codebase Cleanup (Commit Split) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep all existing changes, but reorganize them into clean, feature-focused commits for reviewability.

**Architecture:** No behavior changes. Only re-stage and commit existing modifications by feature area, minimizing cross-cutting diffs in each commit. Use `git add -p` to avoid mixing unrelated hunks.

**Tech Stack:** Git, pnpm, TypeScript, React, Firebase Functions

---

## Pre-Flight Notes / Concerns
- Local/notes files are modified (`.claude/settings.local.json`, `WORK_SESSION_MEMO.md`, `TODO.md`, possibly others). Confirm whether these should be committed.

---

### Task 1: Dependency updates (web)

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Step 1: Review diff scope**
Run: `git diff --stat -- web/package.json web/package-lock.json`

**Step 2: Stage and commit**
Run: `git add web/package.json web/package-lock.json`
Commit: `git commit -m "chore(web): update dependencies"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 2: Backend billing/org setup (Functions)

**Files (expected):**
- Modify: `functions/src/api/billing.ts`
- Modify: `functions/src/lib/billing.ts`
- Modify: `functions/src/stripeTriggers.ts`
- Modify: `functions/src/stripeWebhook.ts`
- Modify: `functions/src/api/org-setup.ts`

**Step 1: Review diff scope**
Run: `git diff --stat -- functions/src/api/billing.ts functions/src/lib/billing.ts functions/src/stripeTriggers.ts functions/src/stripeWebhook.ts functions/src/api/org-setup.ts`

**Step 2: Stage and commit**
Run: `git add -p <files above>`
Commit: `git commit -m "feat(functions): billing and org setup updates"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 3: Backend members/collaborators/access

**Files (expected):**
- Modify: `functions/src/api/project-members-api.ts`
- Modify: `functions/src/lib/project-members.ts`
- Modify: `functions/src/api/collaborators-api.ts`
- Modify: `functions/src/lib/access-helpers.ts`

**Step 1: Review diff scope**
Run: `git diff --stat -- functions/src/api/project-members-api.ts functions/src/lib/project-members.ts functions/src/api/collaborators-api.ts functions/src/lib/access-helpers.ts`

**Step 2: Stage and commit**
Run: `git add -p <files above>`
Commit: `git commit -m "feat(functions): project members and access logic"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 4: Backend misc admin/projects/tasks/firestore

**Files (expected):**
- Modify: `functions/src/admin-delete-user.ts`
- Modify: `functions/src/admin-search-email.ts`
- Modify: `functions/src/api/admin-impersonation.ts`
- Modify: `functions/src/api/projects.ts`
- Modify: `functions/src/api/tasks.ts`
- Modify: `functions/src/lib/firestore.ts`

**Step 1: Review diff scope**
Run: `git diff --stat -- <files above>`

**Step 2: Stage and commit**
Run: `git add -p <files above>`
Commit: `git commit -m "chore(functions): admin and project/task updates"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 5: Frontend billing/setup UI

**Files (expected):**
- Modify: `web/src/components/BillingGateOverlay.tsx`
- Modify: `web/src/components/TrialExpiredModal.tsx`
- Modify: `web/src/pages/SetupPage.tsx`
- Modify: `web/src/components/DemoLoginScreen.tsx`

**Step 1: Review diff scope**
Run: `git diff --stat -- <files above>`

**Step 2: Stage and commit**
Run: `git add -p <files above>`
Commit: `git commit -m "feat(web): billing and setup UI"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 6: Frontend core UI / Gantt / Tasks

**Files (expected):**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/GanttChart/*`
- Modify: `web/src/components/Modals/*`
- Modify: `web/src/components/ProjectEditDialog.tsx`
- Modify: `web/src/components/ProjectMembersDialog.tsx`
- Modify: `web/src/components/Task*` (if changed)
- Modify: `web/src/hooks/*`
- Modify: `web/src/lib/*`
- Add: `web/src/lib/cache.ts`
- Add: `web/src/lib/diff.ts`

**Step 1: Review diff scope**
Run: `git diff --stat -- web/src/App.tsx web/src/components web/src/hooks web/src/lib`

**Step 2: Stage and commit**
Run: `git add -p web/src/App.tsx web/src/components web/src/hooks web/src/lib`
Commit: `git commit -m "feat(web): gantt and task UI updates"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 7: Docs & notes

**Files (expected):**
- Modify: `docs/*`
- Modify: `TODO.md`
- Modify: `WORK_SESSION_MEMO.md`
- Modify: `docs/product-spec.md`
- Modify: `docs/FEATURE_ORG_TEMPLATE.md`

**Step 1: Review diff scope**
Run: `git diff --stat -- docs TODO.md WORK_SESSION_MEMO.md`

**Step 2: Stage and commit**
Run: `git add -p docs TODO.md WORK_SESSION_MEMO.md`
Commit: `git commit -m "docs: update specs and notes"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 8: Misc files

**Files (expected):**
- Modify: `.claude/settings.local.json` (confirm if commit)
- Modify: `imanohtml elements.txt`
- Add: `launch-compass-topmost.bat`
- Other top-level text files listed in status

**Step 1: Review diff scope**
Run: `git diff --stat -- .claude/settings.local.json "imanohtml elements.txt" launch-compass-topmost.bat`

**Step 2: Stage and commit**
Run: `git add -p <files above>`
Commit: `git commit -m "chore: misc local and tooling updates"`

**Step 3: Verify**
Run: `git status -sb`

---

### Task 9: Final verification

**Step 1: Ensure clean status**
Run: `git status -sb`

**Step 2: Review commit list**
Run: `git log --oneline -n 10`

