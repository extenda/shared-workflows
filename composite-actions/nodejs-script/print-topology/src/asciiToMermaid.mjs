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

const nameFunction = (value) => value.replaceAll('-', '-<br>');

export { AsciiToMermaid };
