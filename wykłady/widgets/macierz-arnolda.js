(() => {
  "use strict";

  const PHI = (1 + Math.sqrt(5)) / 2;
  const MATRIX = Object.freeze([Object.freeze([2, 1]), Object.freeze([1, 1])]);
  const LAMBDA_1 = (3 + Math.sqrt(5)) / 2;
  const LAMBDA_2 = (3 - Math.sqrt(5)) / 2;
  // Both row eigenvectors have l1 norm one and are orthogonal.
  const C = Object.freeze([1 / PHI, 1 / (PHI * PHI)]);
  const D = Object.freeze([-C[1], C[0]]);
  const MAX_ROUND = 20;
  const SVG_NS = "http://www.w3.org/2000/svg";

  function normalize(alpha) {
    if (!Array.isArray(alpha) || alpha.length !== 2 ||
        !alpha.every((x) => Number.isFinite(x) && x >= 0) ||
        !alpha.some((x) => x > 0)) {
      throw new RangeError("Współrzędne muszą być skończonymi liczbami nieujemnymi, a przynajmniej jedna musi być dodatnia.");
    }
    // Scaling first also permits large inputs without overflowing the sum.
    const scale = Math.max(...alpha);
    const values = alpha.map((x) => x / scale);
    const total = values[0] + values[1];
    return values.map((x) => x / total);
  }

  function multiply(alpha) {
    return [2 * alpha[0] + alpha[1], alpha[0] + alpha[1]];
  }

  function decompose(alpha) {
    const squaredNorm = C[0] * C[0] + C[1] * C[1];
    return {
      a: (alpha[0] * C[0] + alpha[1] * C[1]) / squaredNorm,
      b: (alpha[0] * D[0] + alpha[1] * D[1]) / squaredNorm,
    };
  }

  function iterationHistory(initial, rounds = MAX_ROUND) {
    if (!Number.isInteger(rounds) || rounds < 0 || rounds > 1000) {
      throw new RangeError("Liczba iteracji musi być całkowita i należeć do przedziału od 0 do 1000.");
    }
    let alpha = normalize(initial);
    const result = [];
    for (let k = 0; k <= rounds; k += 1) {
      result.push({
        k, alpha, ...decompose(alpha),
        error: Math.abs(alpha[0] - C[0]) + Math.abs(alpha[1] - C[1]),
      });
      alpha = normalize(multiply(alpha));
    }
    return result;
  }

  // The numerical model can be tested in Node without a browser.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { MATRIX, C, D, LAMBDA_1, LAMBDA_2, normalize, multiply, decompose, iterationHistory };
  }
  if (typeof document === "undefined") return;

  function svgElement(name, attributes = {}, text) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  // Fixed equal scales on both axes: changes in direction are not distorted.
  const point = ([x, y]) => [215 + 250 * x, 365 - 250 * y];
  function line(from, to, attributes = {}) {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return svgElement("line", { x1, y1, x2, y2, ...attributes });
  }
  function label(position, text, attributes = {}) {
    const [x, y] = point(position);
    return svgElement("text", { x, y, ...attributes }, text);
  }

  function format(value, digits = 6) {
    if (value === 0) return "0";
    if (Math.abs(value) < 0.0001) {
      const [mantissa, exponent] = value.toExponential(2).split("e");
      return `${mantissa.replace(".", ",").replace("-", "−")}·10${[...String(Number(exponent))]
        .map((character) => character === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(character)]).join("")}`;
    }
    return value.toFixed(digits).replace(".", ",").replace("-", "−");
  }

  function initialize(root, index) {
    if (root.dataset.arnoldReady) return;
    root.dataset.arnoldReady = "true";
    const svg = root.querySelector("[data-arnold-plot]");
    const form = root.querySelector("[data-arnold-form]");
    const status = root.querySelector("[data-arnold-status]");
    const action = (name) => root.querySelector(`[data-arnold-action="${name}"]`);
    const colors = { axis: "#73818a", current: "#477fc6", perron: "#168c88", secondary: "#8b5ca6" };
    const marker = (name) => `url(#arnold-${index}-${name})`;
    let round = 0;
    let history;

    const title = svgElement("title", {}, "Metoda potęgowa dla grafu z dwoma wierzchołkami");
    const description = svgElement("desc");
    const defs = svgElement("defs");
    Object.entries(colors).forEach(([name, color]) => {
      const arrow = svgElement("marker", {
        id: `arnold-${index}-${name}`, viewBox: "0 0 10 10",
        refX: 9, refY: 5, markerWidth: 8, markerHeight: 8,
        orient: "auto", markerUnits: "userSpaceOnUse",
      });
      arrow.append(svgElement("path", { d: "M 0 1 L 9 5 L 0 9 Z", fill: color }));
      defs.append(arrow);
    });
    svg.replaceChildren(title, description, defs);
    const background = svgElement("g", { class: "arnold-widget__grid" });
    for (const tick of [-0.5, 0.5, 1]) {
      background.append(line([tick, -0.1], [tick, 1.15]));
    }
    for (const tick of [0.5, 1]) {
      background.append(line([-0.65, tick], [1.1, tick]));
    }
    svg.append(background);
    svg.append(
      line([-0.65, 0], [1.12, 0], { class: "arnold-widget__axis", "marker-end": marker("axis") }),
      line([0, -0.1], [0, 1.15], { class: "arnold-widget__axis", "marker-end": marker("axis") }),
      label([1.13, -0.04], "v₁", { class: "arnold-widget__axis-label" }),
      label([0.035, 1.16], "v₂", { class: "arnold-widget__axis-label" }),
      label([-0.025, -0.065], "0", { "text-anchor": "end", class: "arnold-widget__tick" }),
    );
    for (const tick of [-0.5, 0.5, 1]) {
      svg.append(label([tick, -0.085], String(tick).replace(".", ",").replace("-", "−"), {
        "text-anchor": "middle", class: "arnold-widget__tick",
      }));
    }
    for (const tick of [0.5, 1]) {
      svg.append(label([-0.04, tick - 0.02], String(tick).replace(".", ","), {
        "text-anchor": "end", class: "arnold-widget__tick",
      }));
    }
    svg.append(
      line([0, 1], [1, 0], { class: "arnold-widget__simplex" }),
      label([0.63, 0.65], "‖αₖ‖₁ = 1", { class: "arnold-widget__simplex-label" }),
    );

    const trail = svgElement("g", { class: "arnold-widget__trail" });
    const decomposition = svgElement("g", { class: "arnold-widget__components" });
    svg.append(trail, decomposition);
    for (const [vector, name, text, dx, dy] of [
      [C, "perron", "c", 0.045, -0.095],
      [D, "secondary", "d", -0.06, 0.04],
    ]) {
      svg.append(
        line([0, 0], vector, { stroke: colors[name], "stroke-width": 2.5, "marker-end": marker(name) }),
        label([vector[0] + dx, vector[1] + dy], text, {
          fill: colors[name], class: "arnold-widget__math-label",
        }),
      );
    }
    const [cx, cy] = point(C);
    svg.append(svgElement("circle", { cx, cy, r: 7, fill: "white", stroke: colors.perron, "stroke-width": 2 }));
    const current = line([0, 0], [0, 0], {
      stroke: colors.current, "stroke-width": 3, "marker-end": marker("current"),
    });
    const currentTip = svgElement("circle", { r: 4, fill: colors.current });
    const currentLabel = label([0, 0], "", { fill: colors.current, class: "arnold-widget__math-label" });
    svg.append(current, currentTip, currentLabel);

    function update() {
      const state = history[round];
      const [x, y] = point(state.alpha);
      current.setAttribute("x2", x);
      current.setAttribute("y2", y);
      currentTip.setAttribute("cx", x);
      currentTip.setAttribute("cy", y);
      currentLabel.setAttribute("x", x + 11);
      currentLabel.setAttribute("y", y - 13);
      // Explicit subscript positioning avoids browser-dependent SVG baselines.
      currentLabel.replaceChildren(
        svgElement("tspan", {}, "α"),
        svgElement("tspan", { dy: 4, "font-size": 12, "font-style": "normal" }, String(round)),
      );
      const aC = C.map((value) => state.a * value);
      decomposition.replaceChildren(
        line([0, 0], aC, {
          stroke: colors.perron, "stroke-width": 5, "stroke-dasharray": "5 5", opacity: 0.45,
          "marker-end": marker("perron"),
        }),
      );
      // Hide a subpixel second component instead of drawing a detached arrowhead.
      if (Math.hypot(state.alpha[0] - aC[0], state.alpha[1] - aC[1]) * 250 > 1) {
        decomposition.append(line(aC, state.alpha, {
          stroke: colors.secondary, "stroke-width": 2.5, "stroke-dasharray": "5 4",
          "marker-end": marker("secondary"),
        }));
      }
      trail.replaceChildren(...history.slice(0, round).map((previous) => {
        const [px, py] = point(previous.alpha);
        return svgElement("circle", {
          cx: px, cy: py, r: 3, fill: colors.current, opacity: 0.25 + 0.35 * previous.k / Math.max(1, round),
        });
      }));
      root.querySelector("[data-arnold-round]").textContent = round;
      root.querySelector("[data-arnold-index]").textContent = round;
      root.querySelector("[data-arnold-vector]").textContent = `(${state.alpha.map((v) => format(v)).join("; ")})`;
      root.querySelector("[data-arnold-error]").textContent = state.error < 1e-14 ? "< 10⁻¹⁴" : format(state.error);
      const rows = history.slice(Math.max(0, round - 4), round + 1).map((entry) => {
        const row = document.createElement("tr");
        if (entry.k === round) row.classList.add("is-current");
        for (const [column, value] of [entry.k, entry.a, entry.b].entries()) {
          const cell = document.createElement(column === 0 ? "th" : "td");
          if (column === 0) cell.scope = "row";
          cell.textContent = column === 0 ? value : Math.abs(value) < 1e-14 ? "≈ 0" : format(value);
          if (column > 0) cell.classList.add(column === 1 ? "is-perron" : "is-secondary");
          row.append(cell);
        }
        return row;
      });
      root.querySelector("[data-arnold-coefficients]").replaceChildren(...rows);
      action("previous").disabled = round === 0;
      action("reset").disabled = round === 0;
      action("next").disabled = round === MAX_ROUND;
      status.textContent = state.error < 1e-14
        ? "Wektor jest już równy c z dokładnością numeryczną. Możesz wybrać inny początek."
        : `Krok ${round} z ${MAX_ROUND}. Każdy kolejny krok to mnożenie przez A i normalizacja.`;
      description.textContent = `Iteracja ${round}. Wektor (${state.alpha.map((v) => format(v)).join("; ")}). ` +
        `Rozkład: a = ${format(state.a)}, b = ${format(state.b)}. Granica c = (0,618034; 0,381966).`;
    }

    function restart() {
      try {
        history = iterationHistory([form.elements.x.valueAsNumber, form.elements.y.valueAsNumber]);
        round = 0;
        update();
      } catch (error) {
        status.textContent = error.message;
      }
    }

    form.addEventListener("submit", (event) => { event.preventDefault(); restart(); });
    action("next").addEventListener("click", () => { round = Math.min(MAX_ROUND, round + 1); update(); });
    action("previous").addEventListener("click", () => { round = Math.max(0, round - 1); update(); });
    action("reset").addEventListener("click", () => { round = 0; update(); });
    restart();
  }

  const initializeAll = () => document.querySelectorAll("[data-arnold-widget]").forEach(initialize);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAll, { once: true });
  else initializeAll();
})();
