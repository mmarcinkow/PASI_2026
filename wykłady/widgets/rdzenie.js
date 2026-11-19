/* Odtwarzanie śladu wygenerowanego w Pythonie; bez ponownej implementacji peelingu. */
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  function element(name, attrs, text) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function initialize(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = "true";
    const status = root.querySelector("[data-core-status]");
    try {
      const response = await fetch(root.dataset.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const svg = root.querySelector("svg");
      const selector = root.querySelector("[data-core-k]");
      const previous = root.querySelector('[data-core-action="previous"]');
      const next = root.querySelector('[data-core-action="next"]');
      let round = 0;
      const positions = new Map(data.nodes.map(v => [v.id, v]));
      const edges = data.edges.map(([u, v]) => {
        const from = positions.get(u), to = positions.get(v);
        const line = element("line", {x1: from.x, y1: from.y, x2: to.x, y2: to.y,
                                      class: "core-widget__edge"});
        svg.append(line);
        return {u, v, line};
      });
      const nodes = data.nodes.map(v => {
        const group = element("g", {class: "core-widget__node", transform: `translate(${v.x} ${v.y})`});
        const title = element("title", {}, "");
        const circle = element("circle", {r: 15});
        const label = element("text", {"text-anchor": "middle", dy: ".35em"}, "");
        group.append(title, circle, label);
        svg.append(group);
        return {id: v.id, group, label, title};
      });

      function render() {
        const k = selector.value;
        const trace = data.traces[k];
        const state = trace[round];
        const active = new Set(state.active), remove = new Set(state.remove);
        for (const {u, v, line} of edges) {
          line.classList.toggle("is-removed", !active.has(u) || !active.has(v));
        }
        for (const {id, group, label, title} of nodes) {
          group.classList.toggle("is-removed", !active.has(id));
          group.classList.toggle("is-next", remove.has(id));
          label.textContent = active.has(id) ? state.degrees[id] : "";
          title.textContent = `Wierzchołek ${id}: ` + (!active.has(id) ? "usunięty" :
            `stopień ${state.degrees[id]}` + (remove.has(id) ? ", do usunięcia w następnej rundzie" : ""));
        }
        root.querySelector("[data-core-round]").textContent = `Runda ${round} z ${trace.length - 1}`;
        root.querySelector("[data-core-count]").textContent = active.size;
        root.querySelector("[data-core-remove]").textContent = remove.size;
        previous.disabled = round === 0;
        next.disabled = round === trace.length - 1;
        status.textContent = remove.size ?
          `Następna runda usunie ${remove.size} wierzchołków o stopniu mniejszym niż ${k}. Stopnie pozostałych obliczymy ponownie.` :
          active.size ? `Gotowy ${k}-rdzeń. Każdy pozostały wierzchołek ma co najmniej ${k} sąsiadów w tym rdzeniu.` :
          `Gotowy ${k}-rdzeń jest pusty. Wszystkie wierzchołki zostały usunięte.`;
        root.dataset.round = String(round);
        root.dataset.k = k;
      }
      function move(delta) {
        round = Math.max(0, Math.min(data.traces[selector.value].length - 1, round + delta));
        render();
      }
      selector.addEventListener("change", () => { round = 0; render(); });
      previous.addEventListener("click", () => move(-1));
      next.addEventListener("click", () => move(1));
      root.querySelector('[data-core-action="reset"]').addEventListener("click", () => {round = 0; render();});
      const fullscreen = root.querySelector('[data-core-action="fullscreen"]');
      fullscreen.hidden = !root.requestFullscreen;
      fullscreen.addEventListener("click", async () => {
        try {
          if (document.fullscreenElement === root) await document.exitFullscreen();
          else await root.requestFullscreen();
        } catch (_) {
          status.textContent = "Przeglądarka nie pozwoliła włączyć pełnego ekranu.";
        }
      });
      document.addEventListener("fullscreenchange", () => {
        fullscreen.textContent = document.fullscreenElement === root ? "⛶ Pomniejsz" : "⛶ Powiększ";
      });
      root.addEventListener("keydown", event => {
        if (event.target.matches("select, input") || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }
      });
      render();
    } catch (error) {
      status.textContent = "Nie udało się wczytać animacji. Odśwież stronę; wybrane rdzenie pokazano również na rysunku poniżej.";
      console.error("Nie udało się wczytać śladu rdzeni:", error);
    }
  }
  document.querySelectorAll("[data-core-widget]").forEach(initialize);
})();
