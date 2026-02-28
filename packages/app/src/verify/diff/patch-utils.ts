import { createTwoFilesPatch } from "diff";

export const makePatch = (filePath: string, before: string, after: string): string => {
  return createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, before, after, "baseline", "capture");
};
