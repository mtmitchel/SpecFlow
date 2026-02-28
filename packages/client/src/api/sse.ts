export const parseSseResult = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `SSE request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let latestResult: T | null = null;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.replace("event:", "").trim();
      } else if (line.startsWith("data:")) {
        const payload = JSON.parse(line.replace("data:", "").trim()) as unknown;
        if (currentEvent === "planner-result") {
          latestResult = payload as T;
        }
      }
    }
  }

  if (!latestResult) {
    throw new Error("No planner-result event was emitted");
  }

  return latestResult;
};
