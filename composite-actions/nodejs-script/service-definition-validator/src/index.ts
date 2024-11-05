import * as core from "@actions/core";
import * as github from "@actions/github";
import type { WebhookPayload } from "@actions/github/lib/interfaces.js";
import { promises as fs } from "fs";
import * as yaml from "js-yaml";
import { getPullRequestInfo } from "./getPullRequestInfo.ts";

// Import JSON templates
import inputApiStaging from "../templates/input-api/staging.json" with { type: "json" };
import inputApiProduction from "../templates/input-api/production.json" with { type: "json" };

import statefulProcessorStaging from "../templates/stateful-processor/staging.json" with { type: "json" };
import statefulProcessorProduction from "../templates/stateful-processor/production.json" with { type: "json" };

import statelessProcessorStaging from "../templates/stateless-processor/staging.json" with { type: "json" };
import statelessProcessorProduction from "../templates/stateless-processor/production.json" with { type: "json" };

import queryApiStaging from "../templates/query-api/staging.json" with { type: "json" };
import queryApiProduction from "../templates/query-api/production.json" with { type: "json" };

interface EnvVarTemplate {
  keySuffix: string;
  value?: string;
}

interface MismatchedVar {
  variableName: string;
  expectedValue: string;
  actualValue: string;
}

interface ValidationResult {
  filePath: string;
  environment: Environment;
  missingVars: string[];
  mismatchedVars: MismatchedVar[];
}

interface ParsedYaml {
  environments?: {
    [env: string]: {
      env?: {
        [key: string]: string;
      };
    };
  };
}

interface ServiceTemplates {
  staging: EnvVarTemplate[];
  production: EnvVarTemplate[];
}

type Environment = "staging" | "production";
type ServiceType = "INPUT_API" | "STATEFUL_PROCESSOR" | "STATELESS_PROCESSOR" | "QUERY_API";

// Mapping from service-type options to their corresponding templates
const serviceTypeToTemplatesMap: Record<ServiceType, ServiceTemplates> = {
  STATEFUL_PROCESSOR: {
    staging: statefulProcessorStaging,
    production: statefulProcessorProduction,
  },
  STATELESS_PROCESSOR: {
    staging: statelessProcessorStaging,
    production: statelessProcessorProduction,
  },
  QUERY_API: {
    staging: queryApiStaging,
    production: queryApiProduction,
  },
  INPUT_API: {
    staging: inputApiStaging,
    production: inputApiProduction,
  },
};

/**
 * Capitalizes the first letter of a given string.
 * @param text - The string to capitalize.
 * @returns The capitalized string.
 */
function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Generates a Markdown report based on validation results.
 * @param results - The array of ValidationResult objects.
 * @returns A string containing the Markdown report.
 */
function generateMarkdownReport(results: ValidationResult[]): string {
  // Initialize the Markdown report with the main header and a separator.
  let markdown = `### ✅ Service Definition File(s) Validation Results

---

`;

  // If there are no validation results, display a corresponding message.
  if (results.length === 0) {
    markdown += "🔍 No validation results to display.";
    return markdown;
  }

  // Group the validation results by file path.
  const fileMap: Map<string, ValidationResult[]> = results.reduce((map, result) => {
    if (!map.has(result.filePath)) {
      map.set(result.filePath, []);
    }
    map.get(result.filePath)!.push(result);
    return map;
  }, new Map<string, ValidationResult[]>());

  // Iterate over each file and generate corresponding Markdown sections.
  fileMap.forEach((fileResults, filePath) => {
    markdown += `<details>
  <summary>📄 \`${filePath}\`</summary>

`;

    // Iterate over each environment within the current file.
    fileResults.forEach((result) => {
      const environmentName = capitalize(result.environment);
      markdown += `  **Environment: ${environmentName}**

`;

      // Check if there are no issues with environment variables.
      if (result.missingVars.length === 0 && result.mismatchedVars.length === 0) {
        markdown += `  ✅ All environment variables are valid.

`;
        return;
      }

      // Display missing environment variables, if any.
      if (result.missingVars.length > 0) {
        markdown += `  - ⚠️ **Missing Environment Variables:**
`;
        result.missingVars.forEach((variable) => {
          markdown += `    - \`${variable}\`
`;
        });
        markdown += `
`;
      }

      // Display mismatched environment variables, if any.
      if (result.mismatchedVars.length > 0) {
        markdown += `  - ❌ **Mismatched Environment Variables:**

    | Variable | Expected | Actual |
    |----------|----------|--------|
`;
        result.mismatchedVars.forEach((mismatch) => {
          markdown += `    | \`${mismatch.variableName}\` | \`${mismatch.expectedValue}\` | \`${mismatch.actualValue}\` |
`;
        });
        markdown += `
`;
      }
    });

    markdown += `</details>

---
`;
  });

  return markdown;
}

