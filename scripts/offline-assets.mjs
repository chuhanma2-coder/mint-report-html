import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function inlineAssets(html, projectDir) {
  const assets = new Map(), errors = [], base = fs.realpathSync(projectDir);
  function local(ref, parent) {
    if (/^(data:|#)/i.test(ref)) return null;
    if (/^(?:[a-z]+:|\/\/)/i.test(ref)) throw new Error(`external asset must be normalized locally: ${ref}`);
    const file = fs.realpathSync(path.resolve(parent, decodeURIComponent(ref.split(/[?#]/)[0])));
    if (file !== base && !file.startsWith(base + path.sep)) throw new Error(`asset outside project: ${ref}`);
    return file;
  }
  function resource(ref, parent, owner, asCss = false) {
    try {
      const file = local(ref, parent); if (!file) return ref;
      let entry = assets.get(file);
      if (!entry) {
        const bytes = fs.readFileSync(file);
        entry = { file: path.relative(base, file), hash: sha(bytes), bytes: bytes.length, owners: [], status: 'inlined', data: bytes }; assets.set(file, entry);
      }
      entry.owners.push(owner);
      if (asCss) return css(entry.data.toString('utf8'), path.dirname(file), entry.file);
      const type = mime[path.extname(file).toLowerCase()];
      if (!type) throw new Error(`unsupported asset type: ${ref}`);
      return `data:${type};base64,${entry.data.toString('base64')}${ref.includes('#') ? '#' + ref.split('#')[1] : ''}`;
    } catch (error) { errors.push({ reference: ref, owner, status: 'failed', message: error.message }); return ref; }
  }
  function css(text, parent, owner) {
    if (/@import\b/i.test(text)) errors.push({ owner, status: 'failed', message: 'CSS @import must be normalized into a local stylesheet first' });
    return text.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (_, quote, ref) => `url("${resource(ref, parent, owner)}")`);
  }
  const scripts = [];
  let result = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (tag, attrs) => {
    if (/\bsrc\s*=/i.test(attrs)) errors.push({ owner: 'script', status: 'failed', message: 'external scripts must be explicitly inlined before assembly' });
    scripts.push(tag); return `<!--MINT_SCRIPT_${scripts.length - 1}-->`;
  }).replace(/<link\b([^>]+)>/gi, (tag, attrs) => {
    if (!/rel=["']stylesheet["']/i.test(attrs)) return tag;
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    return href ? `<style>${resource(href, base, 'stylesheet', true)}</style>` : tag;
  });
  result = result.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, text) => `<style>${css(text, base, 'style')}</style>`);
  result = result.replace(/<(?:img|video|audio|source|image|use|script|iframe)\b[^>]*>|<[^>]+\b(?:data-media-src|style)=["'][^>]*>/gi, tag => {
    if (/\bsrcset=/i.test(tag)) errors.push({ owner: tag.slice(0, 80), status: 'failed', message: 'srcset requires explicit local single-source normalization' });
    if (/^<(?:iframe|script)\b/i.test(tag) && /\bsrc=/i.test(tag)) { errors.push({ owner: tag.slice(0, 80), status: 'failed', message: 'external scripts/frames must be explicitly inlined before assembly' }); return tag; }
    return tag.replace(/\b(src|poster|href|xlink:href|data-media-src)=(["'])(.*?)\2/gi, (_, attr, quote, ref) => `${attr}=${quote}${resource(ref, base, tag.slice(0, 60))}${quote}`)
      .replace(/\bstyle=(["'])(.*?)\1/gi, (_, quote, text) => `style=${quote}${css(text, base, 'inline-style').replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')}${quote}`);
  });
  result = result.replace(/<!--MINT_SCRIPT_(\d+)-->/g, (_, index) => scripts[Number(index)]);
  return { html: result, manifest: { assets: [...assets.values()].map(({data, ...entry}) => entry), errors, status: errors.length ? 'needs-asset-review' : 'complete' } };
}
