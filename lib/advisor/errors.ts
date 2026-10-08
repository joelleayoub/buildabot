import Anthropic from "@anthropic-ai/sdk";
import type { ApiError } from "./api";

export function advisorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export const NOT_CONFIGURED: ApiError = {
  error: "advisor_not_configured",
  message: "The AI advisor isn't switched on yet. You can still start from a sample build and edit it by hand.",
};

/** Maps an error thrown while calling Claude to an HTTP status and a message safe to show users. */
export function describeAdvisorError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, body: { error: "advisor_auth", message: "The AI advisor's API key was rejected. Check ANTHROPIC_API_KEY." } };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, body: { error: "rate_limited", message: "The advisor is busy right now. Please try again in a minute." } };
  }
  if (err instanceof Anthropic.BadRequestError) {
    // Includes "credit balance is too low".
    return { status: 502, body: { error: "advisor_bad_request", message: `The advisor request was rejected: ${err.message}` } };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, body: { error: "advisor_unreachable", message: "Couldn't reach the AI advisor. Check your connection and try again." } };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, body: { error: "advisor_error", message: "The advisor hit an error. Please try again." } };
  }
  return { status: 500, body: { error: "internal", message: "Something went wrong. Please try again." } };
}
