// Utilidades de color por partido, compartidas entre el mapa y la leyenda.

// Paleta conocida para partidos principales (colores estables y legibles).
const KNOWN_PARTY_COLORS: Record<string, string> = {
  'JUNTOS POR EL CAMBIO': '#FFD700',
  'JUNTOS': '#FFD700',
  'FRENTE DE TODOS': '#1E90FF',
  'CONSENSO FEDERAL': '#FFA500',
  'FRENTE DE IZQUIERDA Y DE TRABAJADORES - UNIDAD': '#FF0000',
  'FRENTE DE IZQUIERDA Y DE LOS TRABAJADORES': '#DC143C',
  'FRENTE DE IZQUIERDA Y DE LOS TRABAJADORES - UNIDAD': '#DC143C',
  'UNIDAD CIUDADANA': '#87CEEB',
  'CAMBIEMOS BUENOS AIRES': '#FFC0CB',
  '1PAIS': '#9370DB',
  'FRENTE JUSTICIALISTA': '#00008B',
};

// Hash determinístico de un string -> entero no negativo.
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return Math.abs(h);
}

// Devuelve el color de un partido: si está en la paleta conocida usa ese color;
// si no, genera uno determinístico (mismo partido => mismo color), para que con
// datasets grandes (muchos partidos) el mapa y la leyenda no queden todos en gris.
export function getPartyColor(partyName: string | null | undefined): string {
  if (!partyName) return '#D1D5DB'; // gris por defecto (sin partido / datos)
  const known = KNOWN_PARTY_COLORS[partyName];
  if (known) return known;
  const hue = hashString(partyName) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

// Devuelve un mapa partido -> color para una lista de partidos.
export function getPartiesColorMap(parties: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const party of parties) {
    map[party] = getPartyColor(party);
  }
  return map;
}