/**
 * Posts a new comment on the PR or updates the existing one with the given Markdown content.
 * @param markdown - The Markdown content to post.
 */
async function postOrUpdatePRComment(markdown: string, githubToken: string): Promise<void> {
  const octokit = github.getOctokit(githubToken);

  const { context } = github;
  const pr = await getPullRequestInfo(githubToken) as WebhookPayload["pull_request"];

  if (!pr) {
    core.setFailed("🔴 Failed to fetch the pull request information.");
    return;
  }

  const {
    number: prNumber,
    repo,
    owner,
  } = {
    number: pr.number,
    repo: context.repo.repo,
    owner: context.repo.owner,
  };

  try {
    // Fetch existing comments
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    // Define a unique identifier for the comment (to allow updates)
    const commentIdentifier = "## 🛡️ Definition File(s) Environment Variables Validation Results";

    // Find existing comment by this action
    const existingComment = comments.find((comment) => comment.body?.startsWith(commentIdentifier));

    if (existingComment) {
      // Update existing comment
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: markdown,
      });
      core.info("📝 Existing PR comment updated with new validation results.");
    } else {
      // Create a new comment
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: markdown,
      });
      core.info("📝 New PR comment posted with validation results.");
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(
        `⚠️ Failed to post or update PR comment. Error: ${error.message}`,
      );
    } else {
      core.warning("⚠️ Failed to post or update PR comment. Unknown error.");
    }
  }
}

/**
 * Validates the structure of an EnvVarTemplate array.
 * @param template - The template array to validate.
 * @param environment - The environment name for error messages.
 */
function validateTemplate(template: EnvVarTemplate[], environment: Environment): void {
  if (!Array.isArray(template)) {
    core.setFailed(`Template JSON for '${environment}' must be an array of objects.`);
    throw new Error(`Invalid template structure for '${environment}'`);
  }

  template.forEach((item, index) => {
    if (
      !item
      || typeof item.keySuffix !== "string"
      || (item.value !== undefined && typeof item.value !== "string")
    ) {
      core.setFailed(
        `❌ Invalid template at index ${index} in '${environment}' template.`,
      );
      throw new Error(`Invalid template data at index ${index} in '${environment}'`);
    }
  });
}

/**
 * Validates environment variables against their templates.
 * @param serviceDefinitionEnvVars - The environment variables from the YAML file.
 * @param templateEnvVars - The template environment variables to validate against.
 * @returns An object containing arrays of missing and mismatched env variables.
 */
function validateEnvVars(
  serviceDefinitionEnvVars: { [key: string]: string },
  templateEnvVars: EnvVarTemplate[],
): { missingVars: string[]; mismatchedVars: MismatchedVar[] } {
  const missingVars: string[] = [];
  const mismatchedVars: MismatchedVar[] = [];

  // Preprocess serviceDefinitionEnvVars to map endings to variable names and values
  const envVarMap: Record<string, { variableName: string; value: string }[]> = {};

  Object.entries(serviceDefinitionEnvVars).forEach(
    ([serviceDefEnvVarName, value]) => {
      templateEnvVars.forEach((templateEnvVar) => {
        const suffix = templateEnvVar.keySuffix.toUpperCase();
        if (serviceDefEnvVarName.toUpperCase().endsWith(suffix)) {
          if (!envVarMap[suffix]) {
            envVarMap[suffix] = [];
          }
          envVarMap[suffix].push({ variableName: serviceDefEnvVarName, value });
        }
      });
    },
  );

  // Validate each template variable
  templateEnvVars.forEach((templateEnvVar) => {
    const suffixUpper = templateEnvVar.keySuffix.toUpperCase();

    const matchedVars = envVarMap[suffixUpper];

    if (!matchedVars || matchedVars.length === 0) {
      missingVars.push(templateEnvVar.keySuffix);
      return;
    }

    matchedVars.forEach(({ variableName, value }) => {
      // If the template parameter value is not set, skip the check
      if (!templateEnvVar.value) {
        return;
      }

      if (value !== templateEnvVar.value) {
        mismatchedVars.push({
          variableName,
          expectedValue: templateEnvVar.value,
          actualValue: value,
        });
      }
    });
  });

  return { missingVars, mismatchedVars };
}

