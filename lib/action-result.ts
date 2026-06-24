export type ActionResult =
  | {
      message: string;
      ok: true;
      redirectTo?: string;
      data?: Record<string, unknown>;
    }
  | {
      message: string;
      ok: false;
    };

export function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}