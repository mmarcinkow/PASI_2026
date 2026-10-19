(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULT_MAX_ROUND = 40;
  const PLAY_DELAY = 700;
  const SHARE_SCALE = 1_000_000_000_000_000n;
  const subscriptDigits = "₀₁₂₃₄₅₆₇₈₉";

  // The positions were obtained with NetworkX spring_layout (seed=4) and
  // rescaled to the SVG view box.  They are fixed here so the graph does not
  // jump when the simulation advances.
  const originalVertices = [
    { index: 0, x: 406.4, y: 221.9, labelDx: -43, labelDy: 0 },
    { index: 1, x: 570.0, y: 197.6 },
    { index: 2, x: 438.2, y: 311.5 },
    { index: 3, x: 369.7, y: 460.0 },
    { index: 4, x: 205.6, y: 424.1 },
    { index: 5, x: 235.8, y: 265.7 },
    { index: 6, x: 70.0, y: 160.7 },
    { index: 7, x: 171.9, y: 60.0 },
    { index: 8, x: 374.6, y: 132.3 },
    { index: 9, x: 558.9, y: 86.2 },
  ];

  // The directed 10-cycle makes the graph strongly connected.  The edge
  // 0 -> 2 also produces a directed 9-cycle, so the graph is aperiodic.
  const ringEdges = Array.from({ length: 10 }, (_, index) => ({
    source: index,
    target: (index + 1) % 10,
    bend: 0,
  }));

  const originalEdges = ringEdges.concat([
    { source: 8, target: 0, bend: 0 },
    { source: 9, target: 1, bend: 0 },
    { source: 2, target: 5, bend: 0 },
    { source: 0, target: 2, bend: 0 },
    { source: 8, target: 1, bend: 0 },
    { source: 5, target: 8, bend: 0 },
  ]);

  const graphs = {
    original: {
      name: "Graf przykładowy",
      vertices: originalVertices,
      edges: originalEdges,
    },
    cycle: {
      name: "Cykl skierowany",
      vertices: Array.from({ length: 8 }, (_, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / 8;
        return {
          index,
          x: 330 + 225 * Math.cos(angle),
          y: 260 + 185 * Math.sin(angle),
        };
      }),
      edges: Array.from({ length: 8 }, (_, index) => ({
        source: index,
        target: (index + 1) % 8,
      })),
    },
    branches: {
      name: "Trzy odgałęzienia",
      vertices: [
        { index: 0, x: 85, y: 260, labelDx: -43, labelDy: 0 },
        { index: 1, x: 280, y: 100, labelDx: 0, labelDy: -43 },
        { index: 2, x: 475, y: 100, labelDx: 0, labelDy: 43 },
        { index: 3, x: 280, y: 260, labelDx: 0, labelDy: -43 },
        { index: 4, x: 435, y: 260, labelDx: 0, labelDy: -43 },
        { index: 5, x: 575, y: 260, labelDx: 0, labelDy: -43 },
        { index: 6, x: 280, y: 420, labelDx: 0, labelDy: 43 },
        { index: 7, x: 475, y: 420, labelDx: 0, labelDy: 43 },
      ],
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 2 },
        { source: 0, target: 3 },
        { source: 3, target: 4 },
        { source: 4, target: 5, bend: 45 },
        { source: 5, target: 4, bend: 45 },
        { source: 0, target: 6 },
        { source: 6, target: 7 },
      ],
    },
  };

  // Keep the original layout and add one loop at every vertex: B = A + I.
  // Smaller loops fit between the existing edges without moving the labels.
  const originalLoopAngles = [125, 60, -75, 0, 180, 56, 100, -45, -115, -100];
  graphs.originalWithLoops = {
    name: "Graf przykładowy z pętlami",
    vertices: originalVertices,
    edges: originalEdges.concat(originalVertices.map((vertex) => ({
      source: vertex.index,
      target: vertex.index,
      loopAngle: originalLoopAngles[vertex.index] * Math.PI / 180,
      loopRadius: 80,
      loopSpread: vertex.index === 2 ? 0.3 : 0.4,
    }))),
  };

  // Keep the same cycle and add one loop at each vertex: B = A + I.
  // Draw the loops outside the cycle and the labels inside it.
  graphs.cycleWithLoops = {
    name: "Cykl z pętlami",
    vertices: graphs.cycle.vertices.map((vertex) => {
      const angle = Math.atan2(vertex.y - 260, vertex.x - 330);
      return {
        ...vertex,
        labelDx: -43 * Math.cos(angle),
        labelDy: -43 * Math.sin(angle),
      };
    }),
    edges: graphs.cycle.edges.concat(graphs.cycle.vertices.map((vertex) => ({
      source: vertex.index,
      target: vertex.index,
      loopAngle: Math.atan2(vertex.y - 260, vertex.x - 330),
    }))),
  };

  // Two directed cycles of lengths 4 and 6 share v_0. Their gcd is 2,
  // so the graph is strongly connected and periodic, but not regular.
  // Draw the bipartition {0, 2, 5, 7} and {1, 3, 4, 6, 8} in two columns.
  graphs.twoCycles = {
    name: "Graf dwudzielny bez pętli",
    vertices: [
      { x: 185, y: 215 },
      { x: 475, y: 80 },
      { x: 185, y: 125 },
      { x: 475, y: 170 },
      { x: 475, y: 260 },
      { x: 185, y: 305 },
      { x: 475, y: 350 },
      { x: 185, y: 395 },
      { x: 475, y: 440 },
    ].map((vertex, index) => ({
      ...vertex,
      index,
      loopAngle: vertex.x < 330 ? Math.PI : 0,
      labelDx: 0,
      labelDy: -43,
    })),
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 0 },
      { source: 0, target: 4 },
      { source: 4, target: 5 },
      { source: 5, target: 6 },
      { source: 6, target: 7 },
      { source: 7, target: 8 },
      { source: 8, target: 0 },
    ],
  };
  graphs.twoCyclesWithLoops = {
    name: "Graf dwudzielny z pętlami",
    vertices: graphs.twoCycles.vertices,
    edges: graphs.twoCycles.edges.concat(graphs.twoCycles.vertices.map((vertex) => ({
      source: vertex.index,
      target: vertex.index,
      loopAngle: vertex.loopAngle,
    }))),
  };

  function vertexName(index) {
    return `v${String(index)
      .split("")
      .map((digit) => subscriptDigits[Number(digit)])
      .join("")}`;
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function setHtmlVertexLabel(element, index) {
    const variable = document.createElement("i");
    variable.textContent = "v";
    const subscript = document.createElement("sub");
    subscript.textContent = String(index);
    element.classList.add("virus-widget__vertex-name");
    element.replaceChildren(variable, subscript);
  }

  function edgePath(graph, edge) {
    const source = graph.vertices[edge.source];
    const target = graph.vertices[edge.target];
    if (edge.source === edge.target) {
      if (edge.loopAngle !== undefined) {
        const point = (radius, angle) =>
          `${source.x + radius * Math.cos(angle)} ${source.y + radius * Math.sin(angle)}`;
        const angle = edge.loopAngle;
        const controlRadius = edge.loopRadius ?? 100;
        const spread = edge.loopSpread ?? 0.6;
        return `M ${point(31, angle - spread)}
          C ${point(controlRadius, angle - 1.25 * spread)}, ${point(controlRadius, angle + 1.25 * spread)},
            ${point(35, angle + spread)}`;
      }
      return `M ${source.x + 18} ${source.y - 27}
        C ${source.x + 80} ${source.y - 102},
          ${source.x - 80} ${source.y - 102},
          ${source.x - 21} ${source.y - 28}`;
    }
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const radius = 31;
    const startX = source.x + ux * radius;
    const startY = source.y + uy * radius;
    const endX = target.x - ux * (radius + 4);
    const endY = target.y - uy * (radius + 4);

    if (!edge.bend) {
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    const middleX = (startX + endX) / 2;
    const middleY = (startY + endY) / 2;
    const controlX = middleX - uy * edge.bend;
    const controlY = middleY + ux * edge.bend;
    return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
  }

  function buildHistory(graph, start, maxRound = DEFAULT_MAX_ROUND) {
    const history = [];
    // Longer experiments quickly exceed Number.MAX_SAFE_INTEGER.
    let counts = Array(graph.vertices.length).fill(0n);
    counts[start] = 1n;

    for (let round = 0; round <= maxRound; round += 1) {
      history.push(counts);
      const next = Array(graph.vertices.length).fill(0n);
      graph.edges.forEach(({ source, target }) => {
        next[target] += counts[source];
      });
      counts = next;
    }

    return history;
  }

  function countFontSize(count) {
    const digits = String(count).length;
    if (digits <= 3) return 17;
    if (digits === 4) return 14;
    if (digits === 5) return 12;
    if (digits === 6) return 10;
    if (digits <= 8) return 8.5;
    return 7.5;
  }

  function initializeWidget(widget, widgetIndex) {
    if (widget.dataset.virusReady === "true") return;
    widget.dataset.virusReady = "true";
    const svg = widget.querySelector("svg");
    const roundValue = widget.querySelector("[data-virus-round]");
    const totalValue = widget.querySelector("[data-virus-total]");
    const startValue = widget.querySelector("[data-virus-start]");
    const sharesContainer = widget.querySelector("[data-virus-shares]");
    const status = widget.querySelector("[data-virus-status]");
    const previousButton = widget.querySelector('[data-virus-action="previous"]');
    const nextButton = widget.querySelector('[data-virus-action="next"]');
    const playButton = widget.querySelector('[data-virus-action="play"]');
    const resetButton = widget.querySelector('[data-virus-action="reset"]');
    const graphSelect = widget.querySelector("[data-virus-graph]");
    const roundInput = widget.querySelector("[data-virus-round-input]");
    const requestedRounds = Number(widget.dataset.virusRounds);
    const maxRound = Number.isInteger(requestedRounds) && requestedRounds > 0
      ? requestedRounds : DEFAULT_MAX_ROUND;
    if (roundInput) roundInput.max = String(maxRound);
    const numberFormat = new Intl.NumberFormat("pl-PL");
    const scientificFormat = new Intl.NumberFormat("pl-PL", {
      notation: "scientific",
      maximumFractionDigits: 2,
    });
    const compactCount = (count) => scientificFormat.format(count).replace("E", "e");
    const percentFormat = new Intl.NumberFormat("pl-PL", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

    let graph = graphs[graphSelect.value];
    let start = 0;
    let round = 0;
    let history = buildHistory(graph, start, maxRound);
    let timer = null;

    const markerId = `virus-arrow-${widgetIndex}`;
    const defs = svgElement("defs");
    const marker = svgElement("marker", {
      id: markerId,
      viewBox: "0 0 10 10",
      refX: 8,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto-start-reverse",
    });
    marker.appendChild(svgElement("path", {
      d: "M 0 0 L 10 5 L 0 10 z",
      fill: "#65747c",
    }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const edgeLayer = svgElement("g", { "aria-hidden": "true" });
    const nodeLayer = svgElement("g");
    svg.append(edgeLayer, nodeLayer);
    let nodeElements = [];
    let shareElements = [];

    function drawGraph() {
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      sharesContainer.replaceChildren();
      svg.setAttribute("aria-label", `${graph.name}: wybierz wierzchołek początkowy`);

      graph.edges.forEach((edge) => {
        edgeLayer.appendChild(svgElement("path", {
          d: edgePath(graph, edge),
          class: "virus-widget__edge",
          "marker-end": `url(#${markerId})`,
        }));
      });

      nodeElements = graph.vertices.map((vertex) => {
        const labelAngle = Math.atan2(vertex.y - 260, vertex.x - 330);
        const group = svgElement("g", {
          class: "virus-widget__node",
          role: "button",
          tabindex: 0,
          "aria-label": `${vertexName(vertex.index)}: wybierz jako wierzchołek początkowy`,
        });
        const title = svgElement("title");
        const circle = svgElement("circle", {
          cx: vertex.x,
          cy: vertex.y,
          r: 29,
        });
        const count = svgElement("text", {
          x: vertex.x,
          y: vertex.y + 1,
          class: "virus-widget__node-count",
        });
        const label = svgElement("text", {
          x: vertex.x + (vertex.labelDx ?? 43 * Math.cos(labelAngle)),
          y: vertex.y + (vertex.labelDy ?? 43 * Math.sin(labelAngle)) + 4,
          class: "virus-widget__node-label",
        });
        const variable = svgElement("tspan", { "font-style": "italic" });
        variable.textContent = "v";
        const subscript = svgElement("tspan", { "font-size": "55%", dy: 4 });
        subscript.textContent = String(vertex.index);
        label.append(variable, subscript);
        group.append(title, circle, count, label);
        nodeLayer.appendChild(group);
        group.addEventListener("click", () => chooseStart(vertex.index));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            chooseStart(vertex.index);
          }
        });
        return { group, title, circle, count };
      });

      shareElements = graph.vertices.map((vertex) => {
        const row = document.createElement("div");
        row.className = "virus-widget__share";

        const label = document.createElement("span");
        label.className = "virus-widget__share-label";
        setHtmlVertexLabel(label, vertex.index);

        const track = document.createElement("span");
        track.className = "virus-widget__share-track";
        const bar = document.createElement("span");
        bar.className = "virus-widget__share-bar";
        track.appendChild(bar);

        const value = document.createElement("span");
        value.className = "virus-widget__share-value";

        row.append(label, track, value);
        sharesContainer.appendChild(row);
        return { row, bar, value };
      });
    }

    function stopPlaying() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      playButton.textContent = "Odtwarzaj";
    }

    function update() {
      const counts = history[round];
      const total = counts.reduce((sum, count) => sum + count, 0n);
      const extinct = total === 0n;
      // Only the displayed ratios are approximate; counts stay exact.
      // Dividing as BigInts first also avoids overflowing a Number.
      const shares = counts.map((count) => extinct ? 0
        : Number((count * SHARE_SCALE) / total) / Number(SHARE_SCALE));
      const largestShare = Math.max(...shares);

      roundValue.textContent = String(round);
      totalValue.textContent = String(total).length > 15
        ? compactCount(total) : numberFormat.format(total);
      totalValue.title = numberFormat.format(total);
      totalValue.setAttribute("aria-label", `${numberFormat.format(total)} wirusów`);
      if (roundInput) roundInput.value = String(round);
      setHtmlVertexLabel(startValue, start);

      nodeElements.forEach(({ group, title, circle, count }, index) => {
        const relativeShare = largestShare === 0 ? 0 : shares[index] / largestShare;
        const lightness = 96 - 38 * relativeShare;
        circle.style.fill = `hsl(178 48% ${lightness}%)`;
        const label = String(counts[index]).length > 9
          ? compactCount(counts[index]) : String(counts[index]);
        count.textContent = label;
        count.setAttribute("font-size", countFontSize(label));
        title.textContent = `${numberFormat.format(counts[index])} wirusów`;
        group.classList.toggle("is-start", index === start);
        group.setAttribute(
          "aria-label",
          `${vertexName(index)}: ${numberFormat.format(counts[index])} wirusów; wybierz jako wierzchołek początkowy`,
        );

        const relativeBarWidth = largestShare === 0 ? 0 : shares[index] / largestShare;
        shareElements[index].bar.style.width = `${100 * relativeBarWidth}%`;
        shareElements[index].value.textContent = extinct ? "—" : percentFormat.format(shares[index]);
        shareElements[index].value.title = extinct ? "Brak wirusów — udział nie jest określony." : "";
        shareElements[index].row.setAttribute(
          "aria-label",
          `${vertexName(index)}: ${extinct ? "udział nie jest określony" : percentFormat.format(shares[index])}`,
        );
      });

      previousButton.disabled = round === 0;
      nextButton.disabled = round === maxRound || extinct;
      if (extinct) stopPlaying();
      status.textContent = extinct
        ? "Wirusy wymarły. Udziały nie są określone, bo liczba wszystkich wirusów wynosi zero. Możesz cofnąć rundę lub wybrać inny punkt startowy."
        : round === maxRound
        ? `Osiągnięto ostatnią, ${maxRound}. rundę. Wybierz inny wierzchołek, aby powtórzyć eksperyment.`
        : "Porównuj udziały po prawej stronie, przechodząc do kolejnych rund.";
    }

    function chooseStart(index) {
      stopPlaying();
      start = index;
      round = 0;
      history = buildHistory(graph, start, maxRound);
      update();
    }

    graphSelect.addEventListener("change", () => {
      stopPlaying();
      graph = graphs[graphSelect.value];
      drawGraph();
      chooseStart(0);
    });

    roundInput?.addEventListener("input", () => {
      stopPlaying();
      round = Math.max(0, Math.min(maxRound, Number(roundInput.value)));
      update();
    });

    previousButton.addEventListener("click", () => {
      stopPlaying();
      round = Math.max(0, round - 1);
      update();
    });

    nextButton.addEventListener("click", () => {
      stopPlaying();
      round = Math.min(maxRound, round + 1);
      update();
    });

    resetButton.addEventListener("click", () => {
      stopPlaying();
      round = 0;
      update();
    });

    playButton.addEventListener("click", () => {
      if (timer !== null) {
        stopPlaying();
        return;
      }
      if (round === maxRound || history[round].every((count) => count === 0n)) round = 0;
      playButton.textContent = "Pauza";
      update();
      timer = window.setInterval(() => {
        round += 1;
        update();
        if (round === maxRound) stopPlaying();
      }, PLAY_DELAY);
    });

    drawGraph();
    update();
  }

  // The script also serves experiments placed later in the chapter.
  const initializeWidgets = () => {
    document.querySelectorAll("[data-virus-widget]").forEach(initializeWidget);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWidgets, { once: true });
  } else {
    initializeWidgets();
  }
})();
