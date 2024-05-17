import { diff } from './diff';
import { createElement, Fragment, VElem, VNode } from './create-element';

/**
 * Render a quark virtual node into a DOM element
 * @param vnode The virtual node to render
 * @param root The root DOM element to render into
 */
export function render(velem: VElem, root: Node & { _children?: VNode }) {
	// To be able to support calling `render()` multiple times on the same
	// DOM node, we need to obtain a reference to the previous tree. We do
	// this by assigning a new `_children` property to DOM nodes which points
	// to the last rendered tree. By default this property is not present, which
	// means that we are mounting a new tree for the first time.
	const oldVNode = root._children;
	const vnode = root._children = createElement(Fragment, null, velem);
	diff(
		root,
		// Determine the new vnode tree and store it on the DOM element on
		// our custom `_children` property.
		vnode,
		oldVNode,
		root instanceof SVGElement,
		oldVNode ? oldVNode._dom : root.firstChild,
	);
}