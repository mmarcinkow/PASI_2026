"""Pobieranie danych i rysunki do notatnika „Sieć WWW, centralność i PageRank”.

Obliczenia matematyczne pozostają w notatniku. Funkcje rysujące nie zmieniają
grafu; dla dużej sieci wybierają jedynie mały fragment do wyświetlenia.
Wymagane biblioteki: NetworkX, NumPy (używane przez układ grafu), Matplotlib.
"""

from collections import Counter, deque
import gzip
from itertools import chain

from pathlib import Path
import random
import shutil
import tempfile
from urllib.error import URLError
from urllib.request import urlopen
import zipfile

import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import networkx as nx


ZRODLA = {
    "www_maly": "https://websites.umich.edu/~mejn/netdata/polblogs.zip",
    "www_duzy": "https://snap.stanford.edu/data/web-NotreDame.txt.gz",
}


def _pobierz(url, katalog):
    """Pobierz raz; nie uznawaj przerwanego pobierania za gotowy plik."""
    katalog.mkdir(parents=True, exist_ok=True)
    plik = katalog / url.rsplit("/", 1)[-1]
    if plik.exists():
        return plik

    print(f"Pobieranie danych: {url}")
    tymczasowy = None
    try:
        # Plik tymczasowy leży obok docelowego, więc końcowe przeniesienie
        # jest atomowe. Archiwów nie rozpakowujemy do systemu plików.
        with tempfile.NamedTemporaryFile(dir=katalog, delete=False) as f:
            tymczasowy = Path(f.name)
            with urlopen(url, timeout=60) as odpowiedz:
                shutil.copyfileobj(odpowiedz, f)
        tymczasowy.replace(plik)
    except (OSError, URLError) as blad:
        raise RuntimeError(
            "Nie udało się pobrać danych WWW. Sprawdź połączenie lub wybierz "
            "'karate' albo 'florencja': te grafy nie wymagają internetu."
        ) from blad
    finally:
        if tymczasowy is not None:
            tymczasowy.unlink(missing_ok=True)
    return plik


def wczytaj_graf(nazwa, katalog_danych=None):
    """Zwróć Graph/DiGraph: www_maly, www_duzy, karate lub florencja.

    Tylko wybrany zbiór WWW jest pobierany, domyślnie do folderu „dane”
    obok tego modułu. Kolejne wywołania korzystają z lokalnego archiwum.
    Powtarzające się odsyłacze między tą samą parą stron liczymy jako jedną
    krawędź. Pętle zachowujemy. W notatniku pomijamy wagi krawędzi.
    """
    if nazwa == "karate":
        return nx.karate_club_graph()
    if nazwa == "florencja":
        return nx.florentine_families_graph()
    if nazwa not in ZRODLA:
        raise ValueError("Wybierz: www_maly, www_duzy, karate lub florencja.")

    katalog = Path(katalog_danych) if katalog_danych else Path(__file__).parent / "dane"
    plik = _pobierz(ZRODLA[nazwa], katalog)
    if nazwa == "www_maly":
        with zipfile.ZipFile(plik) as archiwum:
            tekst = archiwum.read("polblogs.gml").decode("ascii")
        # Oryginał ma 65 powtórzonych odsyłaczy, ale nie deklaruje multigrafu.
        # Uzupełniamy deklarację w pamięci, aby parser przyjął te powtórzenia.
        tekst = tekst.replace("graph [", "graph [\n  multigraph 1", 1)
        multigraf = nx.parse_gml(tekst.splitlines(), label=None)
        # Zachowujemy liczbowe identyfikatory. Adres blogu jest w G.nodes[v]['label'].
        return nx.DiGraph(multigraf)

    # Czytamy strumieniowo: nie tworzymy dodatkowej listy 1,5 mln krawędzi.
    with gzip.open(plik, "rt", encoding="ascii") as f:
        return nx.read_edgelist(f, create_using=nx.DiGraph, nodetype=int, data=False)


def _fragment(G, start="max_stopień", limit=40):
    """Zwróć fragment BFS i jego start, pomijając kierunek przy wyborze.

    Sam rysunek zachowuje wszystkie oryginalne kierunki i krawędzie pomiędzy
    wybranymi wierzchołkami. Jest to dobór ilustracyjny, NIE losowa próba
    reprezentatywna do wnioskowania o całej sieci.
    """
    if not 1 <= limit <= 100:
        raise ValueError("Limit rysunku musi być liczbą od 1 do 100.")
    if not G:
        return G.copy(), None
    if start == "max_stopień":
        start = max(G, key=G.degree)
    elif start == "losowy":
        start = random.choice(list(G))
    if start not in G:
        raise ValueError(
            f"Nie ma wierzchołka {start!r} w grafie. "
            "Podaj start='max_stopień', start='losowy' albo identyfikator z G.nodes."
        )
    if len(G) <= limit:
        return G.copy(), start

    wybrane = {start}
    kolejka = deque([start])
    while kolejka and len(wybrane) < limit:
        v = kolejka.popleft()
        # Sąsiedztwo słabe pozwala pokazać także krawędzie wchodzące do v.
        sasiedzi = chain(G.successors(v), G.predecessors(v)) if G.is_directed() else G[v]
        for w in sasiedzi:
            if w not in wybrane:
                wybrane.add(w)
                kolejka.append(w)
                if len(wybrane) == limit:
                    break
    return G.subgraph(wybrane).copy(), start


