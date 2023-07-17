"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AsciiToMermaid = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var SubTopology = /*#__PURE__*/function () {
  function SubTopology() {
    _classCallCheck(this, SubTopology);
  }
  _createClass(SubTopology, null, [{
    key: "startFormatter",
    value: function startFormatter(subTopology) {
      return "subgraph Sub-Topology: ".concat(subTopology);
    }
  }, {
    key: "endFormatter",
    value: function endFormatter() {
      return "end";
    }
  }, {
    key: "visit",
    value: function visit(line, subTopologies, subTopologiesList) {
      var match = line.match(this.pattern);
      // Close the previous sub-topology before opening a new one;
      if (subTopologies.length) {
        subTopologies.push(this.endFormatter());
      }
      if (match) {
        subTopologies.push(this.startFormatter(match[1]));
        subTopologiesList.push(match[1]);
      }
    }
  }]);
  return SubTopology;
}();
_defineProperty(SubTopology, "pattern", /Sub-topology: ([0-9]*)/);
var Source = /*#__PURE__*/function () {
  function Source() {
    _classCallCheck(this, Source);
  }
  _createClass(Source, null, [{
    key: "formatter",
    value: function formatter(source, topic) {
      return "".concat(topic, "[").concat(topic, "] --> ").concat(source);
    }
  }, {
    key: "visit",
    value: function visit(line, outside, topicSourcesList, ref) {
      var _this = this;
      var match = line.match(this.pattern);
      if (match) {
        ref.currentGraphNodeName = match[1].trim();
        var topics = match[2];
        topics.split(',').filter(String).map(function (topic) {
          return topic.trim();
        }).forEach(function (topic) {
          outside.push(_this.formatter(ref.currentGraphNodeName, topic));
          topicSourcesList.push(topic);
        });
      }
    }
  }]);
  return Source;
}();
_defineProperty(Source, "pattern", /Source:\s+(\S+)\s+\(topics:\s+\[(.*)\]\)/);
var Processor = /*#__PURE__*/function () {
  function Processor() {
    _classCallCheck(this, Processor);
  }
  _createClass(Processor, null, [{
    key: "formatter",
    value: function formatter(processor, store) {
      return processor.includes('JOIN') ? "".concat(store, "[(").concat(nameFunction(store), ")] --> ").concat(processor, "(").concat(nameFunction(processor), ")") : "".concat(processor, "(").concat(nameFunction(processor), ") --> ").concat(store, "[(").concat(nameFunction(store), ")]");
    }
  }, {
    key: "visit",
    value: function visit(line, ref, outside, stateStoresList) {
      var _this2 = this;
      var match = line.match(this.pattern);
      if (match) {
        ref.currentGraphNodeName = match[1].trim();
        var stores = match[2];
        stores.split(',').filter(String).map(function (store) {
          return store.trim();
        }).forEach(function (store) {
          outside.push(_this2.formatter(ref.currentGraphNodeName, store));
          stateStoresList.push(store);
        });
      }
    }
  }]);
  return Processor;
}();
_defineProperty(Processor, "pattern", /Processor:\s+(\S+)\s+\(stores:\s+\[(.*)\]\)/);
var Sink = /*#__PURE__*/function () {
  function Sink() {
    _classCallCheck(this, Sink);
  }
  _createClass(Sink, null, [{
    key: "formatter",
    value: function formatter(sink, topic) {
      return "".concat(sink, "(").concat(nameFunction(sink), ") --> ").concat(topic, "[").concat(topic, "]");
    }
  }, {
    key: "visit",
    value: function visit(line, ref, outside, topicSinksList) {
      var match = line.match(this.pattern);
      if (match) {
        ref.currentGraphNodeName = match[1].trim();
        var topic = match[2].trim();
        outside.push(this.formatter(ref.currentGraphNodeName, topic));
        topicSinksList.push(topic);
      }
    }
  }]);
  return Sink;
}();
_defineProperty(Sink, "pattern", /Sink:\s+(\S+)\s+\(topic:\s+(.*)\)/);
var RightArrow = /*#__PURE__*/function () {
  function RightArrow() {
    _classCallCheck(this, RightArrow);
  }
  _createClass(RightArrow, null, [{
    key: "formatter",
    value: function formatter(src, dst) {
      return "".concat(src, "(").concat(nameFunction(src), ") --> ").concat(dst, "(").concat(nameFunction(dst), ")");
    }
  }, {
    key: "visit",
    value: function visit(line, ref, subTopologies) {
      var _this3 = this;
      var match = line.match(this.pattern);
      if (match) {
        match[1].split(',').filter(String).map(function (target) {
          return target.trim();
        }).filter(function (target) {
          return target !== 'none';
        }).forEach(function (target) {
          subTopologies.push(_this3.formatter(ref.currentGraphNodeName, target));
        });
      }
    }
  }]);
  return RightArrow;
}();
_defineProperty(RightArrow, "pattern", /\s*-->\s+(.*)/);
var AsciiToMermaid = /*#__PURE__*/function () {
  function AsciiToMermaid() {
    _classCallCheck(this, AsciiToMermaid);
  }
  _createClass(AsciiToMermaid, null, [{
    key: "toMermaid",
    value: function toMermaid(topology) {
      var lines = topology.split('\n');
      var subTopologies = [];
      var outside = [];
      var currentGraphNodeName = {
        currentGraphNodeName: ''
      };
      var subTopologiesList = [];
      var topicSourcesList = [];
      var topicSinksList = [];
      var stateStoresList = [];
      var _iterator = _createForOfIteratorHelper(lines),
        _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done;) {
          var line = _step.value;
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
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
      if (subTopologies.length) {
        subTopologies.push(SubTopology.endFormatter());
      }
      return ['graph TD'].concat(outside, subTopologies, topicSourcesList, topicSinksList, stateStoresList).join('\n');
    }
  }]);
  return AsciiToMermaid;
}();
exports.AsciiToMermaid = AsciiToMermaid;
var nameFunction = function nameFunction(value) {
  return value.replaceAll('-', '-<br>');
};
