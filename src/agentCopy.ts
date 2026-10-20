export function agentInstructions(origin: string) {
  return `When I ask you to save lifehacks to Snag, give me a JSON file I can import. Do not invent steps.

Preferred shape — one file, many hacks:

{
  "hacks": [
    {
      "situation": "When …",
      "title": "short name",
      "steps": ["one action", "the next action"],
      "caveat": "",
      "tags": ["topic"],
      "url": "https://the-page-this-came-from"
    }
  ]
}

Aliases you may use: when/situation, name/title, instructions/steps, warning/caveat, topics/tags, link/url.
A JSON array of hacks is also fine. JSON Lines (one object per line) is fine.
situation starts with "When". steps are short actions in order. caveat is the way it goes wrong, or "".
Do not put photos or transcripts in the JSON.

I will import the file in Snag → Inbox.

To file a single hack as a link instead, open:

${origin}/inbox#card=BASE64URL

BASE64URL is that one object, UTF-8 JSON, base64url, no padding.`
}
