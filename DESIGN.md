---
name: Snag
description: A cabinet of lifehacks filed as index cards.
colors:
  index-orange: "#e65300"
  paper: "#e8ebe6"
  sheet: "#f7f8f6"
  ink: "#1c1915"
  muted: "#4f4a42"
  rule: "#c9cdc4"
  worked: "#0d6840"
  failed: "#9b1c30"
  select: "#ffd2b8"
  nav: "#f7f8f6"
  paper-dark: "#141714"
  sheet-dark: "#22261f"
  ink-dark: "#f4f1ea"
  muted-dark: "#d2cdc2"
  rule-dark: "#3a4038"
  index-orange-dark: "#ff7a33"
  worked-dark: "#8fdcb0"
  failed-dark: "#ffb4ae"
  select-dark: "#6a3418"
  nav-dark: "#1b1f1b"
typography:
  display:
    fontFamily: "Anybody, Avenir Next Condensed, sans-serif"
    fontSize: "2.4rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "75% stretch"
  display-desk:
    fontFamily: "Anybody, Avenir Next Condensed, sans-serif"
    fontSize: "2.8rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "75% stretch"
  headline:
    fontFamily: "Anybody, Avenir Next Condensed, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "75% stretch"
  headline-desk:
    fontFamily: "Anybody, Avenir Next Condensed, sans-serif"
    fontSize: "1.85rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "75% stretch"
  title:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  tab-corner: "4px"
  tab: "4px 4px 0 0"
  offer: "5px"
  photo: "7px"
  control: "6px"
  sheet: "8px"
  pill: "99px"
spacing:
  tight: "0.35rem"
  stack: "0.75rem"
  pad: "1rem"
  column-pad: "1.25rem"
  column: "40rem"
  nav-clearance: "6.25rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "0.65rem 1rem"
    height: "48px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.4rem 0.55rem"
    height: "44px"
  search:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 0.85rem"
    height: "48px"
  index-card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "0"
  text-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.7rem 0.8rem"
    height: "48px"
---

# Design System: Snag

## Overview

**Creative North Star: "The Index Card"**

Snag looks like a stack of filed cards on workshop paper. The page is a narrow column, left aligned, with the name of the app, a search field, and the cards. Each card is one photo of the thing when a photo exists, the title in condensed type, and a short description of the moment. The verdict sits beside the title. Nothing else competes.

Opening a card raises an orange filing tab and shows the procedure: numbered steps, any pictures the person kept, the way it goes wrong, and the mark for whether it worked. The tab is the only ornament. Depth is the sheet sitting on the paper. There is no drop shadow and no second accent.

The photo is part of the card, not a feed thumbnail. A card with no photo stays a text card. Pictures inside the procedure are the ones the person chose.

**Key Characteristics:**

- One column, one sheet, one orange tab
- Anybody Condensed for the app name and the card title
- Atkinson Hyperlegible for the description, the steps, and the controls
- Flat paper and sheet, tonal, not shadowed
- A photo only when one was kept

## Colors

Workshop paper, a lighter sheet, near-black ink, and one orange filing tab. Status colors report a verdict. They are not a second accent.

### Primary

- **Index Orange** (`colors.index-orange`): the filing tab on an open card, the caret, and the progress fill. In dark mode the same role is Index Orange Dark (`colors.index-orange-dark`).

### Neutral

- **Workshop Paper** (`colors.paper`): the page ground. Dark mode uses Workshop Paper Dark (`colors.paper-dark`).
- **Sheet** (`colors.sheet`): the card, the search field, and the bottom bar in light mode. Dark mode uses Sheet Dark (`colors.sheet-dark`). The light bottom bar is Nav (`colors.nav`), the same value as the sheet. Dark mode uses Nav Dark (`colors.nav-dark`).
- **Ink** (`colors.ink`): text, the primary button, and the focus ring. Dark mode uses Ink Dark (`colors.ink-dark`).
- **Muted Ink** (`colors.muted`): the short description, notes, the untried mark, and inactive nav. Dark mode uses Muted Ink Dark (`colors.muted-dark`).
- **Rule** (`colors.rule`): the hairline on sheets, fields, and the bottom bar. Dark mode uses Rule Dark (`colors.rule-dark`).
- **Worked Green** (`colors.worked`): the "Worked" mark only. Dark mode uses Worked Green Dark (`colors.worked-dark`).
- **Failed Red** (`colors.failed`): the "Failed" mark and destructive text. The same value is the danger role. Dark mode uses Failed Red Dark (`colors.failed-dark`).
- **Select Peach** (`colors.select`): text selection. Dark mode uses Select Peach Dark (`colors.select-dark`).

