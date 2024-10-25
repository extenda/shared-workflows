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

async function run(): Promise<void> {
  try {
    // Retrieve inputs
    const filesInput = core.getInput("service-definitions", { required: true });
    let serviceDefinitionPaths: string[];
    try {
      serviceDefinitionPaths = JSON.parse(filesInput);
      if (!Array.isArray(serviceDefinitionPaths)) {
        throw new Error("The 'service-definitions' input must be a JSON array of file paths.");
      }
    } catch (parseError: any) {
      core.setFailed(`Invalid 'service-definitions' input. Ensure it's a valid JSON array.\nError: ${parseError.message}`);
      return;
    }

    const templatesDir = path.join(process.cwd(), "templates");

    // Define template paths
    const stagingTemplatePath = path.join(templatesDir, "staging.json");
    const productionTemplatePath = path.join(templatesDir, "production.json");

    // Load templates
    const templates: Record<string, EnvVarTemplate[]> = {
      staging: await loadTemplate(stagingTemplatePath, "staging"),
      production: await loadTemplate(productionTemplatePath, "production"),
    };

    const validationResults: ValidationResult[] = [];

    // Iterate through each YAML file
    for (const filePath of serviceDefinitionPaths) {
      let parsedYaml: ParsedYaml;

      try {
        const fileContent = await fs.readFile(filePath, "utf8");
        parsedYaml = yaml.load(fileContent) as ParsedYaml;

        // If parsedYaml is undefined or null, treat it as a parsing failure
        if (!parsedYaml) {
          throw new Error("Parsed YAML content is empty.");
        }

        core.info(`✅ YAML lint passed and parsed successfully for file: ${filePath}`);
      } catch (error: any) {
        core.setFailed(`❌ Failed to validate or parse YAML file: ${filePath}\nError: ${error.message}`);
        return;
      }

      if (!parsedYaml.environments) {
        core.warning(`⚠️ No 'environments' section found in file: ${filePath}`);
        continue;
      }

      // Validate each environment
      for (const [envName, templateVars] of Object.entries(templates)) {
        const envSection = parsedYaml.environments[envName]?.env;

        if (!envSection) {
          core.warning(`⚠️ No 'env' section found for environment '${envName}' in file: ${filePath}`);
          continue;
        }

        const { missingVars, mismatchedVars } = validateEnvVars(envSection, templateVars);

        validationResults.push({
          filePath,
          environment: envName,
          missingVars,
          mismatchedVars,
        });
      }
    }

    // Generate and post Markdown report
    const markdownReport = generateMarkdownReport(validationResults);
    await postOrUpdatePRComment(markdownReport);

    core.info("🎉 Validation results have been posted to the PR.");
  } catch (error: any) {
    core.setFailed(`Unexpected error: ${error.message}`);
  }
}

/**
 * Loads and parses a JSON template file.
 * @param templatePath - Path to the template JSON file.
 * @param environment - Name of the environment (used for error messages).
 * @returns An array of EnvVarTemplate objects.
 */
async function loadTemplate(templatePath: string, environment: string): Promise<EnvVarTemplate[]> {
  try {
    const templateContent = await fs.readFile(templatePath, "utf8");
    const parsedTemplate = JSON.parse(templateContent);
    if (!Array.isArray(parsedTemplate)) {
      throw new Error("Template JSON must be an array of objects.");
    }
    // Validate template structure
    parsedTemplate.forEach((item, index) => {
      if (typeof item.keySuffix !== "string" || typeof item.value !== "string") {
        throw new Error(`Invalid template at index ${index} in ${environment} template.`);
      }
    });
    return parsedTemplate;
  } catch (error: any) {
    core.setFailed(`❌ Failed to load ${environment} template from ${templatePath}\nError: ${error.message}`);
    throw error; // Rethrow to halt execution
  }
}

/**
 * Validates environment variables against their templates.
 * @param serviceDefinitionEnvVars - The environment variables from the YAML file.
 * @param templateEnvVars - The template environment variables to validate against.
 * @returns An object containing arrays of missing and mismatched env variables.
 */
function validateEnvVars(serviceDefinitionEnvVars: { [key: string]: string }, templateEnvVars: EnvVarTemplate[]): { missingVars: string[]; mismatchedVars: MismatchedVar[] } {
  const missingVars: string[] = [];
  const mismatchedVars: MismatchedVar[] = [];

  // Preprocess serviceDefinitionEnvVars to map endings to variable names and values
  const envVarMap: Record<string, { variableName: string; value: string }[]> = {};

  for (const [serviceDefEnvVarName, value] of Object.entries(serviceDefinitionEnvVars)) {
    for (const templateEnvVar of templateEnvVars) {
      const suffix = templateEnvVar.keySuffix.toUpperCase();
      if (serviceDefEnvVarName.toUpperCase().endsWith(suffix)) {
        if (!envVarMap[suffix]) {
          envVarMap[suffix] = [];
        }
        envVarMap[suffix].push({ variableName: serviceDefEnvVarName, value });
      }
    }
  }

  // Validate each template variable
  for (const templateEnvVar of templateEnvVars) {
    const suffixUpper = templateEnvVar.keySuffix.toUpperCase();

    const matchedVars = envVarMap[suffixUpper];

    if (!matchedVars || matchedVars.length === 0) {
      missingVars.push(templateEnvVar.keySuffix);
      continue;
    }

    matchedVars.forEach(({ variableName, value }) => {
      // If the the template parameter value is not set, skip the check
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
  }

  return { missingVars, mismatchedVars };
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
    markdown += `🔍 No validation results to display.`;
    return markdown;
  }

  for (const result of results) {
    markdown += `### 📄 File: \`${result.filePath}\` - Environment: **${capitalize(result.environment)}**

`;

    if (result.missingVars.length === 0 && result.mismatchedVars.length === 0) {
      markdown += `✅ All environment variables are valid.

`;
      continue;
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
      for (const mismatch of result.mismatchedVars) {
        markdown += `| \`${mismatch.variableName}\` | \`${mismatch.expectedValue}\` | \`${mismatch.actualValue}\` |
`;
      }
      markdown += `
`;
    }
  }

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

  const { number: prNumber, repo, owner } = {
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
    const commentIdentifier = "## 🛡️ YAML Environment Variables Validation Results";

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
  } catch (error: any) {
    core.warning(`⚠️ Failed to post or update PR comment. Error: ${error.message}`);
  }
}

/**
 * Capitalizes the first letter of a given string.
 * @param text - The string to capitalize.
 * @returns The capitalized string.
 */
function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

run();