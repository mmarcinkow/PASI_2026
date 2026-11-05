(() => {
  "use strict";

  // Ten sam układ grafu przykładowego co w eksperymencie z wirusem.
  // Pozycje pozostają stałe podczas wszystkich kroków i losowań.
  const originalPoints = [
    [406.4, 221.9], [570, 197.6], [438.2, 311.5], [369.7, 460],
    [205.6, 424.1], [235.8, 265.7], [70, 160.7], [171.9, 60],
    [374.6, 132.3], [558.9, 86.2],
  ];
  const makeGraph = (name, points, edges) => ({
    name,
    vertices: points.map(([x, y], index) => ({ x, y, index })),
    edges: edges.map(([source, target, bend = 0]) => ({ source, target, bend })),
  });
  const graphs = {
    original: makeGraph("Graf przykładowy", originalPoints, [
      ...originalPoints.map((_, i) => [i, (i + 1) % 10]),
      [8, 0], [9, 1], [2, 5], [0, 2], [8, 1], [5, 8],
    ]),
    cycle: makeGraph("Cykl skierowany", Array.from({ length: 8 }, (_, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / 8;
      return [330 + 225 * Math.cos(angle), 260 + 185 * Math.sin(angle)];
    }), Array.from({ length: 8 }, (_, i) => [i, (i + 1) % 8])),
    traps: makeGraph("Dwa zamknięte obszary", [
      [95, 260], [275, 120], [500, 120], [275, 370], [445, 370], [575, 370],
    ], [[0, 1], [1, 2], [2, 2], [0, 3], [3, 4], [4, 5, 50], [5, 4, 50]]),
    sink: makeGraph("Zaułek", [
      [95, 260], [275, 120], [500, 120], [275, 370], [470, 445], [565, 285],
    ], [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [5, 3]]),
  };

  function outgoing(graph) {
    const result = graph.vertices.map(() => []);
    // Zachowujemy indeksy krawędzi: równoległe krawędzie to osobne wybory.
    graph.edges.forEach((edge, index) => result[edge.source].push(index));
    return result;
  }

  function transitionMatrix(graph, beta = 1, repairDangling = false) {
    if (!Number.isFinite(beta) || beta < 0 || beta > 1) {
      throw new RangeError("Parametr beta musi należeć do [0, 1].");
    }
    const N = graph.vertices.length;
    if (N === 0) throw new RangeError("Graf nie może być pusty.");
    return outgoing(graph).map((edges) => {
      if (edges.length === 0) {
        if (!repairDangling) throw new Error("Nie określono ruchu z wierzchołka bez wyjścia.");
        return Array(N).fill(1 / N);
      }
      const row = Array(N).fill((1 - beta) / N);
      edges.forEach((index) => { row[graph.edges[index].target] += beta / edges.length; });
      return row;
    });
  }

  function distributionHistory(matrix, start, rounds) {
    let alpha = Array(matrix.length).fill(0);
    alpha[start] = 1;
    const history = [alpha];
    for (let n = 0; n < rounds; n += 1) {
      const next = Array(matrix.length).fill(0);
      matrix.forEach((row, i) => row.forEach((value, j) => { next[j] += alpha[i] * value; }));
      // Nie normalizujemy: suma 1 jest zachowywana przez macierz przejścia.
      alpha = next;
      history.push(alpha);
    }
    return history;
  }

  function eigenvectorCentrality(graph) {
    const N = graph.vertices.length;
    if (N === 0) return null;
    const forward = graph.vertices.map(() => []);
    const backward = graph.vertices.map(() => []);
    graph.edges.forEach(({ source, target }) => {
      forward[source].push(target);
      backward[target].push(source);
    });
    const reachesAll = (neighbors) => {
      const visited = new Set([0]);
      const pending = [0];
      while (pending.length) {
        neighbors[pending.pop()].forEach((vertex) => {
          if (!visited.has(vertex)) {
            visited.add(vertex);
            pending.push(vertex);
          }
        });
      }
      return visited.size === N;
    };
    // W skrypcie centralność definiujemy dla grafów silnie spójnych.
    if (!reachesAll(forward) || !reachesAll(backward)) return null;
    let centrality = Array(N).fill(1 / N);
    for (let step = 0; step < 10000; step += 1) {
      // Lewy wektor Perrona A + I; przesunięcie usuwa okresowość,
      // zachowując centralność macierzy sąsiedztwa A.
      const next = centrality.slice();
      graph.edges.forEach(({ source, target }) => { next[target] += centrality[source]; });
      const total = next.reduce((sum, value) => sum + value, 0);
      next.forEach((value, i) => { next[i] = value / total; });
      const difference = next.reduce((sum, value, i) => sum + Math.abs(value - centrality[i]), 0);
      if (difference < 1e-13) return next;
      centrality = next;
    }
    throw new Error("Nie uzyskano zbieżności centralności.");
  }

  function randomGenerator(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function trajectory(graph, start, rounds, beta, repairDangling, random) {
    const choices = outgoing(graph);
    const history = [{ vertex: start, kind: "start", edge: null }];
    let vertex = start;
    for (let n = 0; n < rounds; n += 1) {
      const edges = choices[vertex];
      let kind;
      let edge = null;
      if (edges.length === 0) {
        if (!repairDangling) throw new Error("Spacerowicz nie ma wyjścia.");
        kind = "dangling";
        vertex = Math.floor(random() * graph.vertices.length);
      } else if (random() >= beta) {
        kind = "teleport";
        vertex = Math.floor(random() * graph.vertices.length);
      } else {
        kind = "edge";
        edge = edges[Math.floor(random() * edges.length)];
        vertex = graph.edges[edge].target;
      }
      history.push({ vertex, kind, edge });
    }
    return history;
  }

  // Czyste funkcje są dostępne dla testów Node; przeglądarka nie potrzebuje
  // dodatkowych bibliotek ani pobierania danych z sieci.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { graphs, outgoing, transitionMatrix, distributionHistory, eigenvectorCentrality, trajectory, randomGenerator };
  }
  if (typeof document === "undefined") return;

  const NS = "http://www.w3.org/2000/svg";
  const svgElement = (name, attributes = {}) => {
    const element = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  };
  const vertexName = (index) => `v${String(index).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d])}`;

  function edgePath(graph, edge) {
    const a = graph.vertices[edge.source];
    const b = graph.vertices[edge.target];
    if (edge.source === edge.target) {
      // Teleportacja do siebie również rysuje pętlę, także przy górnej
      // krawędzi rysunku. Nie wychodzimy wtedy poza obszar SVG.
      const top = Math.max(5, a.y - 105);
      return `M ${a.x - 19} ${a.y - 21} C ${a.x - 70} ${top}, ${a.x + 70} ${top}, ${a.x + 20} ${a.y - 24}`;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const start = `${a.x + 29 * ux} ${a.y + 29 * uy}`;
    const end = `${b.x - 34 * ux} ${b.y - 34 * uy}`;
    if (!edge.bend) return `M ${start} L ${end}`;
    return `M ${start} Q ${(a.x + b.x) / 2 - uy * edge.bend} ${(a.y + b.y) / 2 + ux * edge.bend} ${end}`;
  }

  function initialize(widget, widgetIndex) {
    if (widget.dataset.walkReady) return;
    widget.dataset.walkReady = "true";
    const improved = widget.dataset.walkMode === "pagerank";
    const compareCentrality = widget.hasAttribute("data-walk-centrality");
    const maxRound = Number(widget.dataset.walkRounds) || 120;
    const available = improved ? Object.keys(graphs) : ["original", "cycle", "traps"];
    widget.innerHTML = `
      <div class="virus-widget__graph">
        <svg viewBox="0 0 660 520" role="group" aria-label="Spacer losowy: wybierz wierzchołek początkowy"></svg>
        <p class="walk-widget__legend"><span>●</span> Jeden spacerowicz · kolor węzła i tabela: prawdopodobieństwo</p>
      </div>
      <div class="virus-widget__panel">
        <dl class="virus-widget__stats">
          <div><dt>Runda</dt><dd data-walk-round></dd></div>
          <div><dt>Początek</dt><dd data-walk-start></dd></div>
          <div><dt>Spacerowicz</dt><dd data-walk-position></dd></div>
          <div><dt>Suma prawdopodobieństw</dt><dd data-walk-total></dd></div>
        </dl>
        <div class="virus-widget__shares" data-walk-shares aria-label="${compareCentrality ? "Rozkład prawdopodobieństwa i centralność wektora własnego" : "Rozkład prawdopodobieństwa"}"></div>
        ${compareCentrality ? '<p class="walk-widget__centrality-note" data-walk-centrality-note></p>' : ""}
        <div class="virus-widget__controls">
          <button type="button" data-walk-action="previous" aria-label="Poprzednia runda">←</button>
          <button type="button" data-walk-action="next">Następny krok</button>
          <button type="button" data-walk-action="play">Odtwarzaj</button>
          <button type="button" data-walk-action="reset">Od początku</button>
          <button type="button" data-walk-action="resample" class="walk-widget__resample">Nowa trajektoria</button>
        </div>
        <label class="virus-widget__graph-picker">Wybierz graf
          <select data-walk-graph>${available.map((key) => `<option value="${key}">${graphs[key].name}</option>`).join("")}</select>
        </label>
        ${improved ? `<label class="walk-widget__teleport"><input type="checkbox" data-walk-teleport checked> Teleportacja</label>
        <label class="virus-widget__graph-picker">Prawdopodobieństwo zwykłego kroku β
          <select data-walk-beta><option value="0.5">0,50</option><option value="0.85" selected>0,85</option><option value="0.95">0,95</option></select>
        </label>` : ""}
        <label class="virus-widget__round-picker">Przejdź do rundy
          <input type="range" min="0" max="${maxRound}" step="1" value="0" data-walk-round-input>
        </label>
        <p class="virus-widget__hint" data-walk-status aria-live="polite"></p>
      </div>`;

    const select = (selector) => widget.querySelector(selector);
    const action = (name) => select(`[data-walk-action="${name}"]`);
    const svg = select("svg");
    const graphPicker = select("[data-walk-graph]");
    if (improved) graphPicker.value = "traps";
    const teleportToggle = select("[data-walk-teleport]");
    const betaPicker = select("[data-walk-beta]");
    const roundInput = select("[data-walk-round-input]");
    const percentages = new Intl.NumberFormat("pl-PL", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
    let graph = graphs[graphPicker.value];
    let start = 0;
    let round = 0;
    let seed = 2026 + widgetIndex;
    let history;
    let walk;
    let timer = null;
    let movement = null;
    let nodes = [];
    let rows = [];
    let edges = [];
    const beta = () => improved && teleportToggle.checked ? Number(betaPicker.value) : 1;

    const defs = svgElement("defs");
    const markerIds = ["edge", "jump"].map((name) => `walk-${widgetIndex}-${name}`);
    markerIds.forEach((id, i) => {
      const marker = svgElement("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" });
      marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: i ? "#c66516" : "#65747c" }));
      defs.append(marker);
    });
    const edgeLayer = svgElement("g", { "aria-hidden": "true" });
    const jump = svgElement("path", { class: "walk-widget__jump", "marker-end": `url(#${markerIds[1]})`, "aria-hidden": "true" });
    const nodeLayer = svgElement("g");
    const person = svgElement("g", { class: "walk-widget__person", "aria-hidden": "true" });
    // Schematyczny krasnal: czapka, broda i nos, bez drobnych detali.
    // Cała postać stoi na prawo od węzła i nie zasłania jego oznaczenia.
    person.append(
      svgElement("ellipse", { cx: 33, cy: -2, rx: 5, ry: 2.5, class: "walk-widget__gnome-boots" }),
      svgElement("ellipse", { cx: 45, cy: -2, rx: 5, ry: 2.5, class: "walk-widget__gnome-boots" }),
      svgElement("path", { d: "M 31 -20 Q 27 -13 28 -5 Q 39 0 50 -5 Q 51 -13 47 -20 Z" }),
      svgElement("path", { d: "M 30 -20 Q 39 -17 48 -20 Q 47 -11 39 -6 Q 31 -11 30 -20 Z", class: "walk-widget__gnome-beard" }),
      svgElement("path", { d: "M 28 -21 L 39 -39 L 50 -21 Q 39 -18 28 -21 Z", class: "walk-widget__gnome-hat" }),
      svgElement("ellipse", { cx: 39, cy: -19, rx: 3.5, ry: 2.8, class: "walk-widget__gnome-nose" }),
    );
    svg.append(defs, edgeLayer, jump, nodeLayer, person);

    function stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      action("play").textContent = "Odtwarzaj";
    }

    function cancelMovement() {
      if (movement !== null) window.cancelAnimationFrame(movement);
      movement = null;
    }

    function draw() {
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      select("[data-walk-shares]").replaceChildren();
      const centrality = compareCentrality ? eigenvectorCentrality(graph) : null;
      if (compareCentrality) {
        const heading = document.createElement("div");
        heading.className = "virus-widget__share walk-widget__share-heading";
        heading.innerHTML = '<span class="walk-widget__probability-heading">Prawdopodobieństwo</span><span class="walk-widget__centrality-value">Centralność</span>';
        select("[data-walk-shares]").append(heading);
        select("[data-walk-centrality-note]").textContent = centrality
          ? "Centralność wektora własnego: stałe wartości o sumie 100%."
          : "Graf nie jest silnie spójny; centralność nie jest wyznaczona jednoznacznie.";
      }
      svg.setAttribute("aria-label", `${graph.name}: kliknij wierzchołek, aby wybrać początek spaceru`);
      edges = graph.edges.map((edge) => {
        const path = svgElement("path", { d: edgePath(graph, edge), class: "virus-widget__edge", "marker-end": `url(#${markerIds[0]})` });
        edgeLayer.append(path);
        return path;
      });
      nodes = graph.vertices.map((vertex) => {
        const group = svgElement("g", { class: "virus-widget__node", role: "button", tabindex: 0, "data-walk-node": vertex.index });
        const title = svgElement("title");
        const circle = svgElement("circle", { cx: vertex.x, cy: vertex.y, r: 27 });
        const label = svgElement("text", { x: vertex.x, y: vertex.y + 5, class: "virus-widget__node-label" });
        const variable = svgElement("tspan", { "font-style": "italic" });
        variable.textContent = "v";
        const subscript = svgElement("tspan", { "font-size": "55%", dy: 4 });
        subscript.textContent = String(vertex.index);
        label.append(variable, subscript);
        group.append(title, circle, label);
        group.addEventListener("click", () => chooseStart(vertex.index));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            chooseStart(vertex.index);
          }
        });
        nodeLayer.append(group);
        return { group, circle, title };
      });
      rows = graph.vertices.map((vertex) => {
        const row = document.createElement("div");
        row.className = "virus-widget__share";
        row.innerHTML = `<span class="virus-widget__vertex-name"><i>v</i><sub>${vertex.index}</sub></span><span class="virus-widget__share-track"><span class="virus-widget__share-bar"></span></span><span class="virus-widget__share-value"></span>${compareCentrality ? '<span class="virus-widget__share-value walk-widget__centrality-value" data-walk-centrality-value></span>' : ""}`;
        if (compareCentrality) {
          const value = row.querySelector("[data-walk-centrality-value]");
          value.textContent = centrality ? percentages.format(centrality[vertex.index]) : "—";
          value.title = centrality ? centrality[vertex.index].toPrecision(8) : "Brak jednoznacznej centralności";
        }
        select("[data-walk-shares]").append(row);
        return { row, bar: row.querySelector(".virus-widget__share-bar"), value: row.querySelector(".virus-widget__share-value") };
      });
    }

    function movePerson(animate) {
      cancelMovement();
      const destination = graph.vertices[walk[round].vertex];
      const place = (x, y) => person.setAttribute("transform", `translate(${x} ${y})`);
      if (!animate || round === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        place(destination.x, destination.y);
        return;
      }
      const event = walk[round];
      const path = event.kind === "edge" ? edges[event.edge] : jump;
      const length = path.getTotalLength();
      const origin = graph.vertices[walk[round - 1].vertex];
      const first = path.getPointAtLength(0);
      const last = path.getPointAtLength(length);
      const began = performance.now();
      // Na końcach uzupełniamy odcinki od środka węzła do obciętej krawędzi.
      const tick = (now) => {
        const t = Math.min(1, (now - began) / 440);
        if (t < 0.12) {
          const f = t / 0.12;
          place(origin.x + f * (first.x - origin.x), origin.y + f * (first.y - origin.y));
        } else if (t > 0.88) {
          const f = (t - 0.88) / 0.12;
          place(last.x + f * (destination.x - last.x), last.y + f * (destination.y - last.y));
        } else {
          const point = path.getPointAtLength(length * (t - 0.12) / 0.76);
          place(point.x, point.y);
        }
        movement = t < 1 ? window.requestAnimationFrame(tick) : null;
      };
      movement = window.requestAnimationFrame(tick);
    }

    function update(animate = false) {
      const alpha = history[round];
      const event = walk[round];
      select("[data-walk-round]").textContent = String(round);
      select("[data-walk-start]").textContent = vertexName(start);
      select("[data-walk-position]").textContent = vertexName(event.vertex);
      select("[data-walk-total]").textContent = alpha.reduce((sum, p) => sum + p, 0).toLocaleString("pl-PL", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
      roundInput.value = String(round);
      // Stała skala: pełny pasek zawsze oznacza prawdopodobieństwo 1.
      nodes.forEach(({ group, circle, title }, i) => {
        circle.style.fill = `hsl(178 48% ${96 - 38 * Math.sqrt(alpha[i])}%)`;
        group.classList.toggle("is-start", i === start);
        group.setAttribute("aria-pressed", String(i === start));
        group.setAttribute("aria-label", `${vertexName(i)}: prawdopodobieństwo ${percentages.format(alpha[i])}; wybierz jako początek`);
        title.textContent = `Prawdopodobieństwo: ${alpha[i].toPrecision(8)}`;
        rows[i].bar.style.width = `${100 * alpha[i]}%`;
        rows[i].value.textContent = percentages.format(alpha[i]);
        rows[i].value.title = alpha[i].toPrecision(8);
      });
      edges.forEach((edge, i) => edge.classList.toggle("is-traversed", event.kind === "edge" && i === event.edge));
      const isJump = event.kind === "teleport" || event.kind === "dangling";
      jump.style.display = isJump ? "" : "none";
      if (isJump) jump.setAttribute("d", edgePath(graph, { source: walk[round - 1].vertex, target: event.vertex, bend: 60 }));
      action("previous").disabled = round === 0;
      action("next").disabled = round === maxRound;
      if (improved) betaPicker.disabled = !teleportToggle.checked;
      const messages = {
        start: "Wybierz następny krok. Procenty są zaokrąglone; ich wyświetlona suma może różnić się od 100%.",
        edge: "Spacerowicz wybrał jedną z krawędzi wychodzących.",
        teleport: "Teleportacja: losowy skok do wierzchołka, niekoniecznie wzdłuż krawędzi.",
        dangling: "Brak krawędzi wychodzących: losowy skok do dowolnego wierzchołka.",
      };
      select("[data-walk-status]").textContent = round === maxRound
        ? `Koniec ${maxRound}. rundy. Możesz cofnąć eksperyment lub wybrać inny początek.` : messages[event.kind];
      movePerson(animate);
    }

    function rebuild() {
      stop();
      round = 0;
      history = distributionHistory(transitionMatrix(graph, beta(), improved), start, maxRound);
      walk = trajectory(graph, start, maxRound, beta(), improved, randomGenerator(seed));
      update();
    }

    function chooseStart(index) {
      start = index;
      rebuild();
    }

    graphPicker.addEventListener("change", () => {
      stop();
      graph = graphs[graphPicker.value];
      start = 0;
      draw();
      rebuild();
    });
    teleportToggle?.addEventListener("change", rebuild);
    betaPicker?.addEventListener("change", rebuild);
    roundInput.addEventListener("input", () => {
      stop();
      round = Math.max(0, Math.min(maxRound, Number(roundInput.value)));
      update();
    });
    action("previous").addEventListener("click", () => { stop(); round = Math.max(0, round - 1); update(); });
    action("next").addEventListener("click", () => { stop(); round = Math.min(maxRound, round + 1); update(true); });
    action("reset").addEventListener("click", () => { stop(); round = 0; update(); });
    action("resample").addEventListener("click", () => {
      stop();
      seed += 1;
      walk = trajectory(graph, start, maxRound, beta(), improved, randomGenerator(seed));
      round = 0;
      update();
    });
    action("play").addEventListener("click", () => {
      if (timer !== null) { stop(); return; }
      if (round === maxRound) { round = 0; update(); }
      action("play").textContent = "Pauza";
      timer = window.setInterval(() => {
        round += 1;
        update(true);
        if (round === maxRound) stop();
      }, 800);
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", () => { stop(); cancelMovement(); });
    draw();
    rebuild();
  }

  const initializeAll = () => document.querySelectorAll("[data-walk-widget]").forEach(initialize);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAll, { once: true });
  else initializeAll();
})();
