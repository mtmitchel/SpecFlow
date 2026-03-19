# UX copy guidelines

This document defines how SpecFlow should sound in the product UI.

Use it together with [`product-language-spec.md`](product-language-spec.md):

- [`product-language-spec.md`](product-language-spec.md) decides canonical product terms and workflow framing.
- `ux-copy-guidelines.md` decides tone, sentence mechanics, and component-level copy patterns.

If those documents conflict, the product-language spec wins for terminology and workflow meaning.

## Purpose

Write product copy that helps people move forward with confidence.

Good UX copy should:

- lower cognitive load
- clarify what is happening
- make the next action obvious

## Voice and personality

- Be calm, confident, and professional.
- Sound human, not robotic.
- Use conversational language without slang.
- Use contractions when they make the writing feel natural.
- Be concise. Put the important information first.
- Write in American English.
- Prefer a steady, helpful tone over a clever or playful one.

## Core principles

- Focus on the user’s intent, not the system’s internals.
- Name actions by outcome, not by feature name.
- Write for fast scanning. Front-load key words.
- Reduce friction with clear next steps.
- Keep terminology consistent across the product.
- Match the user’s mental model. If the structure is confusing, copy alone will not fix it.

## SpecFlow-specific alignment

- Keep the dominant mental model as `guided planning workspace`.
- Follow [`product-language-spec.md`](product-language-spec.md) for canonical terms such as `Initiative`, `Brief intake`, `Coverage check`, `Verify work`, `Run`, `Up next`, and `Needs review`.
- Do not leak implementation language like `workflow state`, `operation`, `bundle manifest`, or `phase check` into default UI copy unless technical precision is necessary.
- Keep planning copy grounded in the user’s current step. Do not make the UI sound like a planner console or document archive.

## Style rules

- Use sentence case for headers, buttons, labels, and toasts.
- Do not use all caps in UI text.
- Do not use ampersands in UI copy. Write `and`.
- Use periods for full sentences.
- Do not use periods in buttons, short labels, or headings.
- Do not use ellipses in static text or placeholder text.
- Use ellipses only for active loading states.
- Use numerals for measurements, dates, time, and most counts.

## Writing rules

- Prefer active voice.
- Use passive voice only when it is clearer or less blaming.
- Be blame-free in errors and validation.
- Do not use dev-speak such as `fetch`, `render`, `submit form`, or `object`.
- Do not use filler words.
- Do not say `please` unless the brand standard changes.
- Do not say `click here`. Name the action or destination.
- Avoid noun-stacked phrases that sound mechanical or clinical.
- Prefer verbs, direct questions, and plain language.

## Structure and scannability

- Put the most important word near the start of the line.
- Keep paragraphs short.
- Break dense text into lists when it contains multiple related points.
- Do not mix bullets and numbered lists in the same block.
- When using label-style bullets, keep the key short and readable.
- Use bold sparingly and only to create scan anchors.

## Component guidance

### Buttons

- Start with a strong verb.
- Be specific about the object.
- Avoid vague labels like `OK`, `Submit`, `Yes`, and `No`.
- Prefer labels like `Save changes`, `Create initiative`, or `Delete file`.

### Empty states

Use this structure:

1. What this is
2. Why it is empty
3. What to do next

Example:

`No tickets yet. Generate tickets when the plan is ready.`

### Error messages

- Say what happened.
- Say what the user can do next.
- Do not blame the user.
- Keep it short.

Bad:

`Authentication failed.`

Better:

`We couldn’t sign you in. Check your email and password.`

### Success messages and toasts

- Confirm the action and the object.
- Keep it to one short sentence.
- When the action is reversible, offer `Undo`.

Example:

`Initiative archived.`

### Loading states

- Use ellipses only while work is actively in progress.
- Say what is happening when the wait may be noticeable.

Examples:

- `Saving...`
- `Preparing your export...`

### Form fields

- Labels should be short noun phrases.
- Placeholders should show an example, not repeat the label.
- Helper text should give the minimum useful guidance.
- Validation should say what is wrong and how to fix it.

### Destructive actions

- Do not use generic confirmation buttons like `Yes` and `No`.
- Label buttons with the actual outcome.
- For high-risk actions, prefer type-to-confirm over a single click.

Example:

`Delete workspace?`

Buttons:

- `Delete workspace`
- `Keep workspace`

## Data and advisory writing

- Write like a person giving guidance, not a system status feed.
- Weave data into natural sentences instead of cramming it into parentheses.
- Avoid label-heavy prose like `Reason:` or `Recommendation:`.
- Use human time phrasing such as `due today`, `due tomorrow`, or `was due Jan 10`.
- Avoid cold notification phrasing like `needs attention`, `flagged`, or `item`.

## Accessibility

- Alt text should describe purpose, not appearance.
- Icon-only controls need descriptive `aria-label` text.
- Directional instructions should not depend on layout. Say `Select Save`, not `Click the button on the right`.

## Strict do-not list

- No all caps
- No ampersands
- No static ellipses
- No dev-speak
- No blame
- No `click here`
- No vague destructive labels
- No mixed list styles
- No unnecessary filler
- No slang unless the brand explicitly calls for it

## Quality checklist

Before shipping copy, confirm that it is:

- clear
- concise
- consistent
- specific
- scannable
- blame-free
- actionable
- accessible
- written in sentence case
- free of jargon and placeholder-style system language
