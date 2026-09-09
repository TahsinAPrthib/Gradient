export type Message = { text: string; tone: "ok" | "bad" };

/**
 * Turns the query string a server action redirected back with into a banner.
 *
 * Two shapes are supported, matching what the actions send:
 *   - failure: ?error=cannot-delete   (the key is the value of `error`)
 *   - success: ?created=1             (the key is the parameter name itself)
 *
 * Anything not present in the caller's `messages` map is ignored, so a
 * hand-typed ?error=<script> in the URL can never render arbitrary text.
 */
export function pickMessage(
  searchParams: Record<string, string | string[] | undefined>,
  messages: Record<string, Message>,
): Message | undefined {
  const rawError = searchParams.error;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;

  if (error && error in messages) {
    return messages[error];
  }

  for (const [key, message] of Object.entries(messages)) {
    if (message.tone === "ok" && searchParams[key] !== undefined) {
      return message;
    }
  }

  return undefined;
}
