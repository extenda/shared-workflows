const fs = require('fs');
const AsciiToMermaid = require('./asciiToMermaid');

class Core {
    static getInput() {
        return '';
    }

    static setOutput() {
        return;
    }

    static error() {
        return;
    }
}

jest.mock('@actions/core', () => Core);

describe('Topology Generator', () => {
    jest.mock('fs');

    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('AsciiToMermaid', () => {
        describe('toMermaid', () => {
            test('should convert ASCII topology to mermaid graph definition', () => {
                const topologyString = `Sub-topology: 1
Source: source1 (topics: [topic1, topic2])
Processor: processor1 (stores: [store1, store2])
Sink: sink1 (topic: topic3)
--> processor1`;

                const expectedMermaidGraph = `graph TD
source1(source1) --> topic1[topic1]
source1(source1) --> topic2[topic2]
processor1(processor1) --> store1[(store1)]
processor1(processor1) --> store2[(store2)]
processor1(processor1) --> sink1(sink1)
processor1(processor1) --> processor1(processor1)
subgraph Sub-Topology: 1
end`;

                const mermaidGraph = AsciiToMermaid.toMermaid(topologyString);

                expect(mermaidGraph).toEqual(expectedMermaidGraph);
            });
        });
    });

    describe('generateTopology', () => {
        test('should update README.md file with mermaid graph', () => {
            const topologyString = `Sub-topology: 1
Source: source1 (topics: [topic1, topic2])
Processor: processor1 (stores: [store1, store2])
Sink: sink1 (topic: topic3)
--> processor1`;

            const readmeFileContent = `### Existing Content
Some text
----
### Kafka Stream Topology
\`\`\`mermaid
graph TD
source1(source1) --> topic1[topic1]
source1(source1) --> topic2[topic2]
processor1(processor1) --> store1[(store1)]
processor1(processor1) --> store2[(store2)]
processor1(processor1) --> sink1(sink1)
processor1(processor1) --> processor1(processor1)
subgraph Sub-Topology: 1
end
\`\`\`
----`;

            const updatedReadmeFileContent = `### Existing Content
Some text
----
### Kafka Stream Topology
\`\`\`mermaid
graph TD
source1(source1) --> topic1[topic1]
source1(source1) --> topic2[topic2]
processor1(processor1) --> store1[(store1)]
processor1(processor1) --> store2[(store2)]
processor1(processor1) --> sink1(sink1)
processor1(processor1) --> processor1(processor1)
subgraph Sub-Topology: 1
end
\`\`\`
----
### Kafka Stream Topology
\`\`\`mermaid
graph TD
source1(source1) --> topic1[topic1]
source1(source1) --> topic2[topic2]
processor1(processor1) --> store1[(store1)]
processor1(processor1) --> store2[(store2)]
processor1(processor1) --> sink1(sink1)
processor1(processor1) --> processor1(processor1)
subgraph Sub-Topology: 1
end
\`\`\`
----`;

            fs.readFileSync.mockImplementation((filePath, encoding) => {
                if (filePath === 'docs/topology/stream.txt') {
                    return topologyString;
                } else if (filePath === 'README.md') {
                    return readmeFileContent;
                }
            });

            fs.writeFileSync.mockImplementation(() => {});

            generateTopology();

            expect(fs.readFileSync).toHaveBeenCalledWith('docs/topology/stream.txt', 'utf8');
            expect(fs.readFileSync).toHaveBeenCalledWith('README.md', 'utf8');
            expect(fs.writeFileSync).toHaveBeenCalledWith('README.md', updatedReadmeFileContent, 'utf-8');
        });

        test('should create new mermaid graph in README.md file', () => {
            const topologyString = `Sub-topology: 1
Source: source1 (topics: [topic1, topic2])
Processor: processor1 (stores: [store1, store2])
Sink: sink1 (topic: topic3)
--> processor1`;

            const readmeFileContent = `### Existing Content
Some text
----
`;

            const updatedReadmeFileContent = `### Existing Content
Some text
----
### Kafka Stream Topology
\`\`\`mermaid
graph TD
source1(source1) --> topic1[topic1]
source1(source1) --> topic2[topic2]
processor1(processor1) --> store1[(store1)]
processor1(processor1) --> store2[(store2)]
processor1(processor1) --> sink1(sink1)
processor1(processor1) --> processor1(processor1)
subgraph Sub-Topology: 1
end
\`\`\`
----`;

            fs.readFileSync.mockImplementation((filePath, encoding) => {
                if (filePath === 'docs/topology/stream.txt') {
                    return topologyString;
                } else if (filePath === 'README.md') {
                    return readmeFileContent;
                }
            });

            fs.writeFileSync.mockImplementation(() => {});

            generateTopology();

            expect(fs.readFileSync).toHaveBeenCalledWith('docs/topology/stream.txt', 'utf8');
            expect(fs.readFileSync).toHaveBeenCalledWith('README.md', 'utf8');
            expect(fs.writeFileSync).toHaveBeenCalledWith('README.md', updatedReadmeFileContent, 'utf-8');
        });

        test('should handle error while updating README.md file', () => {
            const topologyString = `Sub-topology: 1
Source: source1 (topics: [topic1, topic2])
Processor: processor1 (stores: [store1, store2])
Sink: sink1 (topic: topic3)
--> processor1`;

            const readmeFileContent = `### Existing Content
Some text
----
### Kafka Stream Topology
\`\`\`mermaid
graph TD
source1(source1) --> topic1[topic1]
source1(source1) --> topic2[topic2]
processor1(processor1) --> store1[(store1)]
processor1(processor1) --> store2[(store2)]
processor1(processor1) --> sink1(sink1)
processor1(processor1) --> processor1(processor1)
subgraph Sub-Topology: 1
end
\`\`\`
----`;

            fs.readFileSync.mockImplementation((filePath, encoding) => {
                if (filePath === 'docs/topology/stream.txt') {
                    return topologyString;
                } else if (filePath === 'README.md') {
                    return readmeFileContent;
                }
            });

            fs.writeFileSync.mockImplementation(() => {
                throw new Error('File write error');
            });

            const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

            generateTopology();

            expect(fs.readFileSync).toHaveBeenCalledWith('docs/topology/stream.txt', 'utf8');
            expect(fs.readFileSync).toHaveBeenCalledWith('README.md', 'utf8');
            expect(fs.writeFileSync).toHaveBeenCalledWith('README.md', expect.any(String), 'utf-8');
            expect(mockError).toHaveBeenCalledWith('An error occurred while updating the README.md:', expect.any(Error));
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });
});
