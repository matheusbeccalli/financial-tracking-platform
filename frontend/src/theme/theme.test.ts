import { describe, expect, it } from "vitest";

import { parseMode, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("system segue a preferência do SO", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("modo manual ignora a preferência do SO", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
  });
});

describe("parseMode", () => {
  it("aceita valores válidos", () => {
    expect(parseMode("light")).toBe("light");
    expect(parseMode("dark")).toBe("dark");
    expect(parseMode("system")).toBe("system");
  });
  it("trata inválido/ausente como system", () => {
    expect(parseMode(null)).toBe("system");
    expect(parseMode("blue")).toBe("system");
  });
});
