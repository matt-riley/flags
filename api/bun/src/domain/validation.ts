import {InputValidationError} from "./errors";
import type {ApplicationInput, FlagInput} from "./types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new InputValidationError(`${field} must be a string`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new InputValidationError(`${field} is too long`);
  }
  return result;
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InputValidationError(`${field} is required`);
  }
  return optionalString(value, field, maxLength);
}

function identifier(value: unknown, field: string, pattern: RegExp, allowed: string): string {
  const result = requiredString(value, field, 120).toLowerCase();
  if (!pattern.test(result)) {
    throw new InputValidationError(`${field} must contain only ${allowed}`);
  }
  return result;
}

function applicationIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new InputValidationError("applicationIds must be an array");
  }

  const ids = value.map((item) => requiredString(item, "applicationIds", 36));
  return [...new Set(ids)];
}

export function validateApplicationInput(value: unknown): ApplicationInput;
export function validateApplicationInput(value: unknown, partial: boolean): Partial<ApplicationInput>;
export function validateApplicationInput(value: unknown, partial = false): Partial<ApplicationInput> {
  if (!isRecord(value)) {
    throw new InputValidationError("Request body must be a JSON object");
  }

  const result: Partial<ApplicationInput> = {};
  if (!partial || "name" in value) result.name = requiredString(value.name, "name", 120);
  if (!partial || "slug" in value) result.slug = identifier(value.slug, "slug", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, numbers, and hyphens");
  if (!partial || "description" in value) result.description = optionalString(value.description ?? "", "description", 1000);

  if (Object.keys(result).length === 0) {
    throw new InputValidationError("At least one application field is required");
  }
  return result;
}

export function validateFlagInput(value: unknown): FlagInput;
export function validateFlagInput(value: unknown, partial: boolean): Partial<FlagInput>;
export function validateFlagInput(value: unknown, partial = false): Partial<FlagInput> {
  if (!isRecord(value)) {
    throw new InputValidationError("Request body must be a JSON object");
  }

  const result: Partial<FlagInput> = {};
  if (!partial || "key" in value) result.key = identifier(value.key, "key", /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, "lowercase letters, numbers, underscores, and hyphens");
  if (!partial || "name" in value) result.name = requiredString(value.name, "name", 120);
  if (!partial || "description" in value) result.description = optionalString(value.description ?? "", "description", 1000);
  if (!partial || "enabled" in value) {
    if (typeof value.enabled !== "boolean") {
      throw new InputValidationError("enabled must be a boolean");
    }
    result.enabled = value.enabled;
  }
  if (!partial || "applicationIds" in value || "applicationId" in value) {
    const ids = "applicationIds" in value ? value.applicationIds : [value.applicationId];
    result.applicationIds = applicationIds(ids);
  }

  if (Object.keys(result).length === 0) {
    throw new InputValidationError("At least one flag field is required");
  }
  return result;
}
