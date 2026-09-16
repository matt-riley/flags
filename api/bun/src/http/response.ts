import {ConflictError, InputValidationError, NotFoundError} from "../domain/errors";

const jsonHeaders = {"content-type": "application/json; charset=utf-8"};

export function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, {status, headers: {...jsonHeaders, ...headers}});
}

export function empty(status: number): Response {
  return new Response(null, {status, headers: jsonHeaders});
}

export function allow(methods: string): Response {
  return json({error: "Method not allowed"}, 405, {allow: methods});
}

export function errorResponse(error: unknown): Response {
  if (error instanceof InputValidationError) return json({error: error.message}, 400);
  if (error instanceof ConflictError) return json({error: error.message}, 409);
  if (error instanceof NotFoundError) return json({error: error.message}, 404);
  return json({error: "Internal server error"}, 500);
}
