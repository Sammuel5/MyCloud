import { describe, expect, it } from "vitest";
import {
  mapFolderRoleToChild,
  maxRole,
  roleAtLeast,
} from "@/lib/access";

describe("access role ranking", () => {
  it("picks the strongest role", () => {
    expect(maxRole(null, "viewer", "editor")).toBe("editor");
    expect(maxRole("viewer", "owner", "editor")).toBe("owner");
    expect(maxRole(undefined, null)).toBeNull();
  });

  it("compares roles by capability", () => {
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("editor", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast(null, "viewer")).toBe(false);
  });

  it("downgrades inherited folder ownership on children", () => {
    expect(mapFolderRoleToChild("owner")).toBe("editor");
    expect(mapFolderRoleToChild("editor")).toBe("editor");
    expect(mapFolderRoleToChild("viewer")).toBe("viewer");
    expect(mapFolderRoleToChild(null)).toBeNull();
  });
});
