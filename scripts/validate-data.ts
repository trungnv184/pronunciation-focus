/**
 * Validates the committed data files against the zod contract.
 * Run with `npm run validate` (CI and the deploy workflow run it too).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodType } from "zod";
import { ChannelListSchema, OverridesSchema, VideoIndexSchema } from "../src/data/schema";

const root = resolve(fileURLToPath(import.meta.url), "../..");

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function check<T>(rel: string, schema: ZodType<T>, errors: string[]): T | undefined {
  let json: unknown;
  try {
    json = readJson(rel);
  } catch (err) {
    errors.push(`${rel}: cannot read/parse JSON (${(err as Error).message})`);
    return undefined;
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${rel}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return undefined;
  }
  return result.data;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of values) (seen.has(v) ? dups : seen).add(v);
  return [...dups];
}

function validateAll(): string[] {
  const errors: string[] = [];
  const index = check("public/data/videos.json", VideoIndexSchema, errors);
  const channels = check("data/channels.json", ChannelListSchema, errors);
  check("data/overrides.json", OverridesSchema, errors);

  if (index) {
    for (const id of duplicates(index.videos.map((v) => v.id))) {
      errors.push(`public/data/videos.json: duplicate video id ${id}`);
    }
  }
  if (channels) {
    for (const h of duplicates(channels.map((c) => c.handle.toLowerCase()))) {
      errors.push(`data/channels.json: duplicate handle ${h}`);
    }
  }
  return errors;
}

const errors = validateAll();
if (errors.length) {
  console.error(`Data validation failed (${errors.length}):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("Data validation passed.");
