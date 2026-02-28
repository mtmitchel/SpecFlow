export const parse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
};

export const requestJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init);
  return parse<T>(response);
};
