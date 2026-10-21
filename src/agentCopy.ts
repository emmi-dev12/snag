export function chatgptPrompt(drawers: string[] = []) {
  const names = [...new Set(drawers.map((name) => name.trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const drawerLine = names.length ? `\nDrawers already in this cabinet: ${names.join(", ")}.\nUse one of these names unless the hack needs a new drawer.\n` : ""
  return `Create one JSON of every lifehack in this conversation. I will paste it into Snag. Reply with the JSON only. No code fence and no other text.

The first character of your reply is { and the last character is }.
Do not write a heading, a label, or the word Hacks before the JSON.
Do not wrap the JSON in backticks.
Use straight double quotes. No trailing commas. No comments.

{
  "hacks": [
    {
      "situation": "When …",
      "title": "short name",
      "steps": ["one action", "the next action"],
      "caveat": "",
      "category": "kitchen",
      "tags": ["topic"],
      "url": "https://the-page-this-came-from"
    }
  ]
}

Include every hack from this chat. Do not invent a step that was not discussed.
situation is the moment and starts with "When".
title is a short name.
steps is an array of strings: short actions in order, at most 12, each one sentence. Do not number them.
caveat is the way it goes wrong, or "".
category is one short drawer, one or two words, lowercase, at most 24 characters, such as kitchen, laundry, or car.
Use the same category again for hacks that belong together. Snag filters by that name.
category is the drawer. The cabinet shows one button per drawer. Clicking Computer shows only the computer hacks.
${drawerLine}If a hack with the same title is already in the cabinet, Snag updates that card instead of adding a second copy. Use that to move a hack into another drawer.
tags is an array of a few words, at most 8. Do not start a tag with #.
url is the page the hack came from, or omit it.
Write a url as a normal address, https://example.com/page. Do not put a backslash before : or . or /. https\\:// and www\\. are not valid JSON, and Snag rejects the whole paste.
One reply is one JSON object. At most 80 hacks. If this chat has more than 80, return the first 80 and stop. Wait to be asked for the next 80.
No photos and no transcripts.
A backslash belongs in a string only to escape a quote or a real backslash.

If Snag says "That isn't JSON Snag can read.", the paste was rejected. Reply with the same hacks as corrected raw JSON and no other text. Remove any heading. Remove any code fence. Rewrite every url as a plain https:// address with no backslashes. Keep the situations, titles, steps, caveats, categories, and tags. Still at most 80 hacks in that one object.

These names also work: when, name, instructions, warning, topics, link, drawer.`
}
