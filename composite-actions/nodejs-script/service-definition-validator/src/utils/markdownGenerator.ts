import type { ValidationResult } from "../types/index.ts";
import { getReportCommentIdentifier } from "./constants.ts";

/**
 * Capitalizes the first letter of a string.
 * @param text - The string to capitalize.
 * @returns The capitalized string or the original string if empty.
 */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Generates a Markdown report based on validation results.
 * @param results - Array of ValidationResult objects.
 * @param serviceType - The type of service.
 * @returns Markdown formatted string.
 */
export function generateMarkdownReport(results: ValidationResult[], serviceType: string): string {
  const hasMissingVars = results.some((result) => result.missingVars.length > 0);
  const hasMismatchedVars = results.some((result) => result.mismatchedVars.length > 0);

  let mainIcon = "✅"; // Default to green check mark
  if (hasMissingVars) {
    mainIcon = "❌"; // Error icon if there are missing variables
  } else if (hasMismatchedVars) {
    mainIcon = "⚠️"; // Warning icon if there are mismatched variables but no missing variables
  }

  let markdown = `${getReportCommentIdentifier(serviceType)}\n`;
  markdown += `### ${mainIcon} Service Definition(s) Validation Results | ${serviceType.replace("_", " ")}s

---
`;

  if (results.length === 0) {
    markdown += "🔍 No validation results to display.";
    return markdown;
  }

  const fileMap = results.reduce((map, result) => {
    if (!map.has(result.filePath)) {
      map.set(result.filePath, []);
    }
    map.get(result.filePath)!.push(result);
    return map;
  }, new Map<string, ValidationResult[]>());

  fileMap.forEach((fileResults, filePath) => {
    markdown += `<details>
  <summary>📄 \`${filePath}\`</summary>

`;

    fileResults.forEach((result) => {
      const environmentName = capitalize(result.environment);
      markdown += `  **Environment: ${environmentName}**

`;

      if (result.missingVars.length === 0 && result.mismatchedVars.length === 0) {
        markdown += `  ✅ All environment variables are valid.

`;
        return;
      }

      if (result.missingVars.length > 0) {
        markdown += `  - ❌ **Missing Environment Variables:**
`;
        result.missingVars.forEach((variable) => {
          markdown += `    - \`${variable}\`\n`;
        });
        markdown += `

`;
      }

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

export default generateMarkdownReport;
