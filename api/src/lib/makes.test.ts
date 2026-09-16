/**
 * Every fixture here is a real string from api/data/repairers.json, because
 * the whole difficulty of this module is the shape of the free text a human
 * actually typed into brandSpecifics. Invented tidy inputs would test
 * nothing.
 */
import { describe, expect, it } from "vitest";
import type { Repairer } from "./types";
import { extractMakes, isAllMakes, listMakes, matchesMake } from "./makes";

function repairer(overrides: Partial<Repairer> = {}): Repairer {
  return {
    id: "acme",
    companyName: "Acme Autos",
    vehicleManufacturers: [],
    brandSpecifics: null,
    archivedAt: null,
    archivedBy: null,
    ...overrides,
  } as unknown as Repairer;
}

const allMakes = (over: Partial<Repairer> = {}) =>
  repairer({ vehicleManufacturers: ["All makes and models"], ...over });

const brandSpecific = (brandSpecifics: string, over: Partial<Repairer> = {}) =>
  repairer({ vehicleManufacturers: ["Brand specific"], brandSpecifics, ...over });

describe("isAllMakes", () => {
  it("recognises the category, case-insensitively", () => {
    expect(isAllMakes(allMakes())).toBe(true);
    expect(isAllMakes(repairer({ vehicleManufacturers: ["ALL MAKES AND MODELS"] }))).toBe(true);
    expect(isAllMakes(brandSpecific("VOLVO"))).toBe(false);
    expect(isAllMakes(repairer())).toBe(false);
  });
});

describe("extractMakes", () => {
  it("keeps structured entries and drops the category values", () => {
    const r = repairer({ vehicleManufacturers: ["BMW", "Mini"] });
    expect(extractMakes(r)).toEqual(["BMW", "Mini"]);
    expect(extractMakes(allMakes())).toEqual([]);
    expect(extractMakes(repairer({ vehicleManufacturers: ["Brand specific"] }))).toEqual([]);
  });

  it("splits brandSpecifics on commas", () => {
    expect(extractMakes(brandSpecific("VAG, Isuzu"))).toEqual(["VAG", "Isuzu"]);
    expect(extractMakes(brandSpecific("Audi, VW, SEAT, Skoda"))).toEqual([
      "Audi",
      "VW",
      "SEAT",
      "Skoda",
    ]);
  });

  it("splits on newlines, including the \\r\\n the form produces", () => {
    expect(extractMakes(brandSpecific("BMW \nMercedes \nMINI"))).toEqual([
      "BMW",
      "Mercedes",
      "MINI",
    ]);
    expect(extractMakes(brandSpecific("Land Rover, Range Rover, Jaguar"))).toEqual([
      "Land Rover",
      "Range Rover",
      "Jaguar",
    ]);
  });

  // The reason splitFreeText doesn't split on whitespace: doing so would turn
  // "Land Rover" into "Land" and "Rover", neither of which is a make.
  it("keeps two-word makes intact", () => {
    expect(extractMakes(brandSpecific("LAND ROVER , RANGE ROVER, JAGUAR"))).toEqual([
      "LAND ROVER",
      "RANGE ROVER",
      "JAGUAR",
    ]);
  });

  it("preserves the spelling the data uses", () => {
    expect(extractMakes(brandSpecific("VOLVO"))).toEqual(["VOLVO"]);
    expect(extractMakes(brandSpecific("PORSCHE, MERCEDES ,BMW , AUDI , VW"))[0]).toBe("PORSCHE");
  });

  it("de-duplicates within one repairer", () => {
    const r = repairer({ vehicleManufacturers: ["BMW"], brandSpecifics: "BMW, Mini" });
    expect(extractMakes(r)).toEqual(["BMW", "Mini"]);
  });

  it("drops prose, so it can't be offered as a manufacturer", () => {
    // Cedar Garage Limited's real value.
    const cedar = brandSpecific(
      "Specialists in:-\r\nVolkswagen\r\nAudi\r\nBMW\r\nMercedes\r\nPorsche\r\nSeat\r\nSkoda\r\n\r\n" +
        "Open to repairs on other vehicles including class VII commercial vehicles. " +
        "Diagnostic capabilities are more limited on out of specialist makes.",
    );
    expect(extractMakes(cedar)).toEqual([
      "Volkswagen",
      "Audi",
      "BMW",
      "Mercedes",
      "Porsche",
      "Seat",
      "Skoda",
    ]);
  });

  it("drops a prose lead-in but keeps the makes listed after it", () => {
    // Dartford Transmissions' real value.
    const dartford = brandSpecific(
      "All makes and models are covered, We have Dealer diagnostic tools and experience " +
        "in the following brands;\r\nJLR\r\nBMW\r\nFORD\r\nVAG Group",
    );
    expect(extractMakes(dartford)).toEqual(["JLR", "BMW", "FORD"]);
  });

  it("returns the unfiltered fragments when plausibleOnly is false", () => {
    // Matching searches these, so "Ford" can still find a repairer whose only
    // mention of it is inside "Ford Passenger car only".
    const vertu = brandSpecific("Ford Passenger car only");
    expect(extractMakes(vertu)).toEqual([]);
    expect(extractMakes(vertu, false)).toEqual(["Ford Passenger car only"]);
  });
});

