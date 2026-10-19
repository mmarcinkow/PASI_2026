(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const vertices = [
    { x: 105, y: 115 },
    { x: 305, y: 95 },
    { x: 525, y: 140 },
    { x: 100, y: 350 },
    { x: 305, y: 330 },
    { x: 525, y: 340 },
  ];
  // Each entry is one edge, including parallel edges and loops.
  // Indices in the data are zero-based; displayed labels start at v_1.
  const edges = [
    { source: 0, target: 0, loopAngle: -Math.PI / 2 },
    { source: 0, target: 1, bend: -38 },
    { source: 0, target: 1, bend: 38 },
    { source: 1, target: 2 },
    { source: 1, target: 4 },
    { source: 2, target: 5 },
    { source: 3, target: 0 },
    { source: 3, target: 4, bend: 32 },
    { source: 4, target: 3, bend: 32 },
    { source: 4, target: 5, bend: -46 },
    { source: 4, target: 5 },
    { source: 4, target: 5, bend: 46 },
    { source: 5, target: 1 },
    { source: 5, target: 5, loopAngle: Math.PI / 2 },
  ];
  const matrix = vertices.map(() => Array(vertices.length).fill(0));
  edges.forEach(({ source, target }) => { matrix[source][target] += 1; });
  const outDegrees = matrix.map(row => row.reduce((sum, value) => sum + value, 0));

  // Exact, reduced fractions avoid rounding the probabilities in M.
  function fractionText(numerator, denominator) {
    let a = numerator;
    let b = denominator;
    while (b) [a, b] = [b, a % b];
    const top = numerator / a;
    const bottom = denominator / a;
    return bottom === 1 ? String(top) : `${top}/${bottom}`;
  }

  function appendValue(element, value) {
    if (!value.includes("/")) {
      element.append(value);
      return;
    }
    const fraction = document.createElement("span");
    fraction.className = "adjacency-widget__fraction";
    fraction.setAttribute("role", "img");
    fraction.setAttribute("aria-label", value);
    value.split("/").forEach(part => {
      const term = document.createElement("span");
      term.textContent = part;
      term.setAttribute("aria-hidden", "true");
      fraction.append(term);
    });
    element.append(fraction);
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function vertexLabel(index) {
    const label = document.createElement("span");
    label.className = "adjacency-widget__vertex-label";
    const variable = document.createElement("i");
    variable.textContent = "v";
    const subscript = document.createElement("sub");
    subscript.textContent = String(index + 1);
    label.append(variable, subscript);
    return label;
  }

  function edgePath(edge) {
    const source = vertices[edge.source];
    const target = vertices[edge.target];
    if (edge.source === edge.target) {
      const point = (radius, angle) =>
        `${source.x + radius * Math.cos(angle)} ${source.y + radius * Math.sin(angle)}`;
      const angle = edge.loopAngle;
      return `M ${point(31, angle - 0.6)}
        C ${point(100, angle - 0.75)}, ${point(100, angle + 0.75)},
          ${point(35, angle + 0.6)}`;
    }
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy);
    const bend = edge.bend || 0;
    const control = {
      x: (source.x + target.x) / 2 - (dy / length) * bend,
      y: (source.y + target.y) / 2 + (dx / length) * bend,
    };
    const startLength = Math.hypot(control.x - source.x, control.y - source.y);
    const endLength = Math.hypot(control.x - target.x, control.y - target.y);
    const startX = source.x + 31 * (control.x - source.x) / startLength;
    const startY = source.y + 31 * (control.y - source.y) / startLength;
    const endX = target.x + 35 * (control.x - target.x) / endLength;
    const endY = target.y + 35 * (control.y - target.y) / endLength;
    return bend
      ? `M ${startX} ${startY} Q ${control.x} ${control.y} ${endX} ${endY}`
      : `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  function onActivate(element, action) {
    element.addEventListener("click", action);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    });
  }

  function initialize(widget, widgetIndex) {
    const isWalk = widget.dataset.adjacencyMode === "walk";
    const matrixSymbol = isWalk ? "M" : "A";
    const entryValue = (row, column) => isWalk
      ? fractionText(matrix[row][column], outDegrees[row])
      : String(matrix[row][column]);
    const svg = widget.querySelector("svg");
    const matrixContainer = widget.querySelector("[data-adjacency-matrix]");
    const status = widget.querySelector("[data-adjacency-status]");
    const reset = widget.querySelector("[data-adjacency-reset]");
    let selection = null;

    const markers = {
      normal: `adjacency-arrow-${widgetIndex}`,
      selected: `adjacency-arrow-selected-${widgetIndex}`,
    };
    const defs = svgElement("defs");
    Object.entries(markers).forEach(([state, id]) => {
      // End the shaft inside the arrowhead so it cannot protrude at the tip.
      const marker = svgElement("marker", {
        id, viewBox: "0 0 10 10", refX: 8, refY: 5,
        markerWidth: 6, markerHeight: 6, orient: "auto",
      });
      marker.appendChild(svgElement("path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        fill: state === "selected" ? "#365d91" : "#65747c",
        stroke: "none",
      }));
      defs.appendChild(marker);
    });
    svg.appendChild(defs);

    const edgeElements = edges.map((edge, index) => {
      const group = svgElement("g", {
        class: "adjacency-widget__edge",
        role: "button", tabindex: 0, "aria-pressed": "false",
        "aria-label": `Krawędź ${index + 1}: z wierzchołka ${edge.source + 1} do wierzchołka ${edge.target + 1}`,
        "data-adjacency-edge": index,
      });
      const d = edgePath(edge);
      const hit = svgElement("path", { d, class: "adjacency-widget__edge-hit" });
      const line = svgElement("path", {
        d, class: "adjacency-widget__edge-line",
        "marker-end": `url(#${markers.normal})`,
      });
      group.append(hit, line);
      onActivate(group, () => {
        selection = { type: "edge", index };
        update();
      });
      svg.appendChild(group);
      return { group, line };
    });

    const nodeElements = vertices.map((vertex, index) => {
      const group = svgElement("g", {
        class: "adjacency-widget__node",
        role: "button", tabindex: 0, "aria-pressed": "false",
        "aria-label": `Wierzchołek ${index + 1}: zaznacz wychodzące krawędzie i wiersz macierzy`,
        "data-adjacency-node": index,
      });
      const circle = svgElement("circle", { cx: vertex.x, cy: vertex.y, r: 28 });
      const label = svgElement("text", {
        x: vertex.x, y: vertex.y + 5, class: "adjacency-widget__node-label",
      });
      const variable = svgElement("tspan", { "font-style": "italic" });
      variable.textContent = "v";
      const subscript = svgElement("tspan", { "font-size": "55%", dy: 5 });
      subscript.textContent = String(index + 1);
      label.append(variable, subscript);
      group.append(circle, label);
      onActivate(group, () => {
        selection = { type: "node", index };
        update();
      });
      svg.appendChild(group);
      return group;
    });

    const table = document.createElement("table");
    const caption = table.createCaption();
    const symbol = document.createElement("i");
    symbol.textContent = matrixSymbol;
    caption.append(isWalk ? "Macierz spaceru losowego " : "Macierz sąsiedztwa ", symbol);
    const header = table.createTHead().insertRow();
    const corner = document.createElement("td");
    corner.setAttribute("aria-hidden", "true");
    header.appendChild(corner);
    const columnHeaders = vertices.map((_, index) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.appendChild(vertexLabel(index));
      header.appendChild(th);
      return th;
    });
    const rowHeaders = [];
    const body = table.createTBody();
    const cells = matrix.map((values, rowIndex) => {
      const row = body.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.appendChild(vertexLabel(rowIndex));
      row.appendChild(th);
      rowHeaders.push(th);
      return values.map((value, columnIndex) => {
        const cell = row.insertCell();
        const displayedValue = entryValue(rowIndex, columnIndex);
        cell.dataset.value = displayedValue;
        appendValue(cell, displayedValue);
        cell.classList.toggle("is-nonzero", value !== 0);
        return cell;
      });
    });
    matrixContainer.appendChild(table);

    function update() {
      const selectedEdge = selection?.type === "edge" ? edges[selection.index] : null;
      const source = selectedEdge ? selectedEdge.source : selection?.index;
      const targets = new Set(selectedEdge ? [selectedEdge.target]
        : selection ? edges.filter((edge) => edge.source === source).map((edge) => edge.target) : []);

      nodeElements.forEach((node, index) => {
        node.classList.toggle("is-source", index === source);
        node.classList.toggle("is-target", targets.has(index));
        node.setAttribute("aria-pressed", String(selection?.type === "node" && index === source));
      });
      edgeElements.forEach(({ group, line }, index) => {
        const active = selectedEdge ? index === selection.index : edges[index].source === source;
        group.classList.toggle("is-selected", active);
        group.setAttribute("aria-pressed", String(selection?.type === "edge" && index === selection.index));
        line.setAttribute("marker-end", `url(#${active ? markers.selected : markers.normal})`);
      });
      rowHeaders.forEach((header, index) => header.classList.toggle("is-source", index === source));
      columnHeaders.forEach((header, index) => header.classList.toggle("is-target", targets.has(index)));
      cells.forEach((row, i) => row.forEach((cell, j) => {
        cell.classList.toggle("is-source", i === source);
        cell.classList.toggle("is-target", targets.has(j));
      }));

      status.replaceChildren();
      if (!selection) {
        status.textContent = "Kliknij wierzchołek lub krawędź.";
      } else if (selectedEdge) {
        status.append("Wybrano krawędź ", vertexLabel(source), " → ", vertexLabel(selectedEdge.target), ". ");
        const entry = document.createElement("span");
        entry.className = "adjacency-widget__vertex-label";
        const a = document.createElement("i");
        a.textContent = matrixSymbol;
        const indices = document.createElement("sub");
        indices.textContent = `${source + 1}${selectedEdge.target + 1}`;
        entry.append(a, indices);
        status.append(entry, " = ");
        appendValue(status, entryValue(source, selectedEdge.target));
        status.append(isWalk
          ? " — prawdopodobieństwo przejścia między tymi wierzchołkami, łącznie po wszystkich równoległych krawędziach."
          : " — liczba wszystkich krawędzi o tych samych początku i końcu.");
      } else {
        status.append("Wybrano ", vertexLabel(source), isWalk
          ? `. Wiersz ${source + 1} opisuje rozkład prawdopodobieństwa po jednym kroku spaceru z tego wierzchołka.`
          : `. Wiersz ${source + 1} zlicza krawędzie wychodzące z tego wierzchołka.`);
      }
    }

    function clear() {
      selection = null;
      update();
    }
    reset.addEventListener("click", clear);
    svg.addEventListener("click", (event) => { if (event.target === svg) clear(); });
    widget.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); clear(); }
    });
    // Start with a loop and parallel edges highlighted to illustrate both cases.
    selection = { type: "node", index: 0 };
    update();
  }

  document.querySelectorAll("[data-adjacency-widget]").forEach(initialize);
})();
