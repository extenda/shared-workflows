# print-topology

This is a GitHub Action used to visualize a Kafka Stream topology via a Mermaid diagram that is saved in README file. Additionally, it collects information such as topics, state stores etc. and saves it in a file.

### Inputs

- `topology-file-path` (optional, default: 'docs/topology/stream.txt'): Path to the topology file.
- `processor-topics-output-file-path` (optional, default: 'docs/topics/processor-topics.txt'): Path to the file to save extracted list of topics used in the processor.
- `readme-file-path` (optional, default: 'README.md'): Path to the README file.
- `application-ids` (optional, default: '[]'): List of application ids (processor with multiple processing-functions will have many) provided as a JSON array string. For example: ["application-1", "application-2"]

## Example

This example will generate a Mermaid Topology Diagram and create a file with collected topics, state store names and application ids.

```yaml
jobs:
  update-readme-topology:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Update README & Collect topics, state store names and application ids
        uses: extenda/shared-workflows/composite-actions/nodejs-script/print-topology@v0
        with:
          topology-file-path : ${{ inputs.topologyFilePath }}
          processor-topics-output-file-path : ${{ inputs.processorTopicsOutputFilePath }}
          readme-file-path : ${{ inputs.readmeFilePath }}
          application-ids : ${{ inputs.applicationIds }}
```

## Bundling source files

To bundle the source files follow these steps:
1. Open a terminal in the root directory of the GitHub Action.
2. Install the dependencies via `npm ci` command.
3. Run `npm run bulid` command.