describe("matchesMake", () => {
  it("matches an all-makes garage against any make", () => {
    // The bug this module exists for: filtering by BMW used to exclude all 89
    // repairers that say they handle everything.
    expect(matchesMake(allMakes(), "BMW")).toBe(true);
    expect(matchesMake(allMakes(), "Vauxhall")).toBe(true);
    expect(matchesMake(allMakes(), "JLR")).toBe(true);
  });

  it("matches a structured entry, case-insensitively", () => {
    const sussex = repairer({ vehicleManufacturers: ["JLR"] });
    expect(matchesMake(sussex, "JLR")).toBe(true);
    expect(matchesMake(sussex, "jlr")).toBe(true);
    expect(matchesMake(sussex, "BMW")).toBe(false);
  });

  it("reaches brand specialists through their free text", () => {
    expect(matchesMake(brandSpecific("VOLVO"), "Volvo")).toBe(true);
    expect(matchesMake(brandSpecific("VAG, Isuzu"), "VAG")).toBe(true);
    expect(matchesMake(brandSpecific("Ford Passenger car only"), "Ford")).toBe(true);
    expect(matchesMake(brandSpecific("Audi, VW, SEAT, Skoda"), "Skoda")).toBe(true);
  });

  // Gold Vehicles LTD typed "jaguar landrover" with no separator at all.
  it("finds a make inside an unseparated run of words", () => {
    expect(matchesMake(brandSpecific("jaguar landrover"), "Jaguar")).toBe(true);
  });

  it("matches whole words only", () => {
    // Substring matching would make "Mini" match anything containing it.
    expect(matchesMake(brandSpecific("Administrative vehicles"), "Mini")).toBe(false);
    expect(matchesMake(brandSpecific("BMW \nMercedes \nMINI"), "Mini")).toBe(true);
  });

  it("treats the all-makes category as its own filter, not a wildcard", () => {
    // Selecting "All makes and models" should narrow to those garages, not
    // return everyone.
    expect(matchesMake(allMakes(), "All makes and models")).toBe(true);
    expect(matchesMake(brandSpecific("VOLVO"), "All makes and models")).toBe(false);
  });

  it("matches nothing for a repairer with no makes recorded", () => {
    expect(matchesMake(repairer(), "BMW")).toBe(false);
  });

  it("matches everything when no make is requested", () => {
    expect(matchesMake(repairer(), "")).toBe(true);
  });

  // The regression this whole change is for.
  it("returns all-makes garages AND explicit specialists together", () => {
    const list = [
      allMakes({ id: "does-everything" }),
      repairer({ id: "crago", vehicleManufacturers: ["BMW", "Mini"] }),
      brandSpecific("VOLVO", { id: "volvo-only" }),
    ];
    expect(list.filter((r) => matchesMake(r, "BMW")).map((r) => r.id)).toEqual([
      "does-everything",
      "crago",
    ]);
  });
});

describe("listMakes", () => {
  it("never offers the category values as manufacturers", () => {
    const list = listMakes([allMakes(), brandSpecific("VOLVO")]);
    expect(list).not.toContain("All makes and models");
    expect(list).not.toContain("Brand specific");
    expect(list).toEqual(["VOLVO"]);
  });

  it("is sorted and de-duplicated across repairers", () => {
    const list = listMakes([
      repairer({ id: "a", vehicleManufacturers: ["Mini", "BMW"] }),
      repairer({ id: "b", vehicleManufacturers: ["Audi", "BMW"] }),
    ]);
    expect(list).toEqual(["Audi", "BMW", "Mini"]);
  });

  it("prefers the least-shouty spelling when the data disagrees", () => {
    // The live data has both "MERCEDES" and "Mercedes"; a dropdown reading
    // "AUDI, BMW, Mercedes, PORSCHE" looks broken even though it's accurate.
    const list = listMakes([
      brandSpecific("MERCEDES", { id: "a" }),
      brandSpecific("Mercedes", { id: "b" }),
    ]);
    expect(list).toEqual(["Mercedes"]);
  });

  it("surfaces a make typed into Manage Repairers", () => {
    // Exactly what prompted this: JLR was in the data but never offered.
    expect(listMakes([repairer({ vehicleManufacturers: ["JLR"] })])).toEqual(["JLR"]);
  });

  it("offers nothing from a repairer that only says it does everything", () => {
    expect(listMakes([allMakes()])).toEqual([]);
  });
});
