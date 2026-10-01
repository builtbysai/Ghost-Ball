// The five halls: venue identity (felt, rails, accent), not UI chrome.
export const HALLS = [
  { id: 'parlor',   name: 'The Parlor', year: '1893', line: 'Gas-lit club. Walnut, bone and sage baize.',
    accent: '#ffb347', felt: { base: '#4d7c55', light: '#6a9c70', dark: '#2a4a33', rubber: '#3b6444' },
    rail: '#3a2417', wall: '#241a12' },
  { id: 'hall61',   name: 'Hall 1961', year: '1961', line: 'Smoke, one lamp, and money on the table.',
    accent: '#6fd3c0', felt: { base: '#2c7654', light: '#3c9569', dark: '#144733', rubber: '#1f5f43' },
    rail: '#2c1d12', wall: '#1c1712' },
  { id: 'stage',    name: 'The Stage', year: 'Now', line: 'Tournament blue under the lights.',
    accent: '#4da3ff', felt: { base: '#1d5fad', light: '#3079d0', dark: '#0c336d', rubber: '#154f95' },
    rail: '#241a20', wall: '#14161c' },
  { id: 'lastcall', name: 'Last Call', year: '1984', line: 'Corner bar. One more game.',
    accent: '#ff5a4d', felt: { base: '#4b515c', light: '#666e7b', dark: '#292d34', rubber: '#3a3f48' },
    rail: '#31201a', wall: '#1d1414' },
  { id: 'rooftop',  name: 'The Rooftop', year: 'Dusk', line: 'String lights, a warm skyline, a long evening.',
    accent: '#ff8f6b', felt: { base: '#5e9583', light: '#7cb5a0', dark: '#376655', rubber: '#4c8070' },
    rail: '#33241a', wall: '#201812' },
];
export const hallById = (id) => HALLS.find((h) => h.id === id) || HALLS[0];
