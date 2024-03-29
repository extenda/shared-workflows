const fs = require('fs');
const core = require('@actions/core');
const path = require('path');

class SubTopology {
    static pattern = /Sub-topology: ([0-9]*)/;

    static startFormatter(subTopology) {
        return `subgraph Sub-Topology: ${subTopology}`;
    }

    static endFormatter() {
        return `end`;
    }

    static visit(line, subTopologies, subTopologiesList) {
        let match = line.match(this.pattern);
        // Close the previous sub-topology before opening a new one;
        if (subTopologies.length) {
            subTopologies.push(this.endFormatter());
        }
        if (match) {
            subTopologies.push(this.startFormatter(match[1]));
            subTopologiesList.push(match[1]);
        }
    }
}

class Source {
    static pattern = /Source:\s+(\S+)\s+\(topics:\s+\[(.*)\]\)/;

    static formatter(source, topic) {
        return `${topic}[${topic}] --> ${source}`;
    }

    static visit(line, outside, topicSourcesList, ref) {
        let match = line.match(this.pattern);
        if (match) {
            ref.currentGraphNodeName = match[1].trim();
            let topics = match[2];
            topics
                .split(',')
                .filter(String)
                .map((topic) => topic.trim())
                .forEach((topic) => {
                    outside.push(this.formatter(ref.currentGraphNodeName, topic));
                    topicSourcesList.push(topic);
                });
        }
    }
}

class Processor {
    static pattern = /Processor:\s+(\S+)\s+\(stores:\s+\[(.*)\]\)/;

    static formatter(processor, store) {
        return processor.includes('JOIN')
            ? `${store}[(${nameFunction(store)})] --> ${processor}(${nameFunction(processor)})`
            : `${processor}(${nameFunction(processor)}) --> ${store}[(${nameFunction(store)})]`;
    }

    static visit(line, ref, outside, stateStoresList) {
        let match = line.match(this.pattern);
        if (match) {
            ref.currentGraphNodeName = match[1].trim();
            let stores = match[2];
            stores
                .split(',')
                .filter(String)
                .map((store) => store.trim())
                .forEach((store) => {
                    outside.push(this.formatter(ref.currentGraphNodeName, store));
                    stateStoresList.push(store);
                });
        }
    }
}

class Sink {
    static pattern = /Sink:\s+(\S+)\s+\(topic:\s+(.*)\)/;

    static formatter(sink, topic) {
        return `${sink}(${nameFunction(sink)}) --> ${topic}[${topic}]`;
    }

    static visit(line, ref, outside, topicSinksList) {
        let match = line.match(this.pattern);
        if (match) {
            ref.currentGraphNodeName = match[1].trim();
            let topic = match[2].trim();
            outside.push(this.formatter(ref.currentGraphNodeName, topic));
            topicSinksList.push(topic);
        }
    }
}

class RightArrow {
    static pattern = /\s*-->\s+(.*)/;

    static formatter(src, dst) {
        return `${src}(${nameFunction(src)}) --> ${dst}(${nameFunction(dst)})`;
    }

    static visit(line, ref, subTopologies) {
        let match = line.match(this.pattern);
        if (match) {
            match[1]
                .split(',')
                .filter(String)
                .map((target) => target.trim())
                .filter((target) => target !== 'none')
                .forEach((target) => {
                    subTopologies.push(this.formatter(ref.currentGraphNodeName, target));
                });
        }
    }
}

class AsciiToMermaid {
    static toMermaid(topology) {
        let lines = topology.split('\n');
        let subTopologies = [];
        let outside = [];
        let currentGraphNodeName = { currentGraphNodeName: '' };
        let subTopologiesList = [];
        let topicSourcesList = [];
        let topicSinksList = [];
        let stateStoresList = [];

        for (const line of lines) {
            switch (true) {
                case SubTopology.pattern.test(line):
                    SubTopology.visit(line, subTopologies, subTopologiesList);
                    break;
                case Source.pattern.test(line):
                    Source.visit(line, outside, topicSourcesList, currentGraphNodeName);
                    break;
                case Processor.pattern.test(line):
                    Processor.visit(line, currentGraphNodeName, outside, stateStoresList);
                    break;
                case Sink.pattern.test(line):
                    Sink.visit(line, currentGraphNodeName, outside, topicSinksList);
                    break;
                case RightArrow.pattern.test(line):
                    RightArrow.visit(line, currentGraphNodeName, subTopologies);
                    break;
                default:
                    break;
            }
        }

        if (subTopologies.length) {
            subTopologies.push(SubTopology.endFormatter());
        }

        return ['graph TD'].concat(outside, subTopologies, topicSourcesList, topicSinksList, stateStoresList).join('\n');
    }
}

const nameFunction = (value) => value.replace(/-/g, '-<br>');

async function generateTopology() {
    try {
        const topologyFilePath = core.getInput('topologyFilePath') || 'docs/topology/stream.txt';
        const processorTopicsFilePath = core.getInput('processorTopicsOutputFilePath') || 'docs/topics/processor-topics.txt';
        const readmeFilePath = core.getInput('readmeFilePath') || 'README.md';
        // Read the contents of topology/stream.txt file
        const topologyString = fs.readFileSync(topologyFilePath, 'utf8');

        collectAllTopicNames(topologyString, processorTopicsFilePath);

        let readmeFileContent = '';

        if (fs.existsSync(readmeFilePath)) {
            // Read the contents of README.md file
            readmeFileContent = fs.readFileSync(readmeFilePath, 'utf8');
        }

        // Generate mermaid graph
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
    } catch (error) {
        console.error('An error occurred while updating the README.md:', error);
        process.exit(1);
    }
}

async function collectAllTopicNames(topologyString, outputFilePath) {
    try {
        const regex = /\(\s*topic:\s*([^\)]+)\)|\btopics:\s*\[([^\]]+)\]/g;
    
        const matches = topologyString.match(regex);
    
        if (matches) {
          const extractedTopics = matches.map((match) => {
            const [, topicMatch, topicsMatch] = match.match(
              /\(\s*topic:\s*([^\)]+)\)|\btopics:\s*\[([^\]]+)\]/
            );
            return (topicMatch || 
                (topicsMatch && 
                    topicsMatch
                    .split(",")
                    .map((t) => t.trim())
                    .join("\n"))
            );
          });

          const uniqueTopicNames = new Set(extractedTopics);
          const topicNamesString = Array.from(uniqueTopicNames).sort().join('\n');

          const directoryPath = path.dirname(outputFilePath);
          fs.mkdirSync(directoryPath, { recursive: true });
          fs.writeFileSync(outputFilePath, topicNamesString, 'utf-8');
        }
      } catch (error) {
        console.error("An error occurred:", error.message);
      }
}

generateTopology();