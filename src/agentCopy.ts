export function agentInstructions(origin: string) {
  return `When I ask you to save a lifehack to Snag, file it by opening this URL:

${origin}/inbox#card=BASE64URL

BASE64URL is the UTF-8 JSON below, encoded as base64url with no padding and no line breaks.

{
  "situation": "When …",
  "title": "short name",
  "steps": ["one action", "the next action"],
  "caveat": "",
  "tags": ["topic"],
  "source": { "kind": "agent", "label": "your name", "url": "https://the-page-this-came-from" }
}

situation is the moment this is useful, and it starts with "When".
steps are short actions in the order to do them.
caveat is the way it goes wrong. Use an empty string if there isn't one.
source.url is the page the hack came from. Leave it out if there isn't one.
File one hack per link.
Open the URL in the browser. Do not send the card anywhere else.`
}
