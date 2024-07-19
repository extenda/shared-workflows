import nameFunction from "./utils.js";

export default class RightArrow {
  static pattern = /\s*-->\s+(.*)/;

  static formatter(src, dst) {
    return `${src}(${nameFunction(src)}) --> ${dst}(${nameFunction(dst)})`;
  }

  static visit(line, ref, subTopologies) {
    const match = line.match(this.pattern);
    if (match) {
      match[1]
        .split(",")
        .filter(String)
        .map((target) => target.trim())
        .filter((target) => target !== "none")
        .forEach((target) => {
          subTopologies.push(this.formatter(ref.currentGraphNodeName, target));
        });
    }
  }
}
