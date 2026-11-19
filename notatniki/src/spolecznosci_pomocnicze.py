"""Dane i rysunki do notatnika „Rdzenie i społeczności”.

Obliczenia projekcji, rdzeni i społeczności pozostają w notatniku. Tutaj chowamy
obsługę archiwum i szczegóły rysowania. Surowe dane retweetów pochodzą
od Conovera i współautorów (2011), https://zenodo.org/records/4589065;
archiwum ma osobny plik licencji CC BY-NC-ND 4.0.
"""

from collections import Counter
import gzip
from pathlib import Path
import shutil
import tempfile
from urllib.request import urlopen
import zipfile

import matplotlib.pyplot as plt
from matplotlib.patches import Patch
import networkx as nx
import numpy as np


RETWEETY_URL = "https://zenodo.org/records/4589065/files/icwsm_polarization.zip"
SZKOLA_URL = "https://sociopatterns.org/assets/data/"
PALETA = ["#477fc6", "#168c88", "#9662ae", "#ca7960"]

# Ręcznie wybrany, mały zbiór metadanych, nie pełna bibliografia autorów.
# Identyfikatory, tytuły i pełne listy autorów sprawdzono w arXiv.
ARTYKULY = [
    ("p1", "0803.0476", "Fast unfolding of communities in large networks",
     ["V. D. Blondel", "J.-L. Guillaume", "R. Lambiotte", "E. Lefebvre"]),
    ("p2", "0812.1770", "Laplacian Dynamics and Multiscale Modular Structure in Networks",
     ["R. Lambiotte", "J.-C. Delvenne", "M. Barahona"]),
    ("p3", "0812.1811", "Stability of graph communities across time scales",
     ["J.-C. Delvenne", "S. N. Yaliraki", "M. Barahona"]),
    ("p4", "1308.1605", "The stability of a graph partition: A dynamics-based framework for community detection",
     ["J.-C. Delvenne", "M. T. Schaub", "S. N. Yaliraki", "M. Barahona"]),
]


def graf_autorow():
    """Zwróć graf dwudzielny oraz ustalone kolejności autorów i artykułów."""
    B = nx.Graph()
    autorzy = list(dict.fromkeys(a for _, _, _, lista in ARTYKULY for a in lista))
    prace = [p for p, *_ in ARTYKULY]
    B.add_nodes_from(autorzy, bipartite=0)
    for p, arxiv, tytul, lista in ARTYKULY:
        B.add_node(p, bipartite=1, title=tytul, url=f"https://arxiv.org/abs/{arxiv}")
        B.add_edges_from((a, p) for a in lista)
    return B, autorzy, prace


def pobierz_retweety(katalog=None):
    """Pobierz oryginalny ZIP raz; kolejne wywołania korzystają z kopii lokalnej.

    Nie otwieramy plików pickle z archiwum i nie rozpakowujemy go na dysk.
    Nieudane pobranie nie pozostawia pliku udającego kompletne archiwum.
    """
    folder = Path(katalog) if katalog is not None else Path(__file__).parent / "dane"
    folder.mkdir(parents=True, exist_ok=True)
    cel = folder / "icwsm_polarization.zip"
    if cel.exists():
        return cel
    tymczasowy = None
    try:
        print("Pobieranie oryginalnego archiwum retweetów (około 11,5 MB)…")
        with tempfile.NamedTemporaryFile(dir=folder, delete=False) as f:
            tymczasowy = Path(f.name)
            with urlopen(RETWEETY_URL, timeout=60) as odpowiedz:
                shutil.copyfileobj(odpowiedz, f)
        with zipfile.ZipFile(tymczasowy) as z:
            if not {"retweet.nodes", "retweet.edgelist"} <= set(z.namelist()):
                raise ValueError("Archiwum nie zawiera danych retweetów.")
        tymczasowy.replace(cel)
    except (OSError, ValueError, zipfile.BadZipFile) as blad:
        raise RuntimeError(
            "Nie udało się pobrać danych o retweetach. "
            "Pobierz icwsm_polarization.zip ze strony https://zenodo.org/records/4589065 "
            f"i zapisz go w katalogu {folder}."
        ) from blad
    finally:
        if tymczasowy is not None:
            tymczasowy.unlink(missing_ok=True)
    return cel


