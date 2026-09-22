/**
 * Set de iconos propio (SVG inline, trazo único, 20×20), para no depender de
 * ninguna librería ni de emojis como iconografía de interfaz.
 */

const ICONS = {
  star: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7z"/></svg>`,
  starOutline: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7z"/></svg>`,
  paperclip: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13.5 6.5l-6 6a2.5 2.5 0 003.5 3.5l6-6a4 4 0 00-5.5-5.5l-6 6a5.5 5.5 0 007.5 7.5"/></svg>`,
  bolt: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 1L3 11h5l-1 8 8-10h-5z"/></svg>`,
  send: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 10l16-8-4 16-5-6-5 4z"/></svg>`,
  close: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l12 12M16 4L4 16"/></svg>`,
  megaphone: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M2 8v4h2l7 4V4L4 8H2z"/><path d="M14 7a3 3 0 010 6"/></svg>`,
  image: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l5-5 4 4 3-3 4 4" stroke-linejoin="round"/></svg>`,
  video: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="2" y="5" width="11" height="10" rx="1.5"/><path d="M13 8.5l5-3v9l-5-3z"/></svg>`,
  clock: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="8"/><path d="M10 5.5V10l3 2" stroke-linecap="round"/></svg>`,
  smile: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="8"/><path d="M6.5 12c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" stroke-linecap="round"/><circle cx="7.2" cy="8" r="0.9" fill="currentColor" stroke="none"/><circle cx="12.8" cy="8" r="0.9" fill="currentColor" stroke="none"/></svg>`,
  users: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="3"/><path d="M1.5 17c.7-3 2.8-4.5 5.5-4.5s4.8 1.5 5.5 4.5" stroke-linecap="round"/><circle cx="14.5" cy="7.5" r="2.3"/><path d="M13 12.7c2 .2 3.5 1.6 4 4.3" stroke-linecap="round"/></svg>`,
  plus: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 3v14M3 10h14"/></svg>`,
  trash: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h14M7.5 5.5V3.5h5v2M5.5 5.5l.7 10a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-10"/></svg>`,
  logout: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H4.5a1 1 0 00-1 1v12a1 1 0 001 1H8M13 14l4-4-4-4M17 10H7"/></svg>`,
  search: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="9" r="6"/><path d="M17.5 17.5L13.5 13.5" stroke-linecap="round"/></svg>`,
  doc: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 2.5h7l3 3v12h-10z"/><path d="M12 2.5V6h3"/></svg>`,
  bag: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M5 6h10l1 11H4z"/><path d="M7 6V5a3 3 0 016 0v1"/></svg>`,
  shield: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10 2l6 2.5v5c0 4-2.6 6.8-6 8.5-3.4-1.7-6-4.5-6-8.5v-5z"/></svg>`,
  tag: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 10.5L9.5 3H16a1 1 0 011 1v6.5L9.5 18 2 10.5z"/><circle cx="12.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>`,
  slash: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13 3L7 17"/></svg>`,
  spinner: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 2.5a7.5 7.5 0 105.3 2.2" opacity="0.85"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4L6 10l6.5 6"/></svg>`,
  key: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="13.5" r="3.5"/><path d="M9 11l7-7M13 7l2 2M16 4l2 2"/></svg>`,
  eye: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="10" cy="10" r="2.5"/></svg>`,
  eyeOff: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="10" cy="10" r="2.5"/><path d="M2.5 2.5l15 15"/></svg>`,
  more: `<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="10" r="1.8"/><circle cx="10" cy="10" r="1.8"/><circle cx="16" cy="10" r="1.8"/></svg>`,
  chat: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 4.5h15v9h-8.5L5 16.5V13.5H2.5v-9z"/></svg>`,
  check: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5l4 4L17 5.5"/></svg>`,
  checkDouble: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 10.5l3.5 3.5L12 6.5"/><path d="M6.5 10.5l3.5 3.5L19 6.5"/></svg>`,
  alertCircle: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v5"/><circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none"/></svg>`
};

function icon(nombre, claseExtra = "") {
  return `<span class="icono-svg ${claseExtra}">${ICONS[nombre] || ""}</span>`;
}
