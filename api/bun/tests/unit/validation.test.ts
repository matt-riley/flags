import {describe, expect, it} from "bun:test";
import {InputValidationError} from "../../src/domain/errors";
import {validateApplicationInput, validateFlagInput} from "../../src/domain/validation";
import {appA} from "../helpers";

describe("input validation", () => {
  it("normalizes complete application input and supports a partial update", () => {
    expect(validateApplicationInput({name: "  Storefront ", slug: "Store-Front"})).toEqual({
      name: "Storefront",
      slug: "store-front",
      description: "",
    });
    expect(validateApplicationInput({description: "  Updated  "}, true)).toEqual({description: "Updated"});
  });

  it("normalizes complete flag input, de-duplicates ids, and supports the singular alias", () => {
    expect(validateFlagInput({
      key: " CHECKOUT_REDESIGN ",
      name: " Checkout ",
      description: undefined,
      enabled: false,
      applicationId: appA,
    })).toEqual({
      key: "checkout_redesign",
      name: "Checkout",
      description: "",
      enabled: false,
      applicationIds: [appA],
    });
    expect(validateFlagInput({applicationIds: [appA, appA], enabled: true}, true)).toEqual({
      applicationIds: [appA],
      enabled: true,
    });
  });

  it("rejects malformed bodies and invalid field values", () => {
    const invalid = (fn: () => unknown, message: string) => {
      expect(fn).toThrow(InputValidationError);
      expect(fn).toThrow(message);
    };

    invalid(() => validateApplicationInput(null), "Request body must be a JSON object");
    invalid(() => validateApplicationInput({}, true), "At least one application field is required");
    invalid(() => validateApplicationInput({name: "", slug: "ok"}), "name is required");
    invalid(() => validateApplicationInput({name: "a".repeat(121), slug: "ok"}), "name is too long");
    invalid(() => validateApplicationInput({name: "App", slug: "not valid"}), "slug must contain only");
    invalid(() => validateApplicationInput({name: "App", slug: "ok", description: 4}), "description must be a string");
    invalid(() => validateApplicationInput({name: "App", slug: "ok", description: "a".repeat(1001)}), "description is too long");
    invalid(() => validateFlagInput(null), "Request body must be a JSON object");
    invalid(() => validateFlagInput({key: "bad key", name: "Flag", enabled: true, applicationIds: []}), "key must contain only");
    invalid(() => validateFlagInput({key: "flag", name: "", enabled: true, applicationIds: []}), "name is required");
    invalid(() => validateFlagInput({key: "flag", name: "Flag", enabled: "yes", applicationIds: []}), "enabled must be a boolean");
    invalid(() => validateFlagInput({key: "flag", name: "Flag", enabled: true, applicationIds: "not-an-array"}), "applicationIds must be an array");
    invalid(() => validateFlagInput({key: "flag", name: "Flag", enabled: true, applicationIds: [""]}), "applicationIds is required");
    invalid(() => validateFlagInput({}, true), "At least one flag field is required");
  });
});
