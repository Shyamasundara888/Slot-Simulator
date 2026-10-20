import { describe, expect, it as test } from "vitest";
import { en } from "../app/src/i18n/en.js";
import { it } from "../app/src/i18n/it.js";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("traduzioni del client", () => {
  test("ogni lingua ha le stesse chiavi dell'italiano", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(it).sort());
  });

  test("ogni testo usa gli stessi segnaposto in ogni lingua", () => {
    const keys = Object.keys(it) as (keyof typeof it)[];
    const different = keys.filter((key) => placeholders(en[key]).join() !== placeholders(it[key]).join());
    expect(different).toEqual([]);
  });
});
