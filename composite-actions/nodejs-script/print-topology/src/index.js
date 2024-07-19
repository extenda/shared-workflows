import fs from "fs";
import core from "@actions/core";
import path from "path";
import Topology from "./lib/Topology.js";

async function updateReadmeWithMermaidGraph(topologyContent, readmeFilePath) {
  try {
    let readmeFileContent = "";

    if (fs.existsSync(readmeFilePath)) {
      // Read the contents of README.md file
      readmeFileContent = fs.readFileSync(readmeFilePath, "utf8");
    }

    // Generate mermaid graph
    const mermaidGraphDefinition = Topology.toMermaid(topologyContent);

    const updatedMermaidBlock = `## Kafka Stream Topology\n\`\`\`mermaid\n${mermaidGraphDefinition}\n\`\`\`\n----`;

    // Check if the mermaid block exists in the README.md file
    const mermaidBlockRegex = /## Kafka Stream Topology\n([\s\S]*?)\n----/;
    if (mermaidBlockRegex.test(readmeFileContent)) {
      // Replace the existing mermaid block in the README.md file with the updated content
      readmeFileContent = readmeFileContent.replace(mermaidBlockRegex, updatedMermaidBlock);
    } else {
      // Mermaid block doesn't exist, so append the updated mermaid block to the README.md file
      readmeFileContent += `\n\n${updatedMermaidBlock}`;
    }

    // Write the updated content back to the README.md file
    fs.writeFileSync(readmeFilePath, readmeFileContent, "utf-8");

    console.info("README.md updated successfully.");
  } catch (error) {
    console.error("An error occurred while updating the README.md:", error);
    process.exit(1);
  }
}

async function saveProcessorTopicsAndStoresAsJson(topologyContent, applicationIdArray, outputFilePath) {
  try {
    // Write the processor topics to a file
    const result = Topology.collectTopicsAndStores(topologyContent);
    result.applicationIds = applicationIdArray;

    // Create the directory hierarchy if it doesn't exist
    const outputFileDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputFileDir)) {
      fs.mkdirSync(outputFileDir, { recursive: true });
    }

    fs.writeFileSync(outputFilePath, JSON.stringify(result, null, 2), "utf-8");

    console.info("Processor topics, state stores and application ids collected successfully.");
  } catch (error) {
    console.error("An error occurred while saving the collected information:", error);
    process.exit(1);
  }
}

async function main() {
  const topologyFilePath = core.getInput("topologyFilePath") || "docs/topology/stream.txt";
  const processorTopicsFilePath = core.getInput("processorTopicsOutputFilePath") || "docs/topics/processor-topics.json";
  const readmeFilePath = core.getInput("readmeFilePath") || "README.md";
  const applicationIdArrayString = core.getInput("applicationIds") || "[]";

  if (!applicationIdArrayString) {
    console.error("applicationIds input parameter is required.");
    process.exit(1);
  }

  const applicationIdArray = JSON.parse(applicationIdArrayString);

  // Read the contents of topology/stream.txt file
  const topologyContent = fs.readFileSync(topologyFilePath, "utf8");

  updateReadmeWithMermaidGraph(topologyContent, readmeFilePath);
  saveProcessorTopicsAndStoresAsJson(topologyContent, applicationIdArray, processorTopicsFilePath);
}

main();
