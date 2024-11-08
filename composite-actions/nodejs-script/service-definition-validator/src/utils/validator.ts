import * as core from "@actions/core";
import { promises as fs } from "fs";
import {
  parseDocument,
  parse,
  isMap,
  isAlias,
  Scalar,
} from "yaml";
import type { YAMLMap, Document, Pair } from "yaml";
import type {
  Environment,
  EnvVarTemplate,
  ValidationResult,
  ParsedYaml,
  AnchorMap,
  MismatchedVar,
} from "../types";

/**
 * Type guard to check if a node is of type Scalar.
 * @param node - The YAML node to check.
 * @returns True if the node is a Scalar, otherwise false.
 */
function isScalar(node: unknown): node is Scalar {
  return node instanceof Scalar;
}

/**
 * Validates the structure of an EnvVarTemplate array.
 * @param template - The template array to validate.
 * @param environment - The environment name for error messages.
 */
export function validateTemplate(template: EnvVarTemplate[], environment: Environment): void {
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
function buildAnchorMap(doc: Document): AnchorMap {
  const anchorMap: AnchorMap = {};
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

      const anchor = envNode?.anchor;
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
  anchorMap: AnchorMap,
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

  return resolvedComment || "";
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
export function validateEnvVars(
  envName: Environment,
  serviceDefinitionEnvVars: { [key: string]: string },
  templateEnvVars: EnvVarTemplate[],
  doc: Document,
  anchorMap: AnchorMap,
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
        if (!isMap(envNode)) {
          core.warning("⚠️ 'env' section is missing or not a map.");
          return;
        }

        const comment = getComment(envNode, variableName, anchorMap);

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
 * @param filePath - The path to the service definition file.
 * @param templates - The service templates for staging and production environments.
 * @returns An array of ValidationResult objects.
 */
export async function validateServiceDefinitionFile(
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