### Named Rules

**The One Tab Rule.** Index Orange is the tab, the caret, and the progress fill. Buttons are ink on paper. A screen does not get a second accent.

**The Dark Swap Rule.** Dark mode swaps these roles under `prefers-color-scheme`. It does not invent a new palette.

## Typography

**Display Font:** Anybody (with Avenir Next Condensed, then sans-serif)
**Body Font:** Atkinson Hyperlegible (with Segoe UI, then sans-serif)

**Character:** Anybody is compressed, like a label typed on a filing tab. Atkinson is the face you can read while doing the thing. They do not swap jobs.

### Hierarchy

- **Display** (Anybody 700, condensed, `typography.display`): the app name on a screen. At 800px wide it becomes 2.8rem.
- **Headline** (Anybody 700, condensed, `typography.headline`): the card title. At 800px wide it becomes 1.85rem.
- **Title** (Atkinson 700, `typography.title`): the short description is Atkinson 400 at this size, in Muted Ink, clamped to three lines. Atkinson 700 at body size is the form label and the chosen verdict.
- **Body** (Atkinson 400, `typography.body`): steps, notes, and the caveat. Measure stays under 65ch.
- **Label** (Atkinson 700, `typography.label`): visible form labels, sentence case.

### Named Rules

**The Two Voices Rule.** Anybody carries the app name and the card title. Atkinson carries the description, the steps, and every control.

**The Sentence Case Rule.** Labels are sentence case. No tracked capitals, no eyebrows.

## Layout

One column, `spacing.column` wide, centered. Page padding is `spacing.column-pad`, and 2rem from 800px wide. The bottom bar is fixed, three equal columns, and the column keeps `spacing.nav-clearance` plus the safe-area inset so the last control clears it.

Cards stack with 0.85rem between them. An open card adds space above itself so the tab has room. The photo, when there is one, is a 2rem square in the top-left of the card, cropped. The title, the short description, and the verdict stay the main thing and sit beside it. Search and the verdict filters sit under the app name, before the cards. Drawers fold away under a Drawers disclosure. When one drawer is on, its name stays on that disclosure. An open card keeps that same small photo. A step picture is a 1.75rem square at the top-left of its step, and only when that step is the object. The words stay the main thing. Share this card, the pack code, and the link code each fold away. On the computer that keeps the cabinet, the link code starts open. Sync always shows Link to an existing computer and This is that computer.

## Elevation & Depth

The system is flat. A sheet is lighter than the paper, and an open card grows a tab. That is the depth. Nothing casts a shadow.

### Named Rules

**The Flat Sheet Rule.** Do not add a drop shadow to a card, a button, a menu, or a toast. The toast is ink filled with sheet-colored type. It is a slab, not a lift.

## Shapes

Controls, fields, search, and the toast use a short corner (`rounded.control`). The sheet and the instruction block use a slightly longer corner (`rounded.sheet`). The filing tab is a 4.5rem by 12px slab with the top corners rounded (`rounded.tab`), sitting 11px above the open sheet, 1rem from its left edge. A kept photo uses a 3px corner. An offered picture uses `rounded.offer` inside its control. The progress track is a pill (`rounded.pill`).

## Components

### Buttons

- **Shape:** short corners (`rounded.control`). Primary is 48px tall. Quiet and filter buttons are at least 44px tall.
- **Primary:** Ink fill, Sheet type, padding `0.65rem 1rem`. Hover drops opacity to 0.88 where hover exists. Disabled is 0.45 opacity.
- **Hover / Focus:** focus is a 2px Ink outline, 3px outside the control. Dark mode uses Ink Dark for that ring.
- **Quiet:** transparent, Ink type, no border. Danger text uses Failed Red and a Failed Red hairline when the delete is confirmed.

