import { describe, expect, it } from "vitest";
import { lookupSizeFromReg } from "./regToSize";

describe("lookupSizeFromReg", () => {
  it("always returns not-implemented -- no real reg->size provider exists yet", async () => {
    const result = await lookupSizeFromReg("AB12 CDE");
    expect(result).toEqual({ size: null, loadIndex: null, speedRating: null, source: "not-implemented" });
  });
});
