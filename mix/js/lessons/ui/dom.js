/** Tiny DOM helpers. Text always goes in through textContent, never innerHTML. */

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(node, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.setAttribute('class', value); // SVG className is read-only
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.setAttribute('style', value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
}

/** h('button', { class: 'x', onClick }, child, [children]) builds an element. */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

/** Same as h for SVG elements. */
export function svg(tag, props = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  applyProps(node, props);
  node.append(...children.flat().filter(Boolean));
  return node;
}

/** Visually hidden text for screen readers. */
export const srOnly = (text) => h('span', { class: 'lz-sr', text });
