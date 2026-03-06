#!/usr/bin/env node
/**
 * generate-widget-metadata.js
 *
 * Reads every widget file in src/widgets/, extracts the metadata fields from
 * the `export const widget` block, and writes http/widget-metadata.json.
 *
 * Run at container startup (or build time) so the frontend can load widget
 * metadata without importing every widget module.
 *
 * Usage:  node scripts/generate-widget-metadata.js
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

// Support being run from any location: use WIDGET_ROOT env or default to script's parent dir
const rootDir = process.env.WIDGET_ROOT || (() => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    return join(dirname(__filename), '..');
  } catch {
    // Fallback when piped via stdin (import.meta.url is not a file URL)
    return process.cwd();
  }
})();

const widgetsDir = join(rootDir, 'src', 'widgets');
const outFile = join(rootDir, 'http', 'widget-metadata.json');

// Files in src/widgets/ that are NOT widget modules
const IGNORE = new Set(['timezones.ts']);

/**
 * Extract the value of a simple key from the widget export block.
 * Handles string literals (single/double/backtick quoted), numbers, booleans,
 * simple objects, and simple arrays.
 */
function extractField(block, key) {
  // Match key: 'value' or key: "value" or key: `value`
  const stringRe = new RegExp(`['"]?${key}['"]?\\s*:\\s*(['"\`])((?:(?!\\1).)*?)\\1`);
  const stringMatch = block.match(stringRe);
  if (stringMatch) return stringMatch[2];

  // Match key: number or key: true/false
  const primitiveRe = new RegExp(`['"]?${key}['"]?\\s*:\\s*([\\d.]+|true|false)`);
  const primitiveMatch = block.match(primitiveRe);
  if (primitiveMatch) {
    const val = primitiveMatch[1];
    if (val === 'true') return true;
    if (val === 'false') return false;
    return Number(val);
  }

  return undefined;
}

/**
 * Extract a simple object literal { key: value, ... } for a given field name.
 */
function extractObject(block, key) {
  const re = new RegExp(`['"]?${key}['"]?\\s*:\\s*\\{`);
  const match = re.exec(block);
  if (!match) return undefined;

  let depth = 0;
  let start = match.index + match[0].length - 1; // the opening {
  for (let i = start; i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') {
      depth--;
      if (depth === 0) {
        const objStr = block.slice(start, i + 1)
          // Convert unquoted keys to quoted keys for JSON parsing
          .replace(/(\w+)\s*:/g, '"$1":')
          // Replace single quotes with double quotes (for string values)
          .replace(/'/g, '"');
        try {
          return JSON.parse(objStr);
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

/**
 * Extract the full `export const widget` block from source text.
 * We find the opening `{` after the declaration and balance braces,
 * but we stop BEFORE the `renderer:` line so we don't try to parse
 * class instantiation.
 */
function extractWidgetBlock(source) {
  const marker = /export\s+const\s+widget[\s:]/;
  const m = marker.exec(source);
  if (!m) return null;

  // Find the opening brace
  let start = source.indexOf('{', m.index);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return null;
}

const metadata = [];

const files = readdirSync(widgetsDir)
  .filter(f => f.endsWith('.ts') && !IGNORE.has(f))
  .sort();

for (const file of files) {
  const source = readFileSync(join(widgetsDir, file), 'utf-8');
  const block = extractWidgetBlock(source);
  if (!block) {
    console.warn(`⚠️  No 'export const widget' found in ${file}, skipping`);
    continue;
  }

  const type = extractField(block, 'type');
  const name = extractField(block, 'name');
  const icon = extractField(block, 'icon');
  const description = extractField(block, 'description');
  const hasSettings = extractField(block, 'hasSettings');
  const defaultSize = extractObject(block, 'defaultSize');
  const defaultContent = extractObject(block, 'defaultContent');

  // If hasSettings isn't explicitly declared, check if the renderer has a configure() method
  const derivedHasSettings = hasSettings !== undefined
    ? hasSettings
    : /configure\s*\(/.test(source);

  if (!type || !name) {
    console.warn(`⚠️  Widget in ${file} missing type or name, skipping`);
    continue;
  }

  metadata.push({
    type,
    name,
    icon: icon || '',
    description: description || '',
    defaultSize: defaultSize || { w: 400, h: 300 },
    defaultContent: defaultContent || {},
    hasSettings: derivedHasSettings,
  });

  console.log(`  ✅ ${type} (${name})`);
}

writeFileSync(outFile, JSON.stringify(metadata, null, 2) + '\n');
console.log(`\n📦 Generated ${outFile} with ${metadata.length} widgets`);
