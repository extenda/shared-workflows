import * as core from "@actions/core";
import * as github from "@actions/github";
import type { WebhookPayload } from "@actions/github/lib/interfaces.js";
import { promises as fs } from "fs";
import {
  parseDocument, parse, isMap, isAlias, Scalar,
} from "yaml";
import type { YAMLMap, Document, Pair } from "yaml";
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

/**
 * Type guard to check if a node is of type Scalar.
 * @param node - The YAML node to check.
 * @returns True if the node is a Scalar, otherwise false.
 */
function isScalar(node: unknown): node is Scalar {
  return node instanceof Scalar;
}

interface EnvVarTemplate {
  keySuffix: string;
  value?: string;
}

interface MismatchedVar {
  variableName: string;
  expectedValue: string;
  actualValue: string;
  comment?: string;
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
type ServiceType =
  | "INPUT_API"
  | "STATEFUL_PROCESSOR"
  | "STATELESS_PROCESSOR"
  | "QUERY_API";

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
  // Determine if there are any validation issues
  const hasIssues = results.some(
    (result) => result.missingVars.length > 0 || result.mismatchedVars.length > 0,
  );

  // Set main icon based on validation results
  const mainIcon = hasIssues ? "⚠️" : "✅";

  // Initialize the Markdown report with the dynamic main icon
  let markdown = `### ${mainIcon} Service Definition File(s) Validation Results

---
`;

  // If there are no validation results, display a corresponding message.
  if (results.length === 0) {
    markdown += "🔍 No validation results to display.";
    return markdown;
  }

  // Group the validation results by file path.
  const fileMap: Map<string, ValidationResult[]> = results.reduce(
    (map, result) => {
      if (!map.has(result.filePath)) {
        map.set(result.filePath, []);
      }
      map.get(result.filePath)!.push(result);
      return map;
    },
    new Map<string, ValidationResult[]>(),
  );

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

      // Display missing environment variables
      if (result.missingVars.length > 0) {
        markdown += `  - ❌ **Missing Environment Variables:**
`;
        result.missingVars.forEach((variable) => {
          markdown += `    - \`${variable}\`\n`;
        });
        markdown += `

`;
      }