async function run(): Promise<void> {
  try {
    // Retrieve inputs
    const filesInput = core.getInput("service-definitions", { required: true });
    const serviceTypeInput = core.getInput("service-type", { required: true });
    const githubToken = core.getInput("github-token");

    let serviceDefinitionPaths: string[];
    try {
      serviceDefinitionPaths = JSON.parse(filesInput) as string[];
      if (!Array.isArray(serviceDefinitionPaths)) {
        throw new Error(
          "The 'service-definitions' input must be a JSON array of file paths.",
        );
      }
    } catch (parseError: unknown) {
      if (parseError instanceof Error) {
        core.setFailed(
          `Invalid 'service-definitions' input. Ensure it's a valid JSON array.\nError: ${parseError.message}`,
        );
      } else {
        core.setFailed(
          "Invalid 'service-definitions' input. Ensure it's a valid JSON array.",
        );
      }
      return;
    }

    const serviceType = serviceTypeInput.trim() as ServiceType;
    const validServiceTypes: ServiceType[] = ["STATEFUL_PROCESSOR", "STATELESS_PROCESSOR", "QUERY_API", "INPUT_API"];
    if (!validServiceTypes.includes(serviceType)) {
      core.setFailed(
        `Invalid 'service-type' input. Allowed values are: ${validServiceTypes.join(", ")}.`,
      );
      return;
    }

    // Retrieve templates based on service type
    const templates: Record<Environment, EnvVarTemplate[]> = serviceTypeToTemplatesMap[serviceType];
    if (!templates) {
      core.setFailed(
        `No templates found for service-type '${serviceType}'.`,
      );
      return;
    }

    const { staging, production } = templates;

    // Validate the templates
    validateTemplate(staging, "staging");
    validateTemplate(production, "production");

    const validationResults: ValidationResult[] = [];

    // Process all service definition files concurrently
    await Promise.all(
      serviceDefinitionPaths.map(async (filePath) => {
        let parsedYaml: ParsedYaml;

        try {
          const fileContent = await fs.readFile(filePath, "utf8");
          const parsed = yaml.load(fileContent);

          if (!parsed || typeof parsed !== "object") {
            throw new Error("Parsed YAML content is empty or invalid.");
          }

          parsedYaml = parsed as ParsedYaml;

          core.info(
            `✅ YAML lint passed and parsed successfully for file: ${filePath}`,
          );
        } catch (error: unknown) {
          if (error instanceof Error) {
            core.setFailed(
              `❌ Failed to validate or parse YAML file: ${filePath}\nError: ${error.message}`,
            );
          } else {
            core.setFailed(
              `❌ Failed to validate or parse YAML file: ${filePath}\nUnknown error.`,
            );
          }
          return;
        }

        if (!parsedYaml.environments) {
          core.warning(
            `⚠️ No 'environments' section found in file: ${filePath}`,
          );
          return;
        }

        // Validate each environment
        (["staging", "production"] as Environment[]).forEach((envName) => {
          const templateVars = templates[envName];
          const envSection = parsedYaml.environments?.[envName]?.env;

          if (envSection) {
            const { missingVars, mismatchedVars } = validateEnvVars(envSection, templateVars);

            validationResults.push({
              filePath,
              environment: envName,
              missingVars,
              mismatchedVars,
            });
          } else {
            core.warning(
              `⚠️ No 'env' section found for environment '${envName}' in file: ${filePath}`,
            );
          }
        });
      }),
    );

    // Generate and post Markdown report
    const markdownReport = generateMarkdownReport(validationResults);
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