def wczytaj_retweety(katalog=None):
    """Prosty graf nieskierowany: pomijamy kierunki, powtórzenia i pętle.

    W retweet.edgelist dwie pierwsze kolumny identyfikują końce interakcji.
    Pozostałe kolumny NIE są wagą: zawierają typ i metadane tweetu.
    retweet.nodes zachowuje wszystkie wierzchołki i etykiety left/right
    z oryginalnych danych. Etykiety nie uczestniczą w obliczaniu rdzeni.
    """
    G = nx.Graph()
    with zipfile.ZipFile(pobierz_retweety(katalog)) as z:
        for linia in z.read("retweet.nodes").decode("utf-8").splitlines():
            v, grupa = linia.split()
            G.add_node(int(v), grupa=grupa)
        for linia in z.read("retweet.edgelist").decode("utf-8").splitlines():
            u, v, *_ = linia.split()
            u, v = int(u), int(v)
            if u != v:
                G.add_edge(u, v)
    G.graph["source"] = "https://zenodo.org/records/4589065"
    return G


def pobierz_kontakty_szkolne(katalog=None):
    """Zachowaj oryginalne pliki SocioPatterns, pobierając tylko brakujące.

    Źródło: https://sociopatterns.org/datasets/primary-school-temporal-network-data/
    Dane: CC BY-NC-SA 3.0; Stehlé et al. (2011), Gemmetto et al. (2014).
    Nieudane pobranie nie pozostawia niekompletnego pliku docelowego.
    """
    folder = Path(katalog) if katalog is not None else Path(__file__).parent / "dane"
    folder.mkdir(parents=True, exist_ok=True)
    pliki = [folder / "primaryschool.csv.gz", folder / "primaryschool_metadata.txt"]
    for cel in pliki:
        if cel.exists():
            continue
        tymczasowy = None
        try:
            print(f"Pobieranie {cel.name} z SocioPatterns…")
            with tempfile.NamedTemporaryFile(dir=folder, delete=False) as f:
                tymczasowy = Path(f.name)
                with urlopen(SZKOLA_URL + cel.name, timeout=60) as odpowiedz:
                    shutil.copyfileobj(odpowiedz, f)
            tymczasowy.replace(cel)
        except OSError as blad:
            raise RuntimeError(
                f"Nie udało się pobrać {cel.name}. Pobierz brakujące pliki ze strony "
                "https://sociopatterns.org/datasets/primary-school-temporal-network-data/ "
                f"i zapisz je w katalogu {folder}."
            ) from blad
        finally:
            if tymczasowy is not None:
                tymczasowy.unlink(missing_ok=True)
    return pliki


def wczytaj_kontakty_szkolne(katalog=None, *, dzien=0, min_czas=120, wazony=True):
    """Wczytaj graf kontaktów z pierwszego (0) lub drugiego (1) dnia.

    Każdy rekord oznacza aktywny kontakt w przedziale [t-20, t]. Sumujemy
    po 20 sekund dla nieuporządkowanej pary i stosujemy próg do sumy.
    Przy wazony=True zapisujemy łączny czas jako wagę, a przy wazony=False
    tworzymy krawędzie bez wag. Zachowujemy wszystkie osoby z metadanych,
    także izolaty i nauczycieli.
    """
    if dzien not in (0, 1):
        raise ValueError("Dzień musi być równy 0 (pierwszy) lub 1 (drugi).")
    if not np.isfinite(min_czas) or min_czas < 0:
        raise ValueError("Minimalny czas kontaktu musi być skończony i nieujemny.")
    kontakty, metadane = pobierz_kontakty_szkolne(katalog)
    G = nx.Graph()
    for linia in metadane.read_text(encoding="utf-8").splitlines():
        v, klasa, _ = linia.split()
        G.add_node(int(v), klasa=klasa)
    czasy_kontaktow = Counter()
    with gzip.open(kontakty, "rt", encoding="utf-8") as f:
        for linia in f:
            t, u, v, *_ = linia.split()
            if not dzien * 86400 <= int(t) < (dzien + 1) * 86400:
                continue
            u, v = int(u), int(v)
            if u not in G or v not in G:
                raise ValueError("W pliku kontaktów jest osoba bez metadanych.")
            if u != v:
                para = (min(u, v), max(u, v))
                czasy_kontaktow[para] += 20
    krawedzie = ((u, v, czas) for (u, v), czas in czasy_kontaktow.items() if czas >= min_czas)
    if wazony:
        G.add_weighted_edges_from(krawedzie)
    else:
        G.add_edges_from((u, v) for u, v, _ in krawedzie)
    G.graph.update(source="https://sociopatterns.org/datasets/primary-school-temporal-network-data/",
                   dzien=dzien, min_czas=min_czas)
    return G


