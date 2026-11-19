/* Odtwarzanie sprawdzonego śladu; obliczenia Louvain są w code/louvain_widget.py. */
(() => {
  "use strict";
  const SVG = "http://www.w3.org/2000/svg";
  const palette = ["#477fc6", "#168c88", "#9662ae", "#ca7960", "#657d46", "#a86b39",
    "#497d8d", "#bd5e84", "#8171a8", "#956b4a", "#527965"];
  const color = group => palette[(group - 1) % palette.length];
  const groupName = group => `G${group}`;
  const memberText = members => `{${members.join(", ")}}`;
  const value = f => f.n / f.d;
  const exact = f => `${f.n < 0 ? "−" : ""}${Math.abs(f.n)}${f.d === 1 ? "" : `/${f.d}`}`;
  const decimal = f => value(f).toLocaleString("pl-PL", {minimumFractionDigits: 4, maximumFractionDigits: 5});
  const signed = f => `${f.n > 0 ? "+" : ""}${exact(f)}`;
  const mn = n => n < 0 ? `<mrow><mo>−</mo><mn>${-n}</mn></mrow>` : `<mn>${n}</mn>`;
  const frac = (a, b) => `<mfrac><mrow>${a}</mrow><mrow>${b}</mrow></mfrac>`;
  const rationalMath = f => f.d === 1 ? mn(f.n) : frac(mn(f.n), mn(f.d));
  function el(name, attrs = {}, text, namespace) {
    const node = namespace ? document.createElementNS(namespace, name) : document.createElement(name);
    Object.entries(attrs).forEach(([key, v]) => node.setAttribute(key, v));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const svgEl = (name, attrs, text) => el(name, attrs, text, SVG);
  function swatch(group) {
    return el("i", {class: "louvain-widget__swatch", style: `background:${color(group)}`, "aria-hidden": "true"});
  }
  function paragraph(text, cls = "") { return el("p", {class: cls}, text); }
  function hull(points) {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const half = list => {
      const result = [];
      list.forEach(p => {
        while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0) result.pop();
        result.push(p);
      });
      return result;
    };
    return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
  }

  async function initialize(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = "true";
    const get = name => root.querySelector(`[data-louvain-${name}]`);
    const button = name => root.querySelector(`[data-louvain-action="${name}"]`);
    const status = get("status");
    try {
      const response = await fetch(root.dataset.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      let index = 0, timer = null, pinned = null;
      const previous = button("previous"), next = button("next"), play = button("play");
      const slider = get("slider"), jump = get("jump");
      const originalSvg = get("original"), currentSvg = get("current");
      slider.max = data.steps.length - 1;
      data.milestones.forEach(m => jump.append(el("option", {value: m.index}, m.label)));

      function stop() {
        if (timer !== null) clearInterval(timer);
        timer = null;
        play.textContent = "Odtwarzaj";
        play.setAttribute("aria-pressed", "false");
      }
      function linked(members, label) {
        const selected = members || pinned;
        [originalSvg, currentSvg].forEach(svg => {
          svg.classList.toggle("has-linked", Boolean(selected));
          svg.querySelectorAll("[data-members]").forEach(node => {
            const ids = node.dataset.members.split(",").map(Number);
            node.classList.toggle("is-linked", Boolean(selected && ids.some(i => selected.includes(i))));
          });
        });
        get("hover").textContent = selected ?
          `${label || "Wyróżniony wierzchołek"} odpowiada w grafie wyjściowym zbiorowi ${memberText(selected)}. Wybierz ponownie, aby usunąć wyróżnienie.` :
          "Najedź na wierzchołek lub wybierz go, aby sprawdzić, co reprezentuje. Strzałki ← i → zmieniają krok.";
      }
      function connect(node, represented) {
        const enter = () => linked(represented.members, represented.label);
        node.addEventListener("pointerenter", enter);
        node.addEventListener("pointerleave", () => linked(null));
        node.addEventListener("focus", enter);
        node.addEventListener("blur", () => linked(null));
        const select = () => {
          pinned = pinned && pinned.join() === represented.members.join() ? null : represented.members;
          linked(null, represented.label);
        };
        node.addEventListener("click", select);
        node.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        });
      }

      function drawGraph(svg, graph, assignment, step, representatives) {
        svg.replaceChildren();
        const positions = new Map(graph.nodes.map(n => [n.id, n]));
        const active = step.vertex === undefined ? [] :
          data.levels[step.level].nodes.find(n => n.id === step.vertex).members;
        const activeSet = new Set(active);
        const bestTarget = step.options?.[0]?.target;
        const grouped = new Map();
        graph.nodes.forEach(n => {
          const c = assignment.get(n.id);
          if (!grouped.has(c)) grouped.set(c, []);
          grouped.get(c).push(n);
        });
        grouped.forEach((points, c) => {
          const boundary = hull(points);
          const path = boundary.length === 1 ?
            `M${boundary[0].x - .1},${boundary[0].y}h.2` :
            `${boundary.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")}${boundary.length > 2 ? "Z" : ""}`;
          svg.append(svgEl("path", {d: path, fill: boundary.length > 2 ? color(c) : "none",
            stroke: color(c), "stroke-width": 40, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: .075}));
        });
        graph.edges.forEach(edge => {
          const a = positions.get(edge.u), b = positions.get(edge.v);
          let cls = "louvain-widget__edge";
          const aActive = a.members.some(i => activeSet.has(i));
          const bActive = b.members.some(i => activeSet.has(i));
          if (aActive !== bActive) {
            const neighbor = aActive ? b : a;
            if (assignment.get(neighbor.id) === bestTarget) cls += " is-target";
            else if (assignment.get(neighbor.id) === step.source) cls += " is-source";
          }
          if (edge.u === edge.v) {
            svg.append(svgEl("path", {class: cls,
              d: `M${a.x - 8},${a.y - 13} C${a.x - 48},${a.y - 67} ${a.x + 48},${a.y - 67} ${a.x + 8},${a.y - 13}`}));
            if (edge.count > 1) svg.append(svgEl("text", {class: "louvain-widget__edge-label", x: a.x, y: a.y - 51}, `×${edge.count}`));
          } else {
            const count = Math.min(edge.count, 3), dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
            for (let j = 0; j < count; j++) {
              const offset = (j - (count - 1) / 2) * 18;
              const x = (a.x + b.x) / 2 - dy / length * offset;
              const y = (a.y + b.y) / 2 + dx / length * offset;
              svg.append(svgEl("path", {class: cls, d: `M${a.x},${a.y} Q${x},${y} ${b.x},${b.y}`}));
            }
            if (edge.count > 3) svg.append(svgEl("text", {class: "louvain-widget__edge-label", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 7}, `×${edge.count}`));
          }
        });
        graph.nodes.forEach(n => {
          const represented = representatives.get(n.id);
          const isActive = n.members.some(i => activeSet.has(i));
          const c = assignment.get(n.id);
          const node = svgEl("g", {class: `louvain-widget__node${isActive ? " is-active" : ""}`,
            transform: `translate(${n.x} ${n.y})`, tabindex: "0", role: "button",
            "data-members": represented.members.join(","),
            "aria-label": `Wierzchołek ${n.label}, grupa ${groupName(c)}; reprezentuje ${memberText(represented.members)}; stopień ${n.k}, pętle ${n.loops}`});
          node.append(svgEl("title", {}, `${n.label} ↔ ${memberText(represented.members)}; ${groupName(c)}; k = ${n.k}; pętle: ${n.loops}`));
          if (c === bestTarget && !isActive) node.append(svgEl("circle", {r: 22, class: "louvain-widget__target-ring"}));
          node.append(svgEl("circle", {r: 16, fill: color(c), class: "louvain-widget__body"}));
          node.append(svgEl("text", {y: .5}, n.label));
          connect(node, represented);
          svg.append(node);
        });
      }

      function renderMapping(level, partition) {
        const members = get("members"), groups = get("groups");
        members.replaceChildren(); groups.replaceChildren();
        level.nodes.forEach((n, j) => {
          const b = el("button", {type: "button"}, `${n.label} ↔ ${memberText(n.members)}`);
          b.prepend(swatch(partition[j]));
          connect(b, n);
          members.append(b);
        });
        const grouped = new Map();
        level.nodes.forEach((n, j) => {
          const c = partition[j];
          if (!grouped.has(c)) grouped.set(c, []);
          grouped.get(c).push(...n.members);
        });
        [...grouped].sort(([a], [b]) => a - b).forEach(([c, ids]) => {
          const chip = el("span", {class: "louvain-widget__group-chip"});
          chip.append(swatch(c), `${groupName(c)} = ${memberText(ids.sort((a, b) => a - b))}`);
          groups.append(chip);
        });
      }

      function aggregationList(step) {
        const list = el("div", {class: "louvain-widget__aggregation"});
        const newLevel = data.levels[step.kind === "phase_end" ? step.level + 1 : step.level];
        newLevel.nodes.forEach(n => {
          const from = el("span", {}, groupName(n.from_group));
          from.prepend(swatch(n.from_group));
          list.append(from, el("strong", {}, `→ ${n.label}`), el("span", {}, memberText(n.members)));
        });
        return list;
      }

      function renderDetails(step, level) {
        const candidates = get("candidates"), calculation = get("calculation");
        candidates.replaceChildren(); calculation.replaceChildren();
        get("candidates-title").textContent = "Możliwe ruchy";
        get("calculation-title").textContent = "Obliczenie ΔQ";
        if (step.kind !== "consider" && step.kind !== "move") {
          if (step.kind === "phase_end" || step.kind === "aggregate") {
            get("candidates-title").textContent = step.kind === "phase_end" ? "Każda grupa stanie się wierzchołkiem" : "Wynik agregacji";
            candidates.append(aggregationList(step));
            get("calculation-title").textContent = "Modularność po agregacji";
            calculation.append(paragraph(`Q pozostaje równe ${exact(step.q)} ≈ ${decimal(step.q)}. Każda krawędź wewnętrzna staje się pętlą, a krawędzie między grupami zostają zachowane.`));
            calculation.append(paragraph("Kolory grafu wyjściowego pozostają te same. Zmienia się liczba wierzchołków, na których wykonujemy dalsze ruchy.", "louvain-widget__note"));
          } else if (step.kind === "done") {
            candidates.append(paragraph("Cały przegląd na tym poziomie zakończył się bez ruchu. Żadna z rozważanych zmian nie zwiększa modularności."));
            get("calculation-title").textContent = "Podział grafu wyjściowego";
            calculation.append(paragraph("Każdą końcową grupę odczytujemy jako sumę zbiorów reprezentowanych przez jej bieżące wierzchołki. Zbiory i kolory są pokazane poniżej oraz na grafie wyjściowym."));
            calculation.append(paragraph(`Końcowa modularność: Q = ${exact(step.q)} ≈ ${decimal(step.q)}.`, "louvain-widget__result"));
          } else if (step.kind === "sweep_end") {
            candidates.append(paragraph(`Liczba ruchów w tym przeglądzie: ${step.moves}. Ponownie sprawdzimy wszystkie wierzchołki, zaczynając od pierwszego.`));
            calculation.append(paragraph("Przynależności grup zmieniały się po każdym ruchu. Dlatego w następnym przeglądzie wcześniej sprawdzony wierzchołek może mieć już inne możliwości."));
          } else {
            candidates.append(paragraph("Na początku każdy wierzchołek ma swoją grupę. Przycisk „Następny krok” pokazuje oceny ruchów pierwszego wierzchołka."));
            calculation.append(paragraph("Dla każdego wierzchołka sprawdzamy inne grupy jego sąsiadów. Wykonujemy najlepszy ruch, jeśli jego ΔQ jest dodatnie. Pozostanie w obecnej grupie daje zmianę 0."));
            calculation.append(paragraph("Przy remisie wybieramy grupę o mniejszym numerze. Pętle wnoszą po 2 do stopnia wierzchołka; pomijamy je w liczbach krawędzi używanych do oceny ruchu.", "louvain-widget__note"));
          }
          return;
        }
        const best = step.options[0];
        const node = level.nodes.find(n => n.id === step.vertex);
        get("candidates-title").textContent = `Wierzchołek ${node.label}: ${step.kind === "move" ? "oceny przed ruchem" : "oceny ruchów"}`;
        const table = el("table");
        const head = el("thead"), headRow = el("tr");
        [["Grupa docelowa"], ["k", "i,b"], ["K", "b"], ["ΔQ"]].forEach(([text, subscript]) => {
          const cell = el("th", {scope: "col"});
          if (subscript) cell.append(el("var", {}, text), el("sub", {}, subscript));
          else cell.textContent = text;
          headRow.append(cell);
        });
        head.append(headRow); table.append(head);
        const body = el("tbody");
        step.options.forEach((option, j) => {
          const row = el("tr", {class: j === 0 ? (step.source !== step.target ? "is-best" : "is-trial") : ""});
          const name = el("span", {}, groupName(option.target)); name.prepend(swatch(option.target));
          const targetCell = el("td"); targetCell.append(name);
          if (j === 0) targetCell.append(el("small", {}, step.source !== step.target ? "wybrany ruch" : "najlepsza próba"));
          const delta = el("td", {}, signed(option.delta));
          delta.append(el("small", {}, `≈ ${decimal(option.delta)}`));
          row.append(targetCell, el("td", {}, option.kib), el("td", {}, option.Kb), delta);
          body.append(row);
        });
        const stay = el("tr", {class: step.source === step.target ? "is-stay" : ""});
        stay.append(el("td", {}, `Pozostań w ${groupName(step.source)}`), el("td", {}, "—"), el("td", {}, "—"), el("td", {}, "0"));
        body.append(stay); table.append(body); candidates.append(table);
        if (!best) {
          calculation.append(paragraph("Wierzchołek nie ma sąsiadów w innych grupach. Pozostaje w swojej grupie."));
          return;
        }
        const facts = el("div", {class: "louvain-widget__facts"});
        [["m", "", data.m], ["k", "i", best.ki], ["k", "i,a", best.kia], ["k", "i,b", best.kib], ["K", "a", best.Ka], ["K", "b", best.Kb]].forEach(([symbol, subscript, number]) => {
          const fact = el("span");
          fact.append(el("var", {}, symbol));
          if (subscript) fact.append(el("sub", {}, subscript));
          fact.append(` = ${number}`);
          facts.append(fact);
        });
        calculation.append(facts);
        calculation.append(paragraph(`a = ${groupName(step.source)}, b = ${groupName(best.target)}. Wszystkie wartości dotyczą podziału przed ruchem.`, "louvain-widget__note"));
        const symbolic = `<msub><mi>k</mi><mrow><mi>i</mi><mo>,</mo><mi>b</mi></mrow></msub><mo>−</mo><msub><mi>k</mi><mrow><mi>i</mi><mo>,</mo><mi>a</mi></mrow></msub>`;
        const second = `<msub><mi>k</mi><mi>i</mi></msub><mo>·</mo><mo>(</mo><msub><mi>K</mi><mi>b</mi></msub><mo>−</mo><msub><mi>K</mi><mi>a</mi></msub><mo>+</mo><msub><mi>k</mi><mi>i</mi></msub><mo>)</mo>`;
        const numeric = `${mn(best.ki)}<mo>·</mo><mo>(</mo>${mn(best.Kb)}<mo>−</mo>${mn(best.Ka)}<mo>+</mo>${mn(best.ki)}<mo>)</mo>`;
        const equation = el("div", {class: "louvain-widget__equation"});
        equation.innerHTML = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>ΔQ</mi><mo>=</mo>${frac(symbolic, "<mi>m</mi>")}<mo>−</mo>${frac(second, "<mn>2</mn><msup><mi>m</mi><mn>2</mn></msup>")}</mrow></math>` +
          `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>ΔQ</mi><mo>=</mo>${frac(`${mn(best.kib)}<mo>−</mo>${mn(best.kia)}`, mn(data.m))}<mo>−</mo>${frac(numeric, `<mn>2</mn><mo>·</mo><msup>${mn(data.m)}<mn>2</mn></msup>`)}<mo>=</mo>${rationalMath(best.delta)}</mrow></math>`;
        calculation.append(equation);
        if (step.source !== step.target) {
          const before = step.q_before || step.q;
          calculation.append(paragraph(`${step.kind === "move" ? "Wykonano" : "Wykonamy"} ruch do ${groupName(step.target)}: Q = ${exact(before)} + (${exact(best.delta)}) = ${exact(best.q_after)}.`, "louvain-widget__result"));
        } else {
          calculation.append(paragraph("Największe ΔQ nie jest dodatnie. Wierzchołek pozostaje w swojej grupie, a Q się nie zmienia.", "louvain-widget__result"));
        }
        if (node.loops) calculation.append(paragraph(`Liczba pętli przy wierzchołku: ${node.loops}. Ich wkład do stopnia wynosi ${2 * node.loops}. Pomijamy je w liczbach krawędzi do własnej i próbowanej grupy.`, "louvain-widget__note"));
      }

      function render() {
        pinned = null;
        const step = data.steps[index], level = data.levels[step.level];
        const currentPart = new Map(level.nodes.map((n, j) => [n.id, step.partition[j]]));
        const originalPart = new Map(), representatives = new Map();
        level.nodes.forEach(n => n.members.forEach(i => {originalPart.set(i, currentPart.get(n.id)); representatives.set(i, n);}));
        drawGraph(originalSvg, data.original, originalPart, step, representatives);
        drawGraph(currentSvg, level, currentPart, step, new Map(level.nodes.map(n => [n.id, n])));
        renderMapping(level, step.partition);
        renderDetails(step, level);
        get("stage").textContent = `Poziom agregacji ${step.level} · przegląd ${step.sweep}`;
        const node = level.nodes.find(n => n.id === step.vertex);
        const titles = {start: "Każdy wierzchołek w osobnej grupie", consider: `Rozpatrujemy wierzchołek ${node?.label}`,
          move: `Wierzchołek ${node?.label} zmienił grupę`, sweep_end: "Koniec pełnego przeglądu",
          phase_end: "Brak dalszych ruchów lokalnych — czas na agregację", aggregate: `Agregacja ${step.level}: ${step.from_count} → ${step.to_count} wierzchołki`, done: "Algorytm zakończony"};
        get("title").textContent = titles[step.kind];
        const descriptions = {
          start: "Zaczynamy od grup jednoelementowych. Graf wyjściowy i bieżący są teraz identyczne.",
          consider: step.source !== step.target ? `Najlepszy ruch prowadzi z ${groupName(step.source)} do ${groupName(step.target)}. Następny krok wykona ten ruch i uaktualni oba widoki.` : `Żaden ruch wierzchołka ${node?.label} nie daje dodatniego ΔQ. Wierzchołek pozostaje w ${groupName(step.source)}.`,
          move: `Wykonano ruch z ${groupName(step.source)} do ${groupName(step.target)}. ${step.level ? `W grafie wyjściowym grupę zmieniły jednocześnie wierzchołki ${memberText(node?.members || [])}.` : "Kolory w obu grafach zostały uaktualnione."}`,
          sweep_end: "W przeglądzie były ruchy, więc zaczynamy kolejny pełny przegląd. Dopiero cały przegląd bez ruchu kończy ten etap.",
          phase_end: "W całym przeglądzie nie wykonano żadnego ruchu. Następny krok zastąpi każdą obecną grupę jednym wierzchołkiem.",
          aggregate: "Grupy stały się wierzchołkami, każdy w osobnej grupie. Modularność i podział grafu wyjściowego pozostały takie same.",
          done: "Pierwszy przegląd na tym poziomie nie dał poprawy. Odczytujemy końcowy podział wszystkich wierzchołków wyjściowych."};
        status.textContent = descriptions[step.kind];
        get("q").textContent = `${exact(step.q)} ≈ ${decimal(step.q)}`;
        get("count").textContent = new Set(step.partition).size;
        get("m").textContent = data.m;
        get("current-title").textContent = step.level ? `Graf po agregacji ${step.level}` : "Graf bieżący — przed pierwszą agregacją";
        get("current-description").textContent = step.level ? `${level.nodes.length} wierzchołki reprezentują rozłączne zbiory wierzchołków wyjściowych. Pętle liczą się dwukrotnie do stopnia.` : "Każdy wierzchołek reprezentuje jeden wierzchołek wyjściowy.";
        get("step").textContent = `Krok ${index + 1} z ${data.steps.length}`;
        slider.value = index;
        jump.value = data.milestones.some(m => m.index === index) ? String(index) : "";
        previous.disabled = index === 0;
        next.disabled = index === data.steps.length - 1;
        next.textContent = step.kind === "consider" && step.source !== step.target ? "Wykonaj ruch →" : step.kind === "phase_end" ? "Agreguj graf →" : "Następny krok →";
        if (index === data.steps.length - 1) stop();
        play.disabled = index === data.steps.length - 1;
        root.dataset.step = index;
        root.dataset.level = step.level;
        root.dataset.kind = step.kind;
        linked(null);
      }
      function move(to) { index = Math.max(0, Math.min(data.steps.length - 1, to)); render(); }
      previous.addEventListener("click", () => {stop(); move(index - 1);});
      next.addEventListener("click", () => {stop(); move(index + 1);});
      button("reset").addEventListener("click", () => {stop(); move(0);});
      slider.addEventListener("input", () => {stop(); move(Number(slider.value));});
      jump.addEventListener("change", () => {if (jump.value !== "") {stop(); move(Number(jump.value));}});
      play.addEventListener("click", () => {
        if (timer !== null) {stop(); return;}
        play.textContent = "Zatrzymaj"; play.setAttribute("aria-pressed", "true");
        timer = setInterval(() => move(index + 1), 2400);
      });
      document.addEventListener("visibilitychange", () => {if (document.hidden) stop();});
      root.addEventListener("keydown", event => {
        if (event.target.matches("input, select") || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault(); stop(); move(index + (event.key === "ArrowRight" ? 1 : -1));
          if (event.target.classList.contains("louvain-widget__node")) root.focus({preventScroll: true});
        }
      });
      const fullscreen = button("fullscreen");
      fullscreen.hidden = !root.requestFullscreen;
      fullscreen.addEventListener("click", async () => {
        try {
          if (document.fullscreenElement === root) await document.exitFullscreen();
          else await root.requestFullscreen();
        } catch (_) {status.textContent = "Przeglądarka nie pozwoliła włączyć pełnego ekranu.";}
      });
      document.addEventListener("fullscreenchange", () => {
        fullscreen.textContent = document.fullscreenElement === root ? "⛶ Pomniejsz" : "⛶ Powiększ";
      });
      slider.disabled = false; jump.disabled = false; button("reset").disabled = false;
      root.setAttribute("aria-busy", "false");
      render();
    } catch (error) {
      root.setAttribute("aria-busy", "false");
      status.textContent = "Nie udało się wczytać przykładu Louvain. Odśwież stronę; opis algorytmu i wzór na ΔQ znajdują się powyżej.";
      console.error("Nie udało się wczytać widgetu Louvain:", error);
    }
  }
  document.querySelectorAll("[data-louvain-widget]").forEach(initialize);
})();
