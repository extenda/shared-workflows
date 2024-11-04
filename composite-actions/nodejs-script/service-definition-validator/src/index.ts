import * as core from "@actions/core";
import * as github from "@actions/github";
import { promises as fs } from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

interface EnvVarTemplate {
  keySuffix: string;
  value: string;
}

interface MismatchedVar {
  variableName: string;
  expectedValue: string;
  actualValue: string;
}

interface ValidationResult {
  filePath: string;
  environment: string;
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

// Mapping from service-type options to their corresponding folder names
const serviceTypeToFolderMap: Record<string, string> = {
  PROCESSOR: "processor",
  QUERY_API: "query-api",
  INPUT_API: "input-api",
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
  let markdown = `## 🛡️ Definition File(s) Environment Variables Validation Results

`;

  if (results.length === 0) {
    markdown += "🔍 No validation results to display.";
    return markdown;
  }

  results.forEach((result) => {
    markdown += `### 📄 File: \`${result.filePath}\` - Environment: **${capitalize(result.environment)}**

`;

    if (result.missingVars.length === 0 && result.mismatchedVars.length === 0) {
      markdown += `✅ All environment variables are valid.

`;
      return;
    }

    if (result.missingVars.length > 0) {
      markdown += `#### ⚠️ Missing Environment Variables:
${result.missingVars.map((v) => `- \`${v}\``).join("\n")}

`;
    }

    if (result.mismatchedVars.length > 0) {
      markdown += `#### ❌ Mismatched Environment Variables:

| Variable | Expected | Actual |
|----------|----------|--------|
`;
      result.mismatchedVars.forEach((mismatch) => {
        markdown += `| \`${mismatch.variableName}\` | \`${mismatch.expectedValue}\` | \`${mismatch.actualValue}\` |
`;
      });
      markdown += `

`;
    }
  });

  return markdown;
}

/**
 * Posts a new comment on the PR or updates the existing one with the given Markdown content.
 * @param markdown - The Markdown content to post.
 */
async function postOrUpdatePRComment(markdown: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN as string;
  const octokit = github.getOctokit(token);

  const { context } = github;
  const pr = context.payload.pull_request;

  if (!pr) {
    core.setFailed("🔴 This action must run on pull request events.");
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
 * Loads and parses a JSON template file.
 * @param templatePath - Path to the template JSON file.
 * @param environment - Name of the environment (used for error messages).
 * @returns An array of EnvVarTemplate objects.
 */
async function loadTemplate(
  templatePath: string,
  environment: string,
): Promise<EnvVarTemplate[]> {
  try {
    const templateContent = await fs.readFile(templatePath, "utf8");
    const parsedTemplate = JSON.parse(templateContent);
    if (!Array.isArray(parsedTemplate)) {
      throw new Error("Template JSON must be an array of objects.");
    }
    // Validate template structure
    parsedTemplate.forEach((item, index) => {
      if (
        !item
        || typeof item.keySuffix !== "string"
        || (item.value !== undefined && typeof item.value !== "string")
      ) {
        throw new Error(
          `Invalid template at index ${index} in ${environment} template.`,
        );
      }
    });
    return parsedTemplate as EnvVarTemplate[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(
        `❌ Failed to load ${environment} template from ${templatePath}\nError: ${error.message}`,
      );
      throw error; // Rethrow to halt execution
    } else {
      core.setFailed(
        `❌ Failed to load ${environment} template from ${templatePath}\nUnknown error.`,
      );
      throw new Error("Unknown error occurred while loading template.");
    }
  }
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

    const serviceType = serviceTypeInput.trim();
    const validServiceTypes = ["PROCESSOR", "QUERY_API", "INPUT_API"];
    if (!validServiceTypes.includes(serviceType)) {
      core.setFailed(`Invalid 'service-type' input. Allowed values are: ${validServiceTypes.join(", ")}.`);
      return;
    }

    const mappedFolderName = serviceTypeToFolderMap[serviceType];
    if (!mappedFolderName) {
      core.setFailed(
        `No folder mapping found for service-type '${serviceType}'.`,
      );
      return;
    }

    const templatesDir = path.join(process.cwd(), "templates", mappedFolderName);

    // Define template paths based on service-type folder
    const stagingTemplatePath = path.join(templatesDir, "staging.json");
    const productionTemplatePath = path.join(templatesDir, "production.json");

    // Check if template files exist
    try {
      await Promise.all([
        fs.access(stagingTemplatePath),
        fs.access(productionTemplatePath),
      ]);
    } catch {
      core.setFailed(`❌ Template files not found in folder '${mappedFolderName}'. 
        Ensure that 'staging.json' and 'production.json' exist.`);
      return;
    }

    // Load templates concurrently
    const [stagingTemplate, productionTemplate] = await Promise.all([
      loadTemplate(stagingTemplatePath, "staging"),
      loadTemplate(productionTemplatePath, "production"),
    ]);

    const templates: Record<string, EnvVarTemplate[]> = {
      staging: stagingTemplate,
      production: productionTemplate,
    };

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
        Object.entries(templates).forEach(([envName, templateVars]) => {
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
    await postOrUpdatePRComment(markdownReport);

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
