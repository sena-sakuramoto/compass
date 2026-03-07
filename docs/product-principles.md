# Compass Product Principles

Last updated: 2026-03-06

## Primary Source

This section records direct product intent from the project owner as primary source material.

### Source note

- Date: 2026-03-06
- Source: user conversation in Codex
- Priority: highest

## Core Goal

Compass exists to help projects move forward smoothly.

It is not a task creation or task management tool for its own sake.
Tasks only matter insofar as they help a project reach its goal.

## Planning Model

Compass should be designed around a goal hierarchy:

1. Project goal
2. Sub-goals
3. Smaller sub-goals
4. Tasks as concrete units of progress

In practice, goals and tasks are often very close in meaning.
The product should treat them as a connected structure, not as isolated flat task rows.

## Ball Model

In architecture and construction workflows, progress depends heavily on handoffs and back-and-forth communication.

Because of that, Compass must make this easy to understand:

- who currently has the ball
- which task or goal is blocked on another party
- where the ball is within the path toward the higher goal
- how local handoffs affect overall project progress

The ball is not a side feature.
It is part of the core model for understanding project flow.

## Product Implications

### What should be primary

- project goal progress
- sub-goal progress
- current blockers
- current ball owner
- handoff status between parties
- what must happen next to move the project forward

### What should be secondary

- raw task metadata
- dense edit forms
- optional settings
- management-oriented fields that do not help movement

## UX Implications

The UI should follow these rules:

- show what helps the project move
- avoid exposing settings unless they directly help the next action
- avoid adding fields just because they are available
- make handoffs and waiting states visible without making the screen feel like a control panel
- keep the relationship between goal, sub-goal, and ball state understandable at a glance

## Interaction Principle

This section records another direct product intent from the project owner as primary source material.

### Source note

- Date: 2026-03-06
- Source: user conversation in Codex
- Priority: highest

Compass should feel easy to handle in a rough, natural way.

The software should not make the user hesitate and wonder whether an action is safe.
It should feel forgiving:

- the user can operate quickly without fear
- mistakes can be undone immediately
- casual or imprecise interaction still leads to the intended outcome
- the product should guide the user back to the right path instead of punishing small mistakes

This means "safe to use" is not a polish detail.
It is a core product quality.

## UX Consequences Of This Principle

Before adding controls, flows, or settings, evaluate them with these questions:

- Will this make the user hesitate before clicking?
- If the user makes a mistake, can they recover in one step?
- Can the same goal be reached even if the user takes a rough path?
- Does the interface help the user continue instead of forcing perfect data entry?

In practice, Compass should prefer:

- reversible actions
- clear undo paths
- low-risk defaults
- progressive disclosure instead of dense forms
- interfaces that tolerate imperfect input

## Current Direction

From this principle onward, Compass should be planned as:

- a project navigation tool
- a goal and blocker visibility tool
- a handoff and ball tracking tool

and not primarily as:

- a generic task database
- a form-heavy task admin UI

## Design Filter

Before adding any UI or field, evaluate it with this question:

"Does this help the user understand how to move the project toward its goal?"

If the answer is no, it should usually be hidden, deferred, or removed.
