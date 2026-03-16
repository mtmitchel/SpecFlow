export class PlannerConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PlannerConflictError";
  }
}
