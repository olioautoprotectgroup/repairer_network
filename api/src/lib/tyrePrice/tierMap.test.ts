import { describe, expect, it } from "vitest";
import { knownBrandNames, tierForBrand } from "./tierMap";

describe("tierForBrand", () => {
  it("classifies known brands", () => {
    expect(tierForBrand("Michelin")).toBe("premium");
    expect(tierForBrand("Dunlop")).toBe("mid");
    expect(tierForBrand("Nexen")).toBe("budget");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(tierForBrand("  michelin  ")).toBe("premium");
    expect(tierForBrand("MICHELIN")).toBe("premium");
  });

  it("returns 'unknown' for an unmapped or missing brand", () => {
    expect(tierForBrand("SomeObscureBrand")).toBe("unknown");
    expect(tierForBrand(undefined)).toBe("unknown");
    expect(tierForBrand(null)).toBe("unknown");
  });
});

describe("knownBrandNames", () => {
  it("returns proper-cased brand names", () => {
    const names = knownBrandNames();
    expect(names).toContain("Michelin");
    expect(names).toContain("Nexen");
    expect(names).not.toContain("michelin");
  });
});
