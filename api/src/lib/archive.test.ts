import { describe, expect, it } from "vitest";
import type { Repairer } from "./types";
import { RepairerNotFoundError, applyArchive, isActive, isArchived } from "./archive";

const ACTOR = "jake.quaradeghini@autoprotectgroup.co.uk";

function repairer(overrides: Partial<Repairer> = {}): Repairer {
  return {
    id: "acme-autos",
    companyName: "Acme Autos",
    tradingAddress: "1 Test Street, Testville",
    postcode: "SW1A 1AA",
    lat: 51.5,
    lon: -0.1,
    geocoded: true,
    phoneNumber: null,
    emailAddress: null,
    mainContactName: null,
    openToRepeatWork: null,
    coverageRadiusMiles: null,
    vehicleManufacturers: [],
    brandSpecifics: null,
    capabilities: [],
    diagnosticsEquipment: [],
    drivetrainTypes: [],
    labourRate: null,
    providesRecovery: null,
    recoveryChargeRate: null,
    workshopRampVolume: null,
    hasDealerRelationship: null,
    dealerNames: null,
    apgComments: null,
    recentRepairCount: null,
    repairCountAsOf: null,
    archivedAt: null,
    archivedBy: null,
    ...overrides,
  };
}

describe("isArchived", () => {
  it("treats a null stamp as active", () => {
    expect(isArchived(repairer())).toBe(false);
    expect(isActive(repairer())).toBe(true);
  });

  it("treats a stamped record as archived", () => {
    const r = repairer({ archivedAt: "2026-09-03T10:00:00.000Z", archivedBy: ACTOR });
    expect(isArchived(r)).toBe(true);
    expect(isActive(r)).toBe(false);
  });

  // 10 of the 114 live records have no recentRepairCount key at all, so a
  // field added later is genuinely absent rather than null on existing data.
  // A `=== null` check would wrongly report every one of those as archived
  // and empty the whole search.
  it("treats a record with the key entirely absent as active", () => {
    const legacy = repairer();
    delete (legacy as Partial<Repairer>).archivedAt;
    delete (legacy as Partial<Repairer>).archivedBy;
    expect(isArchived(legacy)).toBe(false);
    expect(isActive(legacy)).toBe(true);
  });
});

describe("applyArchive", () => {
  const now = new Date("2026-09-03T10:00:00.000Z");

  it("stamps the time and the actor", () => {
    const { updated } = applyArchive([repairer()], "acme-autos", true, ACTOR, now);
    expect(updated.archivedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(updated.archivedBy).toBe(ACTOR);
  });

  it("clears both fields when restoring", () => {
    const stored = repairer({ archivedAt: "2026-08-01T10:00:00.000Z", archivedBy: ACTOR });
    const { updated } = applyArchive([stored], "acme-autos", false, ACTOR, now);
    expect(updated.archivedAt).toBeNull();
    expect(updated.archivedBy).toBeNull();
  });

  it("leaves every other field on the record untouched", () => {
    const stored = repairer({ companyName: "Acme Autos", labourRate: 55, geocoded: true });
    const { updated } = applyArchive([stored], "acme-autos", true, ACTOR, now);
    expect(updated).toEqual({ ...stored, archivedAt: now.toISOString(), archivedBy: ACTOR });
  });

  it("leaves other repairers untouched and preserves list order", () => {
    const list = [
      repairer({ id: "first" }),
      repairer({ id: "acme-autos" }),
      repairer({ id: "last" }),
    ];
    const { next } = applyArchive(list, "acme-autos", true, ACTOR, now);
    expect(next.map((r) => r.id)).toEqual(["first", "acme-autos", "last"]);
    expect(next[0]).toEqual(list[0]);
    expect(next[2]).toEqual(list[2]);
  });

  it("does not mutate the input list", () => {
    const list = [repairer()];
    applyArchive(list, "acme-autos", true, ACTOR, now);
    expect(list[0].archivedAt).toBeNull();
  });

  it("is idempotent -- archiving an already-archived record just re-stamps it", () => {
    const stored = repairer({ archivedAt: "2026-08-01T10:00:00.000Z", archivedBy: "someone@x" });
    const { next, updated } = applyArchive([stored], "acme-autos", true, ACTOR, now);
    expect(next).toHaveLength(1);
    expect(updated.archivedAt).toBe(now.toISOString());
    expect(updated.archivedBy).toBe(ACTOR);
  });

  it("throws for an unknown id rather than silently no-oping", () => {
    expect(() => applyArchive([repairer()], "no-such-repairer", true, ACTOR, now)).toThrow(
      RepairerNotFoundError,
    );
  });

  // The whole point of archiving rather than deleting: the row stays, so the
  // Databricks mirror still contains it (the intake-merge job anti-joins new
  // sign-ups against that mirror by company name) and its slug stays taken.
  it("keeps the record in the list, so its id and company name are still present", () => {
    const { next } = applyArchive([repairer()], "acme-autos", true, ACTOR, now);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("acme-autos");
    expect(next[0].companyName).toBe("Acme Autos");
  });
});

describe("what Search sees", () => {
  // Guards the actual filter search.ts applies, so "archived repairers still
  // show up in search" can't regress silently.
  it("excludes archived and keeps active", () => {
    const list = [
      repairer({ id: "active-one" }),
      repairer({ id: "archived-one", archivedAt: "2026-09-01T10:00:00.000Z" }),
      repairer({ id: "active-two" }),
    ];
    expect(list.filter(isActive).map((r) => r.id)).toEqual(["active-one", "active-two"]);
  });

  it("keeps everything when nothing is archived", () => {
    const list = [repairer({ id: "a" }), repairer({ id: "b" })];
    expect(list.filter(isActive)).toHaveLength(2);
  });
});
