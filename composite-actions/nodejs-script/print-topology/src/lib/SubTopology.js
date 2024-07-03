export default class SubTopology {
  static pattern = /Sub-topology: ([0-9]*)/;

  static startFormatter(subTopology) {
    return `subgraph Sub-Topology: ${subTopology}`;
  }

  static endFormatter() {
    return "end";
  }

  static visit(line, subTopologies, subTopologiesList) {
    const match = line.match(this.pattern);
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