### Chips

Tags are quiet text buttons in Muted Ink, underlined, at least 44px tall. They filter the cabinet. They are not filled pills.

The verdict is a row of radio buttons: Untried, Worked, Failed. The chosen one takes the status color and Atkinson 700. Untried stays Muted Ink at regular weight.

### Cards / Containers

- **Corner Style:** `rounded.sheet`.
- **Background:** Sheet, hairline Rule.
- **Shadow Strategy:** none. See the Flat Sheet Rule.
- **Border:** 1px Rule.
- **Internal Padding:** the face is padded `0.7rem 0.9rem 0.65rem`. The open procedure is padded `0 1rem`.
- **Collapsed:** a 2rem photo in the top-left when `cover` exists. The title, the short description (the situation, clamped to three lines), and the verdict word are the main thing. The whole face is one button.
- **Open:** the orange tab rises from the sheet edge. The card photo stays 2rem in the top-left. Under the face: a step picture, when that step has one, is a 1.75rem square at the top-left of the step, and the step sentence is the main thing. The current step is Atkinson 700 in that list. Then an italic caveat, tag buttons, the source line (the saved URL when there is one), a folded Share this card, the verdict radios, Edit, and Delete. A long URL wraps. It does not get its own section. While the card is open and not being edited, the same step sits in a bar on the nav, just above Cabinet / Snag / Inbox: the count, the sentence, Back, and Next. On the last step, Next becomes Failed and Worked. The bar is Nav with a Rule hairline. It is not a second sheet and it does not use the orange tab. Arrow keys move the step when focus is not in a field. Editing hides the bar. The numbered list stays.

### Inputs / Fields

- **Style:** 1px Rule, Paper fill, `rounded.control`, 48px minimum, padding `0.7rem 0.8rem`. Labels are visible and sit above the field.
- **Focus:** the shared 2px Ink outline. The caret is Index Orange.
- **Error:** Failed Red, Atkinson 700, in an alert. It names what to write.
- **Drop:** dragging a JSON file over the inbox draws a 2px Index Orange outline around the column and one line, "Drop the JSON." A folder of JSON files lands in name order.

Search is a Sheet field with a 20px icon, a transparent input, and a Muted Ink placeholder.

### Navigation

A fixed bottom bar on Nav, hairline Rule on top, three links: Cabinet, Snag, Inbox. Inactive links are Muted Ink. The current link is Ink and Atkinson 700. Each target is at least 48px. Icons are Lucide, one weight, no emoji. Sync is a quiet link under the cabinet filters, not a fourth tab. The sync page is the same sheet: a pairing code, one line of status, and a quiet way back. When this browser is not connected, one action opens the connection on this computer. The address form stays inside a disclosure.

### Index card

The signature is the tab. It is absent while the card is closed. Opening the card raises it once from the sheet edge, 420ms, ease-out. Reduced motion snaps it into place. The photo does not grow a frame of its own. A missing photo does not leave a gray slot. The app mark is that tab on a sheet, beside the cabinet name. On the home screen the sheet fills the tile. iOS asks for apple-touch-icon-120x120.png and also reads apple-touch-icon.png. A missing icon file must not return the page.

## Do's and Don'ts

### Do:

- **Do** keep one column, the sheet on the paper, and the orange tab as the only ornament.
- **Do** set the card title in Anybody Condensed and the short description in Atkinson.
- **Do** leave a card text-only when no photo was kept.
- **Do** show a kept picture as a small square at the top-left, in the order it was kept, so the words stay the main thing.
- **Do** keep targets at least 44px, focus visible, and steps in a real numbered list.

### Don't:

- **Don't** lay the cabinet out as a grid of equal recipe cards.
- **Don't** fill a button with Index Orange.
- **Don't** add a drop shadow, a glass blur, or a second accent.
- **Don't** set the short description in Anybody, or the steps in condensed type.
- **Don't** put an eyebrow, a kicker, or all-caps tracking on a label.
- **Don't** invent a placeholder photo for a card that does not have one.