      // Display mismatched environment variables
      if (result.mismatchedVars.length > 0) {
        markdown += `  - ⚠️ **Mismatched Environment Variables:**

    | Variable | Expected | Actual | Comment |
    |----------|----------|--------|---------|
`;
        result.mismatchedVars.forEach((mismatch) => {
          const comment = mismatch.comment ? `\`${mismatch.comment}\`` : "";
          markdown += `    | \`${mismatch.variableName}\` | \`${mismatch.expectedValue}\` | `;
          markdown += `\`${mismatch.actualValue}\` | ${comment} |\n`;
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
      core.warning(`⚠️ Failed to post or update PR comment. Error: ${error.message}`);
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
    core.setFailed(`Template JSON for "${environment}" must be an array of objects.`);
    throw new Error(`Invalid template structure for "${environment}"`);
  }

  template.forEach((item, index) => {
    if (
      !item
      || typeof item.keySuffix !== "string"
      || (item.value !== undefined && typeof item.value !== "string")
    ) {
      core.setFailed(`❌ Invalid template at index ${index} in "${environment}" template.`);
      throw new Error(`Invalid template data at index ${index} in "${environment}"`);
    }
  });
}

/**
 * Builds a mapping from anchor names to their corresponding env nodes.
 * @param doc - The parsed YAML Document.
 * @returns A record mapping anchor names to YAMLMap nodes.
 */
function buildAnchorMap(doc: Document): Record<string, YAMLMap> {
  const anchorMap: Record<string, YAMLMap> = {};
  const environmentsNode = doc.get("environments");

  if (environmentsNode && isMap(environmentsNode)) {
    environmentsNode.items.forEach((item: Pair) => {
      const envName = item.key?.toString();
      const envSection = item.value;

      if (!isMap(envSection)) {
        core.warning(`⚠️ 'env' section is not a map for environment '${envName}'`);
        return;
      }

      const envNode = envSection.get("env");

      if (!isMap(envNode)) {
        core.warning(`⚠️ 'env' section is missing or not a map in environment '${envName}'`);
        return;
      }

      const anchor = envNode?.anchor; // Directly access 'anchor' which is a string or undefined
      if (anchor) {
        anchorMap[anchor] = envNode;
      }
    });
  }

  return anchorMap;
}

/**
 * Retrieves the comment for a given variable by traversing the inheritance chain.
 *
 * @param node - The current YAML node to inspect.
 * @param varName - The variable name to find the comment for.
 * @param anchorMap - A mapping from anchor names to YAML nodes.
 * @param visited - A set to keep track of visited anchors to prevent infinite loops.
 * @returns The associated comment, or an empty string if not found.
 */
function getComment(
  node: YAMLMap | undefined,
  varName: string,
  anchorMap: Record<string, YAMLMap>,
  visited: Set<string> = new Set(),
): string {
  if (!node || !node.items) return "";

  // Check if varName is defined in the current node
  const varEntry = node.items.find((item) => item.key?.toString() === varName);

  if (varEntry && isScalar(varEntry.value) && varEntry.value.comment) {
    // Remove any leading '#' characters and trim whitespace
    return varEntry.value.comment.replace(/^#+\s*/, "").trim();
  }

  const overrideSymbol = "<<";
  const mergeEntries = node.items.filter((item) => item.key?.toString() === overrideSymbol);

  const resolvedComment = mergeEntries.reduce<string | undefined>((acc, mergeEntry) => {
    if (acc) return acc; // If a comment is already found, skip further processing

    const merged = mergeEntry.value;

    if (isAlias(merged)) {
      // Handle alias merges (e.g., <<: *prod-env)
      const aliasName = merged.source;
      if (visited.has(aliasName)) {
        return acc; // Prevent infinite loops by skipping already visited aliases
      }
      visited.add(aliasName);
      const mergedNode = anchorMap[aliasName];
      if (mergedNode) {
        const comment = getComment(mergedNode, varName, anchorMap, visited);
        if (comment) {
          return comment;
        }
      }
    } else if (isMap(merged)) {
      // Handle inline merged mappings (not common with anchors)
      const mergedMap = merged;

      // Attempt to find an inline variable with the specified varName and extract its comment
      const inlineVar = mergedMap.items.find((item) => item.key?.toString() === varName);
      if (inlineVar && isScalar(inlineVar.value) && inlineVar.value.comment) {
        return inlineVar.value.comment.replace(/^#+\s*/, "").trim();
      }

      // Handle further merges within the inline mapping
      const furtherComment = mergedMap.items
        .filter((item) => item.key?.toString() === "<<")
        .reduce<string | undefined>((innerAcc, furtherMerge) => {
        if (innerAcc) return innerAcc; // If a comment is already found, skip further processing

        const furtherMerged = furtherMerge.value;
        if (isAlias(furtherMerged)) {
          const furtherAliasName = furtherMerged.source;
          if (visited.has(furtherAliasName)) {
            return innerAcc; // Prevent infinite loops
          }
          visited.add(furtherAliasName);
          const furtherMergedNode = anchorMap[furtherAliasName];
          if (furtherMergedNode) {
            const comment = getComment(furtherMergedNode, varName, anchorMap, visited);
            if (comment) {
              return comment; // Return the comment if found
            }
          }
        }
        return innerAcc;
      }, undefined);

      if (furtherComment) {
        return furtherComment; // Return the found comment from further merges
      }
    }

    return acc; // Continue if no comment is found in the current mergeEntry
  }, undefined);

  return !resolvedComment ? "" : resolvedComment;
}

/**
 * Validates environment variables against their templates.
 * @param envName - The environment name (e.g., "staging").
 * @param serviceDefinitionEnvVars - The environment variables from the YAML file.
 * @param templateEnvVars - The template environment variables to validate against.
 * @param doc - The parsed YAML document.
 * @param anchorMap - The anchor mapping for dynamic comment resolution.
 * @returns An object containing arrays of missing and mismatched env variables.
 */
function validateEnvVars(
  envName: Environment,
  serviceDefinitionEnvVars: { [key: string]: string },
  templateEnvVars: EnvVarTemplate[],
  doc: Document,
  anchorMap: Record<string, YAMLMap>,
): { missingVars: string[]; mismatchedVars: MismatchedVar[] } {
  const missingVars: string[] = [];
  const mismatchedVars: MismatchedVar[] = [];

  // Validate each template variable
  templateEnvVars.forEach((templateEnvVar) => {
    const suffixUpper = templateEnvVar.keySuffix.toUpperCase();

    // Find matching environment variables that end with the keySuffix
    const matchedVars = Object.entries(serviceDefinitionEnvVars).filter(
      ([envVarName, _]) => envVarName.toUpperCase().endsWith(suffixUpper),
    );

    if (matchedVars.length === 0) {
      missingVars.push(templateEnvVar.keySuffix);
      return;
    }

    matchedVars.forEach(([variableName, actualValue]) => {
      // If the template parameter value is not set, skip the check
      if (!templateEnvVar.value) {
        return;
      }

      if (actualValue !== templateEnvVar.value) {
        const environmentsNode = doc.get("environments");
        if (!isMap(environmentsNode)) {
          core.warning("⚠️ 'environments' section is missing or not a map.");
          return;
        }

        const environmentNode = environmentsNode.get(envName);
        if (!isMap(environmentNode)) {
          core.warning("⚠️ 'environment' section is missing or not a map.");
          return;
        }

        const envNode = environmentNode.get("env");
        if (!isMap(environmentNode)) {
          core.warning("⚠️ 'env' section is missing or not a map.");
          return;
        }

        const comment = getComment(envNode as YAMLMap, variableName, anchorMap);

        mismatchedVars.push({
          variableName,
          expectedValue: templateEnvVar.value,
          actualValue,
          comment,
        });
      }
    });
  });

  return { missingVars, mismatchedVars };
}

/**
 * Validates a single service definition file's environment variables against the provided templates.
 * @param filePath - The path to the sevice definition file.
 * @param templates - The service templates for staging and production environments.
 * @returns An array of ValidationResult objects.
 */
async function validateServiceDefinitionFile(
  filePath: string,
  templates: Record<Environment, EnvVarTemplate[]>,
): Promise<ValidationResult[]> {
  const validationResults: ValidationResult[] = [];

  try {
    const fileContent = await fs.readFile(filePath, "utf8");

    // Parse the YAML content with merging enabled to get the final structure
    const parsedYaml = parse(fileContent, { merge: true }) as ParsedYaml;

    // Parse the YAML content into a document to access comments and anchors
    const doc = parseDocument(fileContent);

    if (doc.errors && doc.errors.length > 0) {
      throw new Error(`YAML parsing errors: ${doc.errors.map((e) => e.message).join(", ")}`);
    }

    core.info(`✅ YAML lint passed and parsed successfully for file: ${filePath}`);

    // Build the anchor map for the current YAML document
    const anchorMap = buildAnchorMap(doc);

    // Iterate over each environment defined in the YAML
    (["staging", "production"] as Environment[]).forEach((envName) => {
      // Extract environment variables
      const templateVars = templates[envName];
      const envConfig = parsedYaml.environments?.[envName];

      if (!envConfig || typeof envConfig !== "object") {
        core.warning(`⚠️ Environment '${envName}' not found or is not a valid object in file: ${filePath}`);
        return;
      }

      const serviceDefinitionEnvVars: { [key: string]: string } = envConfig.env || {};

      // Validate environment variables against the template
      const { missingVars, mismatchedVars } = validateEnvVars(
        envName,
        serviceDefinitionEnvVars,
        templateVars,
        doc,
        anchorMap,
      );

      validationResults.push({
        filePath,
        environment: envName,
        missingVars,
        mismatchedVars,
      });
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(`❌ Failed to validate or parse YAML file: ${filePath}\nError: ${error.message}`);
    } else {
      core.setFailed(`❌ Failed to validate or parse YAML file: ${filePath}\nUnknown error.`);
    }
  }

  return validationResults;
}

/**
 * Validates service definition YAML files against predefined templates and posts the results as a PR comment.
 */
async function run(): Promise<void> {
  try {
    // Retrieve inputs
    const filesInput = core.getInput("service-definitions", { required: true });
    const serviceTypeInput = core.getInput("service-type", { required: true });
    const githubToken = core.getInput("github-token") || process.env.GITHUB_TOKEN as string;

    let serviceDefinitionPaths: string[];
    try {
      serviceDefinitionPaths = JSON.parse(filesInput) as string[];
      if (!Array.isArray(serviceDefinitionPaths)) {
        throw new Error("The 'service-definitions' input must be a JSON array of file paths.");
      }
    } catch (parseError: unknown) {
      if (parseError instanceof Error) {
        core.setFailed(`Invalid 'service-definitions' input. Ensure it's a valid JSON array.\nError: ${parseError.message}`);
      } else {
        core.setFailed("Invalid 'service-definitions' input. Ensure it's a valid JSON array.");
      }
      return;
    }

    const serviceType = serviceTypeInput.trim() as ServiceType;
    const validServiceTypes: ServiceType[] = [
      "STATEFUL_PROCESSOR",
      "STATELESS_PROCESSOR",
      "QUERY_API",
      "INPUT_API",
    ];
    if (!validServiceTypes.includes(serviceType)) {
      core.setFailed(`Invalid 'service-type' input. Allowed values are: ${validServiceTypes.join(", ")}.`);
      return;
    }

    // Retrieve templates based on service type
    const templates: Record<Environment, EnvVarTemplate[]> = serviceTypeToTemplatesMap[serviceType];
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
