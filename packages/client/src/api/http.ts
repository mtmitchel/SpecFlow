export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const parse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as { message?: string; code?: string };
      throw new ApiError(response.status, json.message ?? text, json.code);
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
    }
    throw new ApiError(response.status, text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
};

export const requestJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  return parse<T>(response);
};
