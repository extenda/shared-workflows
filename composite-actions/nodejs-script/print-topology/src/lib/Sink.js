import nameFunction from "./utils.js";

export default class Sink {
  static pattern = /Sink:\s+(\S+)\s+\(topic:\s+(.*)\)/;

  static formatter(sink, topic) {
    return `${sink}(${nameFunction(sink)}) --> ${topic}[${topic}]`;
  }

  static visit(line, ref, outside) {
    const match = line.match(this.pattern);
    if (match) {
      ref.currentGraphNodeName = match[1].trim();
      const topic = match[2].trim();
      outside.push(this.formatter(ref.currentGraphNodeName, topic));
    }
  }

  static getSinkTopics(topology) {
    const sinkTopics = [];

    const lines = topology.split("\n");
    lines.forEach((line) => {
      const match = line.match(this.pattern);
      if (match) {
        const topic = match[2].trim();
        sinkTopics.push(topic);
      }
    });

    return sinkTopics;
  }
}
