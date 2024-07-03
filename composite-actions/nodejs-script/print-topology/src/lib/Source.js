export default class Source {
  static pattern = /Source:\s+(\S+)\s+\(topics:\s+\[(.*)\]\)/;

  static formatter(source, topic) {
    return `${topic}[${topic}] --> ${source}`;
  }

  static visit(line, ref, outside) {
    const match = line.match(this.pattern);
    if (match) {
      ref.currentGraphNodeName = match[1].trim();
      const topics = match[2];
      topics
        .split(",")
        .filter(String)
        .map((topic) => topic.trim())
        .forEach((topic) => {
          outside.push(this.formatter(ref.currentGraphNodeName, topic));
        });
    }
  }

  static getSourceTopics(topology) {
    const sourceTopics = [];

    const lines = topology.split("\n");
    lines.forEach((line) => {
      const match = line.match(this.pattern);
      if (match) {
        const topics = match[2];
        topics
          .split(",")
          .filter(String)
          .map((topic) => topic.trim())
          .forEach((topic) => {
            sourceTopics.push(topic);
          });
      }
    });

    return sourceTopics;
  }
}