def rysuj_graf(G, *, start="max_stopień", max_wierzcholkow=40, grupy=None,
               wartosci=None, tytul="Graf", ax=None):
    """Narysuj graf lub jego fragment; zwróć Axes z Matplotlib.

    start: "max_stopień" (domyślnie) wybiera wierzchołek o największym stopniu
    (dla grafu skierowanego: wejściowym + wyjściowym); "losowy" losuje
    równomiernie spośród wszystkich wierzchołków. Można też podać konkretny
    identyfikator z G.nodes, np. start=175.
    Wybrany wierzchołek startowy podajemy w tytule rysunku.
    Graf o najwyżej max_wierzcholkow wierzchołkach rysujemy w całości.
    grupy: opcjonalny słownik wierzchołek -> nazwa grupy (kolory + legenda).
    wartosci: opcjonalny słownik wierzchołek -> liczba (kolor + wielkość).
    Wartości, np. centralności, należy obliczyć PRZED wybraniem fragmentu.
    Te dwa sposoby kolorowania są rozłączne. seed stabilizuje układ rysunku.
    """
    if grupy is not None and wartosci is not None:
        raise ValueError("Podaj grupy albo wartości, nie oba naraz.")
    if ax is None:
        _, ax = plt.subplots(figsize=(9, 5.5), layout="constrained")
    H, wybrany_start = _fragment(G, start=start, limit=max_wierzcholkow)
    if not H:
        ax.set_title("Graf pusty")
        ax.set_axis_off()
        return ax
    # Układ obliczamy na kopii nieskierowanej. Pomocnicze wagi osłabiają
    # przyciąganie przy dużych stopniach, aby gęsty środek nie był ściśnięty.
    # Nie zmienia to krawędzi rysunku ani wag używanych w obliczeniach.
    uklad = nx.Graph(H)
    for u, v in uklad.edges:
        uklad[u][v]["layout_weight"] = 1 / (uklad.degree(u) * uklad.degree(v)) ** 0.5
    pozycje = nx.spring_layout(uklad, seed=7, iterations=150, weight="layout_weight")
    kolory, rozmiary = "#8bc9df", 220
    if grupy is not None:
        nazwy = list(dict.fromkeys(grupy[v] for v in H))
        paleta = ["#3274a1", "#29a79b", "#9662ae", "#df8b61", "#b8bdc5"]
        mapa = {nazwa: paleta[i % len(paleta)] for i, nazwa in enumerate(nazwy)}
        if "Pozostałe SCC" in mapa:
            mapa["Pozostałe SCC"] = "#b8bdc5"
        kolory = [mapa[grupy[v]] for v in H]
        ax.legend(handles=[Patch(color=mapa[n], label=n) for n in nazwy],
                  loc="upper left", fontsize=8, framealpha=0.9)
    if wartosci is not None:
        kolory = [wartosci[v] for v in H]
        maksimum = max(wartosci.values(), default=0) or 1
        rozmiary = [100 + 750 * wartosci[v] / maksimum for v in H]

    # Na dużej sieci podpisujemy tylko identyfikatory małego fragmentu.
    # Rodziny mają dłuższe nazwy, więc podpisy umieszczamy ponad węzłami.
    opcje_strzalek = {"arrowsize": 9, "connectionstyle": "arc3,rad=0.06"} if H.is_directed() else {}
    nx.draw_networkx_edges(H, pozycje, ax=ax, node_size=rozmiary,
                           edge_color="#929eab", alpha=0.45, width=0.8,
                           arrows=H.is_directed(), **opcje_strzalek)
    wezly = nx.draw_networkx_nodes(H, pozycje, ax=ax, node_color=kolory,
                                   node_size=rozmiary, edgecolors="white",
                                   linewidths=0.7, cmap="Blues" if wartosci is not None else None)
    etykiety = {v: (x, y + 0.075) for v, (x, y) in pozycje.items()}
    nx.draw_networkx_labels(H, etykiety, ax=ax, font_size=8,
                           bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.65, "pad": 0.3})
    if wartosci is not None:
        ax.figure.colorbar(wezly, ax=ax, shrink=0.65, label="Centralność w badanej składowej")
    if len(H) < len(G):
        tytul += f" — fragment: {len(H)} z {len(G):,} wierzchołków"
    tytul += f"\nWierzchołek startowy: {wybrany_start}"
    ax.set_title(tytul)
    ax.margins(0.18)
    ax.set_axis_off()
    return ax


