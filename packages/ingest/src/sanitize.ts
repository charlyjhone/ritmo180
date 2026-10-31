// Limpeza do HTML das questões. O que passa daqui é seguro para exibir ao aluno.
import sanitizeHtml from "sanitize-html";

const SVG_TAGS = ["svg", "g", "path", "line", "polyline", "polygon", "rect", "circle", "ellipse", "text", "tspan", "defs", "marker", "title", "lineargradient", "linearGradient", "stop", "pattern", "clipPath", "use"];
const SVG_ATTRIBUTES = [
  "viewBox", "xmlns", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "dx", "dy",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity",
  "transform", "text-anchor", "dominant-baseline", "font-size", "font-weight", "font-family", "font-style",
  "id", "class", "role", "aria-label", "marker-end", "marker-start", "markerWidth", "markerHeight", "refX", "refY", "orient",
  "offset", "stop-color", "stop-opacity", "gradientUnits", "patternUnits", "clip-path", "preserveAspectRatio",
];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "sub", "sup", "span", "div", "ul", "ol", "li", "blockquote", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td", "caption", "img", ...SVG_TAGS],
  allowedAttributes: {
    "*": ["class"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    img: ["src", "alt", "width", "height"],
    ...Object.fromEntries(SVG_TAGS.map((tag) => [tag, SVG_ATTRIBUTES])),
  },
  allowedSchemes: ["data"],
  allowedSchemesByTag: { img: ["data"] },
  allowProtocolRelative: false,
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false, xmlMode: false },
};

export const cleanHtml = (html: string): string => sanitizeHtml(html, OPTIONS).trim();
