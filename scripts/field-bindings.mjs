import { getField } from "./interaction-contract.mjs";
export const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
// Only leaf text fields are bindable; never replace a card/container's children.
export function bindFields(html, model) {
  const errors = [];
  const rendered = html.replace(/<([\w:-]+)\b([^>]*\bdata-field-path=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/g, (whole, tag, attrs, fieldPath, content) => {
    const value = getField(model, fieldPath);
    if (!/data-edit-policy=["']editable["']/.test(attrs)) return whole;
    if (typeof value !== "string") { errors.push(`unresolved editable text field: ${fieldPath}`); return whole; }
    if (/<(?:div|p|h[1-6]|section|article|table|li)\b/i.test(content)) { errors.push(`non-leaf editable field: ${fieldPath}`); return whole; }
    const existing = content.replace(/<[^>]*>/g, "").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
    const body = existing.replace(/\s/g, "") === value.replace(/\s/g, "") ? content : escapeHtml(value);
    return `<${tag}${attrs}>${body}</${tag}>`;
  });
  return { html: rendered, errors };
}
