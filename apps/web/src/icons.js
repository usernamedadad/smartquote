/**
 * SVG 图标生成函数
 */

export function iconSvg(name) {
  const paths = {
    title: '<path d="M5 6h14M12 6v13M9 19h6"></path>',
    company: '<path d="M4 20h16"></path><path d="M6 20V6h8v14"></path><path d="M14 10h4v10"></path><path d="M8.5 9h3M8.5 13h3M8.5 17h3"></path>',
    customer: '<path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path><path d="M4.5 19a5 5 0 0 1 10 0"></path><path d="M15.5 8.5h3M17 7v3"></path>',
    parameters: '<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM14 16h5"></path><path d="M16.5 13.5v5"></path>',
    image: '<path d="M5 6h14v13H5z"></path><path d="m7.5 16 3.5-4 3 3 2-2.5 2.5 3.5"></path><path d="M8.5 9.5h.01"></path>',
    price: '<path d="M12 4v16"></path><path d="M16 7.5c-.8-.9-2-1.4-3.4-1.4-2.2 0-3.6 1-3.6 2.5 0 3.7 7.5 1.6 7.5 5.5 0 1.6-1.5 2.8-3.9 2.8-1.7 0-3.1-.6-4.1-1.6"></path>',
    terms: '<path d="M7 4h8l3 3v15H7z"></path><path d="M15 4v4h4M9.5 12h6M9.5 16h6"></path>',
    footer: '<path d="M5 6h14v13H5z"></path><path d="M8 15h8M8 10h4"></path>',
    capacity: '<path d="M8.5 10V8.2a3.5 3.5 0 0 1 7 0V10"></path><path d="M7 10h10l1.1 8.5H5.9z"></path><path d="M9.5 15.7h5"></path>',
    height: '<path d="M6.5 5.5h11"></path><path d="M6.5 18.5h11"></path><path d="M12 7.5v9"></path><path d="m9.5 10 2.5-2.5 2.5 2.5M9.5 16l2.5 2.5 2.5-2.5"></path>',
    speed: '<path d="M5 16.5a7 7 0 0 1 14 0"></path><path d="M7.2 16.5h9.6"></path><path d="m12 16.5 4.1-5.2"></path><path d="M7.7 11.1l1.4 1.1M12 9.5v1.8"></path>',
    voltage: '<path d="m13 3-7 11h6l-1 7 7-12h-6z"></path>',
    shield: '<path d="M12 3 19 6v5c0 4.4-2.8 7.3-7 9-4.2-1.7-7-4.6-7-9V6z"></path><path d="m9.5 12 1.7 1.7 3.5-4"></path>',
    control: '<rect x="8" y="4" width="8" height="16" rx="2"></rect><path d="M10.5 8h3M10.5 12h5M10.5 16h2"></path>',
    panel: '<rect x="5" y="6" width="14" height="13" rx="1.5"></rect><path d="M9 6v13M14 6v13M5 11h14"></path>',
    circuit: '<rect x="6" y="6" width="12" height="12" rx="1.5"></rect><rect x="9.5" y="9.5" width="5" height="5" rx="1"></rect><path d="M3 9h3M3 15h3M18 9h3M18 15h3M9 3v3M15 3v3M9 18v3M15 18v3"></path>',
    structure: '<path d="M5 18.5h14"></path><path d="M7.5 18.5V7h9v11.5"></path><path d="M7.5 7h9M8.5 11h7M8.5 15h7"></path>',
    remark: '<path d="M5 17.5 16.5 6a2.1 2.1 0 0 1 3 3L8 20H5z"></path><path d="M14.8 7.7 17.3 10.2"></path>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.remark}</svg>`;
}

export function parameterIconSvg(key) {
  const lower = key.toLowerCase();
  if (lower.includes("capacity")) return iconSvg("capacity");
  if (lower.includes("height")) return iconSvg("height");
  if (lower.includes("speed")) return iconSvg("speed");
  if (lower.includes("voltage") || lower.includes("power")) return iconSvg("voltage");
  if (lower.includes("duty")) return iconSvg("shield");
  if (lower.includes("control")) return iconSvg("control");
  if (lower.includes("vfd")) return iconSvg("panel");
  if (lower.includes("electrical")) return iconSvg("circuit");
  if (lower.includes("bar") || lower.includes("rail") || lower.includes("structure")) return iconSvg("structure");
  return iconSvg("remark");
}

export function moduleIconSvg(name) {
  return iconSvg(name);
}

export function hamburgerIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14"></path>
    </svg>
  `;
}

export function chevronRightSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m10 7 5 5-5 5"></path>
    </svg>
  `;
}

export function fitViewIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="4" width="8" height="16" rx="1.8"></rect>
      <path d="M10.5 17.5h3"></path>
    </svg>
  `;
}

export function minusIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 12h10"></path>
    </svg>
  `;
}

export function plusIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 7v10M7 12h10"></path>
    </svg>
  `;
}

export function fullscreenIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"></path>
      <path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"></path>
    </svg>
  `;
}

export function undoIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7 5 11l4 4"></path>
      <path d="M5.6 11h8.8c3 0 5.1 1.9 5.1 4.8 0 1.1-.3 2.1-.9 2.9"></path>
    </svg>
  `;
}

export function redoIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 7 4 4-4 4"></path>
      <path d="M18.4 11H9.6c-3 0-5.1 1.9-5.1 4.8 0 1.1.3 2.1.9 2.9"></path>
    </svg>
  `;
}

export function translateIconSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8l6 6"></path>
      <path d="M4 14h4"></path>
      <path d="M2 17h3"></path>
      <path d="M14.5 4l-5.5 9"></path>
      <path d="M14 3l1 1.5L14 6"></path>
      <path d="M17.5 14.5l2.5 5.5"></path>
      <path d="M19 13l-5 11"></path>
      <path d="M15 13h8"></path>
    </svg>
  `;
}

export function modalIconSvg(tone) {
  if (tone === "danger") {
    return '<svg viewBox="0 0 24 24"><path d="M12 8v5"></path><path d="M12 17h.01"></path><path d="M10.3 4.3 2.9 17.1A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0Z"></path></svg>';
  }
  if (tone === "warning") {
    return '<svg viewBox="0 0 24 24"><path d="M12 8v5"></path><path d="M12 17h.01"></path><path d="M10.3 4.3 2.9 17.1A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0Z"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>';
}

export function pencilIconSvg() {
  return '<svg viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>';
}
