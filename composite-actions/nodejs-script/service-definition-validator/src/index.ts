import * as core from "@actions/core";
import type { ServiceType, ValidationResult } from "./types";
import { serviceTypeValues as validServiceTypes } from "./types/index.ts";
import { postOrUpdatePRComment } from "./utils/githubClient.ts";
import { generateMarkdownReport } from "./utils/markdownGenerator.ts";
import { serviceTypeToTemplatesMap } from "./utils/templateLoader.ts";
import { validateServiceDefinitionFile, validateTemplate } from "./utils/validator.ts";

/**
 * The main function orchestrating the validation and reporting.
 */
async function run(): Promise<void> {
  try {
    // Retrieve inputs
    const filesInput = core.getInput("service-definitions", { required: true });
    const serviceTypeInput = core.getInput("service-type", { required: true });
    const githubToken = core.getInput("github-token") || (process.env.GITHUB_TOKEN as string);

    let serviceDefinitionPaths: string[];
    try {
      serviceDefinitionPaths = JSON.parse(filesInput) as string[];
      if (!Array.isArray(serviceDefinitionPaths)) {
        throw new Error("The 'service-definitions' input must be a JSON array of file paths.");
      }
    } catch (parseError: unknown) {
      if (parseError instanceof Error) {
        core.setFailed(
          `Invalid 'service-definitions' input. Ensure it's a valid JSON array.\nError: ${parseError.message}`,
        );
      } else {
        core.setFailed("Invalid 'service-definitions' input. Ensure it's a valid JSON array.");
      }
      return;
    }

    const serviceType = serviceTypeInput.trim().toUpperCase() as ServiceType;
    if (!validServiceTypes.includes(serviceType)) {
      core.setFailed(`Invalid 'service-type' input. Allowed values are: ${validServiceTypes.join(", ")}.`);
      return;
    }

    // Retrieve templates based on service type
    const templates = serviceTypeToTemplatesMap[serviceType];
    if (!templates) {
      core.setFailed(`No templates found for service-type '${serviceType}'.`);
      return;
    }

    const { staging, production } = templates;

    // Validate the templates
    validateTemplate(staging, "staging");
    validateTemplate(production, "production");

    const validationResults: ValidationResult[] = [];

    // Process all service definition files concurrently
    const fileValidationResults = await Promise.all(
      serviceDefinitionPaths.map((filePath) => validateServiceDefinitionFile(filePath, templates)),
    );

    // Flatten the array of arrays into a single array of ValidationResult
    validationResults.push(...fileValidationResults.flat());

    // Generate and post Markdown report
    const markdownReport = generateMarkdownReport(validationResults, serviceType);
    await postOrUpdatePRComment(markdownReport, githubToken);

    core.info("🎉 Validation results have been posted to the PR.");
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(`Unexpected error: ${error.message}`);
    } else {
      core.setFailed("Unexpected error occurred.");
    }
  }
}

(async () => {
  await run();
})().catch((error) => {
  core.setFailed(`Unhandled error: ${error}`);
});
