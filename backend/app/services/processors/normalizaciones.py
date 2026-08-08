"""
Registro central de homologaciones (conocimiento de dominio).

Centraliza las variantes de un mismo valor conceptual para que el procesador
genérico aplique normalizaciones de forma consistente y acumulando "histórico":
cada vez que un nuevo archivo presenta un problema similar, se agrega una entrada
nueva aquí con sus variantes y el procesador ya sabe cómo homologarlas en el futuro.

Contrato:
    HOMOLOGACIONES[<nombre de columna>] = { <variante> : <forma canónica>, ... }

    - La clave es el nombre con el que la columna queda en `dimension_extra`
      (es decir, el nombre mapeado/canónico de la columna en el archivo).
    - Cada entrada del dict mapea una variante a su forma canónica.
      Los valores que NO aparecen como clave se dejan tal cual.
"""

HOMOLOGACIONES = {
    # El mismo cargo (Diputados Nacionales) se escribe distinto según la elección/año.
    "cargo_nombre": {
        "DIPUTADO NACIONAL": "DIPUTADOS NACIONALES",
        "DIPUTADOS NACIONALES": "DIPUTADOS NACIONALES",
        "DIPUTADOS/AS NACIONALES": "DIPUTADOS NACIONALES",
    },
    # El mismo tipo de voto aparece con variantes (EN BLANCO/BLANCOS, NULO/NULOS, etc.).
    "votos_tipo": {
        "EN BLANCO": "EN BLANCO",
        "BLANCOS": "EN BLANCO",
        "BLANCO": "EN BLANCO",
        "NULO": "NULO",
        "NULOS": "NULO",
        "IMPUGNADO": "IMPUGNADO",
        "IMPUGNADOS": "IMPUGNADO",
        "RECURRIDO": "RECURRIDO",
        "RECURRIDOS": "RECURRIDO",
        "COMANDO": "COMANDO",
        "POSITIVO": "POSITIVO",
    },
    # Añadir más campos aquí en el futuro, p. ej.:
    # "agrupacion_nombre": { "FRENTE DE TODOS": "UNION POR LA PATRIA", ... },
}


def homologar(campo: str, valor):
    """
    Devuelve la forma canónica de `valor` para el campo dado.

    Si el campo no tiene homologaciones registradas o el valor no aparece como
    variante, devuelve el valor original (con los espacios de alrededor limpios).
    """
    if valor is None:
        return None
    texto = str(valor).strip()
    mapeo = HOMOLOGACIONES.get(campo)
    if not mapeo:
        return texto
    return mapeo.get(texto, texto)
