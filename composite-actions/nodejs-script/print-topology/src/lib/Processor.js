import nameFunction from "./utils.js";

export default class Processor {
  static pattern = /Processor:\s+(\S+)\s+\(stores:\s+\[(.*)\]\)/;

  static formatter(processor, store) {
    return processor.includes("JOIN")
      ? `${store}[(${nameFunction(store)})] --> ${processor}(${nameFunction(processor)})`
      : `${processor}(${nameFunction(processor)}) --> ${store}[(${nameFunction(store)})]`;
  }

  static visit(line, ref, outside) {
    const match = line.match(this.pattern);
    if (match) {
      ref.currentGraphNodeName = match[1].trim();
      const stores = match[2];
      stores
        .split(",")
        .filter(String)
        .map((store) => store.trim())
        .forEach((store) => {
          outside.push(this.formatter(ref.currentGraphNodeName, store));
        });
    }
  }

  static getProcessorStores(topology) {
    const processorStateStores = [];

    const lines = topology.split("\n");
    lines.forEach((line) => {
      const match = line.match(this.pattern);
      if (match) {
        const stores = match[2];

        stores
          .split(",")
          .filter(String)
          .map((store) => store.trim())
          .forEach((store) => {
            processorStateStores.push(store);
          });
      }
    });

    return processorStateStores;
  }
}
