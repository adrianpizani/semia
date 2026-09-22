"""Diccionario de tags para el feed web (municipio / partido / tema).

Las entradas viven en `feed_web_dict_entries`; este módulo guarda el seed
inicial y los helpers de normalización / matching.
"""
from __future__ import annotations

import re
import unicodedata

# (texto canónico, alias a buscar, tipo)
# Provincias: nombres = dimension_geografica.nivel Provincia / provincias.geojson
SEED_PROVINCIA_ENTRIES: list[tuple[str, str, str]] = [
    ("Buenos Aires", "buenos aires", "provincia"),
    ("Buenos Aires", "provincia de buenos aires", "provincia"),
    ("Ciudad Autónoma de Buenos Aires", "ciudad autonoma de buenos aires", "provincia"),
    ("Ciudad Autónoma de Buenos Aires", "caba", "provincia"),
    ("Ciudad Autónoma de Buenos Aires", "capital federal", "provincia"),
    ("Catamarca", "catamarca", "provincia"),
    ("Chaco", "chaco", "provincia"),
    ("Chubut", "chubut", "provincia"),
    ("Córdoba", "cordoba", "provincia"),
    ("Corrientes", "corrientes", "provincia"),
    ("Entre Ríos", "entre rios", "provincia"),
    ("Formosa", "formosa", "provincia"),
    ("Jujuy", "jujuy", "provincia"),
    ("La Pampa", "la pampa", "provincia"),
    ("La Rioja", "la rioja", "provincia"),
    ("Mendoza", "mendoza", "provincia"),
    ("Misiones", "misiones", "provincia"),
    ("Neuquén", "neuquen", "provincia"),
    ("Río Negro", "rio negro", "provincia"),
    ("Salta", "salta", "provincia"),
    ("San Juan", "san juan", "provincia"),
    ("San Luis", "san luis", "provincia"),
    ("Santa Cruz", "santa cruz", "provincia"),
    ("Santa Fe", "santa fe", "provincia"),
    ("Santiago del Estero", "santiago del estero", "provincia"),
    (
        "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
        "tierra del fuego",
        "provincia",
    ),
    (
        "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
        "tierra del fuego antartida",
        "provincia",
    ),
    ("Tucumán", "tucuman", "provincia"),
]

SEED_DICT_ENTRIES: list[tuple[str, str, str]] = [
    ("La Libertad Avanza", "la libertad avanza", "partido"),
    ("La Libertad Avanza", "javier milei", "partido"),
    ("Juntos por el Cambio", "juntos por el cambio", "partido"),
    ("Unión por la Patria", "union por la patria", "partido"),
    ("Unión por la Patria", "peronismo", "partido"),
    ("Propuesta Republicana", "propuesta republicana", "partido"),
    ("Frente de Izquierda", "frente de izquierda", "partido"),
    ("Pobreza", "pobreza", "tema"),
    ("Inflación", "inflacion", "tema"),
    ("Seguridad", "seguridad", "tema"),
    ("Educación", "educacion", "tema"),
    ("Salud", "salud", "tema"),
    ("Empleo", "empleo", "tema"),
    ("Desempleo", "desempleo", "tema"),
    ("Vivienda", "vivienda", "tema"),
    ("Tarifas", "tarifas", "tema"),
    ("Dólar", "dolar", "tema"),
    ("Elecciones", "elecciones", "tema"),
    ("Congreso", "congreso", "tema"),
    ("Gobierno", "gobierno", "tema"),
    ("La Matanza", "la matanza", "municipio"),
    ("La Plata", "la plata", "municipio"),
    ("Mar del Plata", "mar del plata", "municipio"),
    ("Bahía Blanca", "bahia blanca", "municipio"),
    ("Quilmes", "quilmes", "municipio"),
    ("Lomas de Zamora", "lomas de zamora", "municipio"),
    ("Avellaneda", "avellaneda", "municipio"),
    ("Lanús", "lanus", "municipio"),
    ("Morón", "moron", "municipio"),
    ("Moreno", "moreno", "municipio"),
    ("Merlo", "merlo", "municipio"),
    ("Tigre", "tigre", "municipio"),
    ("San Isidro", "san isidro", "municipio"),
    ("General San Martín", "general san martin", "municipio"),
    ("Vicente López", "vicente lopez", "municipio"),
    ("Tres de Febrero", "tres de febrero", "municipio"),
    ("Florencio Varela", "florencio varela", "municipio"),
    ("Berazategui", "berazategui", "municipio"),
    ("Almirante Brown", "almirante brown", "municipio"),
    ("Esteban Echeverría", "esteban echeverria", "municipio"),
    ("Ezeiza", "ezeiza", "municipio"),
    ("Hurlingham", "hurlingham", "municipio"),
    ("Ituzaingó", "ituzaingo", "municipio"),
    ("José C. Paz", "jose c paz", "municipio"),
    ("José C. Paz", "jose c. paz", "municipio"),
    ("Malvinas Argentinas", "malvinas argentinas", "municipio"),
    ("San Miguel", "san miguel", "municipio"),
    ("San Fernando", "san fernando", "municipio"),
    ("San Vicente", "san vicente", "municipio"),
    ("Presidente Perón", "presidente peron", "municipio"),
    ("Escobar", "escobar", "municipio"),
    ("Pilar", "pilar", "municipio"),
    ("Campana", "campana", "municipio"),
    ("Zárate", "zarate", "municipio"),
    ("San Nicolás", "san nicolas", "municipio"),
    *SEED_PROVINCIA_ENTRIES,
]


def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    text = text.lower().strip()
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("utf-8")


def dictionary_from_rows(rows: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """rows: (texto, alias_or_normalized, tipo) → sorted match list."""
    entries: list[tuple[str, str, str]] = []
    for texto, alias, tipo in rows:
        norm = normalize_text(alias)
        if len(norm) < 4:
            continue
        entries.append((texto.strip(), norm, tipo))
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