def rysuj_klasy_i_spolecznosci(G, spolecznosci):
    """Dwa kolorowania przy identycznych pozycjach wyznaczonych bez klas.

    Przeskalowane wagi, jeśli są dostępne, służą tylko rozmieszczeniu.
    Nauczyciele są kwadratami, a izolaty stoją w osobnym rzędzie.
    """
    klasy = sorted({G.nodes[v]["klasa"] for v in G} - {"Teachers"})
    kolory_klas = dict(zip(klasy, plt.get_cmap("tab10").colors))
    kolory_klas["Teachers"] = "#777777"
    kolory_grup = [plt.get_cmap("tab20")(i % 20) for i in range(len(spolecznosci))]
    nr = {v: i for i, grupa in enumerate(spolecznosci) for v in grupa}
    izolaty = sorted(nx.isolates(G))
    H = G.subgraph(set(G) - set(izolaty)).copy()
    for _, _, dane in H.edges(data=True):
        if "weight" in dane:
            dane["layout_weight"] = np.log1p(dane["weight"] / 20)
    pos = nx.spring_layout(H, seed=17, weight="layout_weight", iterations=300)
    pos.update({v: (x, -1.3) for v, x in
                zip(izolaty, np.linspace(-.8, .8, len(izolaty)))})
    uczniowie = [v for v in G if G.nodes[v]["klasa"] != "Teachers"]
    nauczyciele = [v for v in G if G.nodes[v]["klasa"] == "Teachers"]
    fig, axes = plt.subplots(1, 2, figsize=(13, 6), layout="constrained")
    for ax, wynik in zip(axes, (False, True)):
        kolor = {v: kolory_grup[nr[v]] if wynik else kolory_klas[G.nodes[v]["klasa"]]
                 for v in G}
        nx.draw_networkx_edges(G, pos, ax=ax, edge_color="#aeb9c3", width=.35, alpha=.55)
        for osoby, ksztalt, rozmiar in [(uczniowie, "o", 25), (nauczyciele, "s", 50)]:
            nx.draw_networkx_nodes(G, pos, ax=ax, nodelist=osoby,
                                   node_color=[kolor[v] for v in osoby],
                                   node_shape=ksztalt, node_size=rozmiar,
                                   edgecolors="white", linewidths=.3)
        ax.set_axis_off()
        ax.set_title("Rzeczywiste klasy" if not wynik else "Społeczności Louvain")
        if izolaty:
            ax.text(0, -1.43, "Izolowane po zastosowaniu progu", ha="center", fontsize=9)
            ax.set_ylim(bottom=-1.52)
    legenda_klas = [Patch(color=kolory_klas[c], label=c) for c in klasy]
    if nauczyciele:
        legenda_klas.append(Patch(color=kolory_klas["Teachers"], label="nauczyciele (□)"))
    axes[0].legend(handles=legenda_klas,
                   loc="upper center", bbox_to_anchor=(.5, 0), ncol=4, fontsize=8)
    axes[1].legend(handles=[Patch(color=kolory_grup[i], label=f"S{i+1}")
                           for i in range(len(spolecznosci))],
                   loc="upper center", bbox_to_anchor=(.5, 0), ncol=5, fontsize=8)
    return fig


def rysuj_tabele_klas(tablica, klasy):
    """Liczby uczniów z każdej klasy w wykrytych społecznościach."""
    fig, ax = plt.subplots(figsize=(11, 5), layout="constrained")
    obraz = ax.imshow(tablica, cmap="Blues", aspect="auto", vmin=0)
    ax.set_xticks(range(tablica.shape[1]), [f"S{i+1}" for i in range(tablica.shape[1])])
    ax.set_yticks(range(len(klasy)), klasy)
    ax.set(xlabel="Społeczność Louvain", ylabel="Rzeczywista klasa",
           title="Klasa × społeczność — tylko uczniowie")
    polowa_maksimum = tablica.max(initial=0) / 2
    for (i, j), n in np.ndenumerate(tablica):
        if n:
            ax.text(j, i, str(n), ha="center", va="center",
                    color="white" if n > polowa_maksimum else "#263341")
    fig.colorbar(obraz, ax=ax, label="Liczba uczniów")
    return fig


