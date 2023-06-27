import fs from 'fs';
import {AsciiToMermaid} from './asciiToMermaid.mjs';

async function generateTopology(){
    try {
        const topologyFilePath = 'docs/topology/stream.txt';
        const readmeFilePath = 'README.md';
        // Read the contents of topology/stream.txt file
        const topologyString = fs.readFileSync(topologyFilePath,'utf8')

        // Read the contents of README.md file
        let readmeFileContent = fs.readFileSync(readmeFilePath,'utf8');

        //Generate mermaid graph
        const mermaidGraphDefinition = AsciiToMermaid.toMermaid(topologyString);

        const updatedMermaidBlock = `### Kafka Stream Topology\n\`\`\`mermaid\n${mermaidGraphDefinition}\n\`\`\`\n----`;

        // Check if the mermaid block exists in the README.md file
        const mermaidBlockRegex = /### Kafka Stream Topology\n([\s\S]*?)\n----/;
        if (mermaidBlockRegex.test(readmeFileContent)) {
            // Replace the existing mermaid block in the README.md file with the updated content
            readmeFileContent = readmeFileContent.replace(mermaidBlockRegex, updatedMermaidBlock);
        } else {
            // Mermaid block doesn't exist, so append the updated mermaid block to the README.md file
            readmeFileContent += '\n' + updatedMermaidBlock;
        }

        // Write the updated content back to the README.md file
        fs.writeFileSync(readmeFilePath, readmeFileContent, 'utf-8');

        console.log('README.md updated successfully.');
    }catch (error) {
        console.error('An error occurred while updating the README.md:', error);
        process.exit(1);
    }
}

generateTopology();