"""Diccionario de tags para el feed web (municipio / partido / tema)."""
from __future__ import annotations

import re
import unicodedata

PARTIDO_ALIASES: list[tuple[str, str]] = [
    ("La Libertad Avanza", "la libertad avanza"),
    ("La Libertad Avanza", "javier milei"),
    ("Juntos por el Cambio", "juntos por el cambio"),
    ("Unión por la Patria", "union por la patria"),
    ("Unión por la Patria", "peronismo"),
    ("Propuesta Republicana", "propuesta republicana"),
    ("Frente de Izquierda", "frente de izquierda"),
]

TEMA_ALIASES: list[tuple[str, str]] = [
    ("Pobreza", "pobreza"),
    ("Inflación", "inflacion"),
    ("Seguridad", "seguridad"),
    ("Educación", "educacion"),
    ("Salud", "salud"),
    ("Empleo", "empleo"),
    ("Desempleo", "desempleo"),
    ("Vivienda", "vivienda"),
    ("Tarifas", "tarifas"),
    ("Dólar", "dolar"),
    ("Elecciones", "elecciones"),
    ("Congreso", "congreso"),
    ("Gobierno", "gobierno"),
]

MUNICIPIO_ALIASES: list[tuple[str, str]] = [
    ("La Matanza", "la matanza"),
    ("La Plata", "la plata"),
    ("Mar del Plata", "mar del plata"),
    ("Bahía Blanca", "bahia blanca"),
    ("Quilmes", "quilmes"),
    ("Lomas de Zamora", "lomas de zamora"),
    ("Avellaneda", "avellaneda"),
    ("Lanús", "lanus"),
    ("Morón", "moron"),
    ("Moreno", "moreno"),
    ("Merlo", "merlo"),
    ("Tigre", "tigre"),
    ("San Isidro", "san isidro"),
    ("General San Martín", "general san martin"),
    ("Vicente López", "vicente lopez"),
    ("Tres de Febrero", "tres de febrero"),
    ("Florencio Varela", "florencio varela"),
    ("Berazategui", "berazategui"),
    ("Almirante Brown", "almirante brown"),
    ("Esteban Echeverría", "esteban echeverria"),
    ("Ezeiza", "ezeiza"),
    ("Hurlingham", "hurlingham"),
    ("Ituzaingó", "ituzaingo"),
    ("José C. Paz", "jose c paz"),
    ("José C. Paz", "jose c. paz"),
    ("Malvinas Argentinas", "malvinas argentinas"),
    ("San Miguel", "san miguel"),
    ("San Fernando", "san fernando"),
    ("San Vicente", "san vicente"),
    ("Presidente Perón", "presidente peron"),
    ("Escobar", "escobar"),
    ("Pilar", "pilar"),
    ("Campana", "campana"),
    ("Zárate", "zarate"),
    ("San Nicolás", "san nicolas"),
]


def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    text = text.lower().strip()
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("utf-8")


def build_dictionary(extra_municipios: list[str] | None = None) -> list[tuple[str, str, str]]:
    entries: list[tuple[str, str, str]] = []
    for texto, alias in PARTIDO_ALIASES:
        entries.append((texto, normalize_text(alias), "partido"))
    for texto, alias in TEMA_ALIASES:
        entries.append((texto, normalize_text(alias), "tema"))
    for texto, alias in MUNICIPIO_ALIASES:
        entries.append((texto, normalize_text(alias), "municipio"))
    if extra_municipios:
        for nombre in extra_municipios:
            norm = normalize_text(nombre)
            if len(norm) < 5:
                continue
            entries.append((nombre.strip(), norm, "municipio"))
    entries.sort(key=lambda e: len(e[1]), reverse=True)
    return entries


def extract_tags(text: str, dictionary: list[tuple[str, str, str]]) -> list[tuple[str, str]]:
    haystack = normalize_text(text)
    found: dict[str, str] = {}
    for texto, alias, tipo in dictionary:
        if not alias or len(alias) < 4:
            continue
        pattern = r"(?<!\w)" + re.escape(alias) + r"(?!\w)"
        if re.search(pattern, haystack) and texto not in found:
            found[texto] = tipo
    return [(t, tipo) for t, tipo in found.items()]
