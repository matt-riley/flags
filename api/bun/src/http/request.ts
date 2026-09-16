import {InputValidationError} from "../domain/errors";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InputValidationError("Request body must contain valid JSON");
  }
}

export function querySearch(url: URL): string {
  return url.searchParams.get("q") ?? url.searchParams.get("search") ?? "";
}

export function decodeId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new InputValidationError("Resource id is not valid URL encoding");
  }
}
