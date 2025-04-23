import SubTopology from "./SubTopology.js";
import Source from "./Source.js";
import Processor from "./Processor.js";
import Sink from "./Sink.js";
import RightArrow from "./RightArrow.js";

export default class Topology {
  static toMermaid(topology) {
    const lines = topology.split("\n");
    const subTopologies = [];
    const outside = [];
    const currentGraphNodeName = { currentGraphNodeName: "" };
    const subTopologiesList = [];

    lines.forEach((line) => {
      switch (true) {
        case SubTopology.pattern.test(line):
          SubTopology.visit(line, subTopologies, subTopologiesList);
          break;
        case Source.pattern.test(line):
          Source.visit(line, currentGraphNodeName, outside);
          break;
        case Processor.pattern.test(line):
          Processor.visit(line, currentGraphNodeName, outside);
          break;
        case Sink.pattern.test(line):
          Sink.visit(line, currentGraphNodeName, outside);
          break;
        case RightArrow.pattern.test(line):
          RightArrow.visit(line, currentGraphNodeName, subTopologies);
          break;
        default:
          break;
      }
    });

    if (subTopologies.length) {
      subTopologies.push(SubTopology.endFormatter());
    }

    return ["graph TD"].concat(outside, subTopologies).join("\n");
  }

  static collectTopicsAndStores(topologyContent) {
    const sinkTopics = Sink.getSinkTopics(topologyContent);
    const sourceTopics = Source.getSourceTopics(topologyContent);
    const topicsList = new Set(sourceTopics.concat(sinkTopics));
    const stateStores = new Set(Processor.getProcessorStores(topologyContent));

    return {
      topics: Array.from(topicsList),
      stateStores: Array.from(stateStores),
    };
  }
}