def rysuj_graf_dwudzielny(B, autorzy, prace, ax=None):
    """Narysuj autorów i artykuły w dwóch kolumnach."""
    if ax is None:
        _, ax = plt.subplots(figsize=(7, 5), layout="constrained")
    pos = {a: (0, y) for a, y in zip(autorzy, np.linspace(1, 0, len(autorzy)))}
    pos.update({p: (1, y) for p, y in zip(prace, np.linspace(.9, .1, len(prace)))})
    nx.draw_networkx_edges(B, pos, ax=ax, edge_color="#a7b2be", width=1)
    nx.draw_networkx_nodes(B, pos, nodelist=autorzy, ax=ax, node_color=PALETA[0], node_size=80)
    nx.draw_networkx_nodes(B, pos, nodelist=prace, ax=ax, node_color=PALETA[1], node_shape="s", node_size=150)
    for a in autorzy:
        ax.text(-.04, pos[a][1], a, ha="right", va="center", fontsize=9)
    for p in prace:
        ax.text(1.04, pos[p][1], p, ha="left", va="center", fontsize=10)
    ax.set(xlim=(-.6, 1.2), ylim=(-.12, 1.12), title="Autorzy i artykuły")
    ax.set_axis_off()
    return ax.figure


def rysuj_projekcje(B, autorzy, prace, P, spolecznosci=None):
    """Graf dwudzielny i pełna ważona projekcja, bez zmieniania danych."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout="constrained")
    rysuj_graf_dwudzielny(B, autorzy, prace, ax=axes[0])
    pozycje = nx.spring_layout(P, seed=13, weight="weight", iterations=150)
    grupy = {v: i for i, grupa in enumerate(spolecznosci or [set(P)]) for v in grupa}
    nx.draw_networkx(P, pozycje, ax=axes[1], with_labels=False,
                     node_color=[PALETA[grupy[v] % len(PALETA)] for v in P],
                     node_size=150, edge_color="#b3bdc7",
                     width=[P[u][v]["weight"] for u, v in P.edges])
    nx.draw_networkx_edge_labels(P, pozycje, ax=axes[1],
                                edge_labels=nx.get_edge_attributes(P, "weight"), font_size=9)
    for a, (x, y) in pozycje.items():
        axes[1].annotate(a, (x, y), xytext=(0, 10), textcoords="offset points",
                         ha="center", fontsize=8,
                         bbox=dict(facecolor="white", edgecolor="none", alpha=.8, pad=1))
    axes[1].set_title("Projekcja na autorów — liczby wspólnych prac")
    axes[1].margins(.25)
    axes[1].set_axis_off()
    return fig


def rysuj_rdzen(G, H, *, limit=250):
    """Pełne rozmiary rdzenia + czytelny fragment rysunku (nie próba losowa).

    Rdzeń H musi być policzony na CAŁYM G. Dopiero do rysunku wybieramy
    najwyżej limit wierzchołków o największym stopniu W H. Stopnie po tym
    ograniczeniu mogą być mniejsze niż k. To nie jest nowy k-rdzeń.
    Dla grafu pustego nie wywołujemy algorytmu rozmieszczania wierzchołków.
    """
    if not isinstance(limit, int) or not 1 <= limit <= 1000:
        raise ValueError("Limit rysunku musi należeć do przedziału 1…1000.")
    fig, ax = plt.subplots(figsize=(9, 5), layout="constrained")
    ax.set_axis_off()
    if not H:
        ax.text(.5, .5, "Ten rdzeń jest pusty.", ha="center", va="center", transform=ax.transAxes)
        return fig
    wybrane = sorted(H, key=lambda v: (-H.degree(v), str(v)))[:limit]
    R = H.subgraph(wybrane)
    pos = nx.spring_layout(R, seed=13, iterations=60, weight=None)
    mapa = {"left": PALETA[0], "right": PALETA[3]}
    nx.draw_networkx(R, pos, ax=ax, with_labels=False, node_size=22,
                     node_color=[mapa.get(G.nodes[v].get("grupa"), "#999999") for v in R],
                     edge_color="#8497aa", alpha=.7, width=.35)
    opis = "Cały rdzeń" if len(R) == len(H) else f"Fragment do rysunku: {len(R)} z {len(H)} wierzchołków"
    ax.set_title(f"{opis}\nCały rdzeń: {len(H)} wierzchołków, {H.number_of_edges()} krawędzi")
    ax.legend(handles=[Patch(color=mapa["left"], label="left — progresywni"),
                       Patch(color=mapa["right"], label="right — konserwatywni")],
              loc="lower left", fontsize=9)
    return fig
