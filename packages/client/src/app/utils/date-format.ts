const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const LOG_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const formatDateTime = (value: string): string =>
  DATE_TIME_FORMATTER.format(new Date(value));

export const formatLogTime = (value: string): string =>
  LOG_TIME_FORMATTER.format(new Date(value));
