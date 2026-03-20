import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { E2E_BASE_URL, E2E_NOTE_FILE_PATH } from "./support/constants.ts";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const chooseSurveyOption = async (
  page: Parameters<typeof test>[0]["page"],
  optionText: string,
): Promise<void> => {
  const surveyCard = page.locator(".planning-survey-card-active");
  const button = surveyCard.getByRole("button", {
    name: new RegExp(`^${escapeRegex(optionText)}`),
  });

  if (await button.count()) {
    await button.first().click();
    return;
  }

  const checkbox = surveyCard.getByRole("checkbox", { name: optionText });
  if (await checkbox.count()) {
    await checkbox.first().check();
    return;
  }

  throw new Error(`Could not find a survey control for "${optionText}"`);
};

const continueSurvey = async (
  page: Parameters<typeof test>[0]["page"],
  label = "Continue",
): Promise<void> => {
  const surveyCard = page.locator(".planning-survey-card-active");
  await surveyCard
    .getByRole("button", { name: new RegExp(`^${escapeRegex(label)}$`) })
    .click();
};

const createInitiativeThroughCoreFlowsReview = async (
  page: Parameters<typeof test>[0]["page"],
  description: string,
  options: { startFromHome?: boolean } = {},
): Promise<void> => {
  if (options.startFromHome) {
    await page.goto(E2E_BASE_URL);
    await expect(page.getByText("No work is in motion yet.")).toBeVisible();
    await page.getByRole("link", { name: "Start new initiative" }).click();
  } else {
    await page.goto(`${E2E_BASE_URL}/new-initiative`);
  }

  await page.locator("textarea").fill(description);
  await page.getByRole("button", { name: "Start brief intake" }).click();

  await expect(
    page.getByRole("heading", {
      name: "What primary problem should v1 solve?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(page, "Build something new that does not exist yet");
  await continueSurvey(page);

  await expect(
    page.getByRole("heading", { name: "Who is this for first?" }),
  ).toBeVisible();
  await chooseSurveyOption(page, "Just me");
  await continueSurvey(page);

  await expect(
    page.getByRole("heading", {
      name: "What should feel true if v1 succeeds?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(page, "Feels simple and focused");
  await continueSurvey(page);

  await expect(
    page.getByRole("heading", {
      name: "Which constraints matter from day one?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(
    page,
    "Works offline or in unreliable network conditions",
  );
  await continueSurvey(page);

  await expect(
    page.getByRole("button", { name: "Continue to core flows" }),
  ).toBeVisible();
  await expect(
    page.getByText("helps solo writers capture and edit notes locally"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to core flows" }).click();

  await expect(
    page.getByRole("heading", {
      name: "What should the main flow cover first?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(
    page,
    "Create, edit, and keep notes on the local machine",
  );
  await continueSurvey(page);

  await expect(
    page.getByRole("button", { name: "Continue to PRD" }),
  ).toBeVisible();
  await expect(page.getByText("Create a note.")).toBeVisible();
};

test.describe.configure({ mode: "serial" });

test("completes the main initiative workflow from Home to a passing run", async ({
  page,
}) => {
  await createInitiativeThroughCoreFlowsReview(
    page,
    "Lightweight local note app for solo writers who want fast capture and offline editing",
    { startFromHome: true },
  );
  await page.getByRole("button", { name: "Continue to PRD" }).click();

  await expect(
    page.getByRole("heading", { name: "What has to be true in v1?" }),
  ).toBeVisible();
  await chooseSurveyOption(
    page,
    "Capture and editing ship first, with search staying basic",
  );
  await continueSurvey(page);

  await expect(
    page.getByRole("button", { name: "Continue to tech spec" }),
  ).toBeVisible();
  await expect(
    page.getByText("Users can create, edit, and reopen local notes."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to tech spec" }).click();

  await expect(
    page.getByRole("heading", {
      name: "What implementation constraint matters most?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(page, "Notes stay local and readable on disk");
  await continueSurvey(page);

  await expect(
    page.getByRole("button", { name: "Validate plan" }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep note persistence local and readable on disk."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Validate plan" }).click();

  await expect(
    page.getByRole("heading", { name: "Execution phases" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Persist local note edits" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Persist local note edits" }).click();

  await expect(
    page.getByRole("heading", { name: "Persist local note edits" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start work" })).toBeVisible();
  await page.getByRole("button", { name: "Create bundle" }).click();

  await expect(page.getByRole("button", { name: "Copy bundle" })).toBeVisible();

  await writeFile(
    E2E_NOTE_FILE_PATH,
    [
      "const normalizeNote = (note: string): string => note.trim();",
      "",
      "export const notes: string[] = [];",
      "",
      "export const saveNote = (note: string): string[] => {",
      "  return [...notes, normalizeNote(note)];",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );

  await page.getByRole("button", { name: "Refresh changes" }).click();
  await expect(page.getByText("normalizeNote")).toBeVisible();

  await page
    .locator("textarea.multiline")
    .last()
    .fill(
      "Added note normalization before saving and kept the note store local.",
    );
  await page.getByRole("button", { name: "Verify work" }).click();

  await expect(page.getByText("Result: Passed")).toBeVisible();

  await page.getByRole("link", { name: "Open latest run" }).click();
  await expect(page).toHaveURL(/\/run\/run-/);
  await expect(page.getByText("Included files")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open ticket" }),
  ).toBeVisible();
});

test("reopens core flows from review and updates the artifact after an answer change", async ({
  page,
}) => {
  await createInitiativeThroughCoreFlowsReview(
    page,
    "Local note workspace for solo writers who need offline capture and a searchable library",
  );

  await page.getByRole("button", { name: "Revise answers" }).click();

  await expect(
    page.getByRole("heading", {
      name: "What should the main flow cover first?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(
    page,
    "Search and organize an existing note library",
  );
  await continueSurvey(page, "Update core flows");

  await expect(
    page.getByRole("heading", {
      name: "How should the app handle notes that are created but left empty?",
    }),
  ).toBeVisible();
  await expect(page.getByText("Step 1 of 1")).toBeVisible();
  await expect(
    page.getByText(
      "Earlier answer: Search and organize an existing note library",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "How should the app handle notes that are created but left empty?",
    }),
  ).toBeVisible();
  await chooseSurveyOption(page, "Move empty notes to Trash automatically");
  await continueSurvey(page, "Update core flows");

  await expect(page.getByText("Search the local note library.")).toBeVisible();
  await expect(
    page.getByText("the app moves it to Trash automatically"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to PRD" }),
  ).toBeVisible();
});
