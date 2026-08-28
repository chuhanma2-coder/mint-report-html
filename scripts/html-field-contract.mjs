const ALLOWED_REASONS = new Set([
  "system-control",
  "page-number",
  "source-identity",
  "computed-value",
  "embedded-content",
  "decorative-label"
]);

const parseAttributes = (tag) => Object.fromEntries(
  [...tag.matchAll(/([:\w-]+)(?:\s*=\s*["']([^"']*)["'])?/g)].slice(1).map((match) => [match[1].toLowerCase(), match[2] ?? ""])
);

export function auditTextFieldContracts(markup) {
  const source = String(markup || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const stack = [];
  const textRuns = [];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  for (const token of source.match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith("</")) {
      const closing = token.match(/^<\/\s*([\w:-]+)/)?.[1]?.toLowerCase();
      while (stack.length) if (stack.pop().tag === closing) break;
      continue;
    }
    if (token.startsWith("<")) {
      if (/^<!|^<\?/.test(token)) continue;
      const tag = token.match(/^<\s*([\w:-]+)/)?.[1]?.toLowerCase();
      if (!tag) continue;
      const node = { tag, attrs: parseAttributes(token) };
      stack.push(node);
      if (voidTags.has(tag) || /\/\s*>$/.test(token)) stack.pop();
      continue;
    }
    const text = token.replace(/\s+/g, " ").trim();
    if (!text || !stack.length) continue;
    if (stack.some((node) => node.attrs["aria-hidden"] === "true" || "data-ui-control" in node.attrs)) continue;
    const contract = [...stack].reverse().find((node) => node.attrs["data-edit-policy"]);
    textRuns.push({
      text: text.slice(0, 80),
      hostTag: stack.at(-1).tag,
      policy: contract?.attrs["data-edit-policy"] || null,
      fieldPath: contract?.attrs["data-field-path"] || null,
      reason: contract?.attrs["data-edit-reason"] || null,
      elementId: contract?.attrs["data-element-id"] || null,
      contentId: contract?.attrs["data-content-id"] || null,
      qaRole: contract?.attrs["data-qa-role"] || null,
      overlap: contract?.attrs["data-qa-overlap"] || null
    });
  }
  const uncovered = textRuns.filter((run) => !run.policy);
  const editable = textRuns.filter((run) => run.policy === "editable" && run.fieldPath);
  const invalidEditable = textRuns.filter((run) => run.policy === "editable" && !run.fieldPath);
  const intentionalRestricted = textRuns.filter((run) => ["locked", "derived"].includes(run.policy) && ALLOWED_REASONS.has(run.reason));
  const invalidRestricted = textRuns.filter((run) => ["locked", "derived"].includes(run.policy) && !ALLOWED_REASONS.has(run.reason));
  const invalidIdentity = textRuns.filter((run) => run.policy && (!run.elementId || !run.contentId));
  const invalidGeometry = textRuns.filter((run) => run.policy && (run.qaRole !== "text" || !["forbid", "allow-contained", "allow-same-group"].includes(run.overlap)));
  return {
    textRuns,
    uncovered,
    editable,
    invalidEditable,
    intentionalRestricted,
    invalidRestricted,
    invalidIdentity,
    invalidGeometry,
    covered: editable.length + intentionalRestricted.length,
    total: textRuns.length,
    coverage: textRuns.length ? (editable.length + intentionalRestricted.length) / textRuns.length : 1
  };
}

export const allowedEditReasons = [...ALLOWED_REASONS];