def rysuj_stopnie(D):
    """Dwa rozkłady empiryczne; bez dopasowania prawa potęgowego."""
    fig, osie = plt.subplots(1, 2, figsize=(9, 3), layout="constrained")
    for ax, stopnie, nazwa in zip(osie, (D.in_degree, D.out_degree),
                                  ("Stopień wejściowy", "Stopień wyjściowy")):
        liczby = Counter(d for _, d in stopnie)
        dodatnie = sorted(k for k in liczby if k > 0)
        ax.scatter(dodatnie, [liczby[k] / len(D) for k in dodatnie], s=18, color="#3274a1")
        if dodatnie:
            ax.set_xscale("log")
            ax.set_yscale("log")
        ax.set(xlabel="Stopień k", ylabel="Udział wierzchołków", title=nazwa)
        ax.text(0.98, 0.94, f"Stopień 0: {liczby[0]}", transform=ax.transAxes,
                ha="right", va="top", fontsize=9)
        ax.grid(alpha=0.2)
    return fig


def rysuj_scc(D, skladowe):
    """Pokaż rozmiary dziesięciu największych SCC i kolory fragmentu."""
    fig, osie = plt.subplots(1, 2, figsize=(11, 4.5), layout="constrained")
    rozmiary = [len(C) for C in skladowe[:10]]
    osie[0].bar(range(1, len(rozmiary) + 1), rozmiary, color="#3274a1")
    osie[0].set(xlabel="Numer składowej (od największej)", ylabel="Liczba wierzchołków",
                title=f"Silnie spójne składowe: {len(skladowe):,}")
    if rozmiary and max(rozmiary) > 100 * min(rozmiary):
        osie[0].set_yscale("log")
        osie[0].set_ylabel("Liczba wierzchołków (skala logarytmiczna)")
    # Cztery największe SCC wyróżniamy, reszta ma wspólny, szary kolor.
    grupy = {v: f"SCC {i + 1}" if i < 4 else "Pozostałe SCC"
             for i, C in enumerate(skladowe) for v in C}
    rysuj_graf(D, grupy=grupy, tytul="Podział na SCC", ax=osie[1])
    return fig


def rysuj_zasiegi(D, v, IN, OUT):
    """IN i OUT zawierają v. Na rysunku rozdzielamy ich przecięcie i różnice."""
    C = IN & OUT
    grupy = {
        w: "SCC(v)" if w in C else "Tylko IN" if w in IN else
        "Tylko OUT" if w in OUT else "Poza IN i OUT"
        for w in D
    }
    return rysuj_graf(D, start=v, grupy=grupy, tytul=f"Osiągalność względem {v}")


def rysuj_porownanie(G, miary, *, tytul="Porównanie miar ważności"):
    """Pokaż mały graf i wspólny wykres słupkowy obliczonych już miar.

    G: niepusty graf o najwyżej 20 wierzchołkach.
    miary: słownik nazwa -> słownik wierzchołek -> wartość.
    Każda miara powinna mieć sumę wartości równą 1 (normalizujemy ją
    w notatniku). Funkcja wyłącznie rysuje: nie oblicza ani nie zmienia miar.
    Wierzchołki na osi są w kolejności list(G), wspólnej dla wszystkich miar.
    """
    if not 1 <= len(G) <= 20:
        raise ValueError("Porównanie wymaga od 1 do 20 wierzchołków.")
    if not miary or any(set(wartosci) != set(G) for wartosci in miary.values()):
        raise ValueError("Każda miara musi zawierać dokładnie wierzchołki grafu.")

    fig, osie = plt.subplots(1, 2, figsize=(10, 3.8), layout="constrained",
                            gridspec_kw={"width_ratios": [1, 1.5]})
    rysuj_graf(G, tytul=tytul, ax=osie[0])
    wierzcholki = list(G)
    szerokosc = 0.8 / len(miary)
    paleta = ["#3274a1", "#29a79b", "#9662ae", "#df8b61"]
    for j, (nazwa, wartosci) in enumerate(miary.items()):
        przesuniecie = (j - (len(miary) - 1) / 2) * szerokosc
        osie[1].bar([i + przesuniecie for i in range(len(G))],
                    [wartosci[v] for v in wierzcholki], width=szerokosc,
                    label=nazwa, color=paleta[j % len(paleta)])
    osie[1].set_xticks(range(len(G)), [str(v) for v in wierzcholki])
    osie[1].set(xlabel="Wierzchołek", ylabel="Wartość (suma = 1)")
    osie[1].set_axisbelow(True)
    osie[1].grid(axis="y", alpha=0.2)
    osie[1].legend(fontsize=9, frameon=False)
    return fig
