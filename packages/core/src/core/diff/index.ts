import { EMPTY_OBJ } from '../constants';
import { Component, getDomSibling } from '../component';
import { NormalizedProps, VElem, VNode } from '../create-element';
import { diffChildren } from './children';
import { diffProps, setProperty } from './props';

/**
 * Diff two virtual nodes and apply proper changes to the DOM
 * @param parentDom The parent of the DOM element
 * @param newVNode The new virtual node
 * @param oldVNode The old virtual node
 * @param isSvg Whether or not this element is an SVG node
 * @param oldDom The current attached DOM
 * element any new dom elements should be placed around. Likely `null` on first
 * render (except when hydrating). Can be a sibling DOM element when diffing
 * Fragments that have siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 */
export function diff(
	parentDom: Node,
	newVNode: VNode,
	oldVNode: VNode | undefined,
	isSvg: boolean,
	oldDom: Node | null,
) {
	const { type } = newVNode;

	// When passing through createElement it assigns the object
	// constructor as undefined. This to prevent JSON-injection.
	if (newVNode.constructor !== undefined) return null;

	try {
		if (typeof type === 'function') {
			let c: VNode['_component'];
			let isNew = false;
			const newProps = newVNode.props as NormalizedProps;

			if (oldVNode?._component) {
				c = newVNode._component = oldVNode._component;
			} else {
				if ('prototype' in type && type.prototype.render) {
					if (process.env.NODE_ENV === 'development') {
						throw new Error('Class component in render method is not supported.')
					}
				}

				newVNode._component = c = new Component(newProps, type);
				isNew = true;
			}

			c._vnode = newVNode;

			if (!isNew && newVNode._original === oldVNode?._original) {
				// clone the old node and its children
				newVNode._dom = oldVNode._dom;
				newVNode._children = oldVNode._children?.map((vnode) => {
					if (vnode) {
						vnode._parent = newVNode;
					}

					return vnode;
				});

				// quit the diff early
				return;
			}

			c.props = newProps;
			c._parentDom = parentDom;

			let count = 0;
			let renderRet: VElem;

			do {
				c._dirty = false;
				renderRet = c.render(c.props);
				// Handle state change in render
			} while (c._dirty && ++count < 25);

			diffChildren(
				parentDom,
				Array.isArray(renderRet) ? renderRet : [renderRet],
				newVNode,
				oldVNode,
				isSvg,
				oldDom,
			);

			c.base = newVNode._dom;

			return;
		}

		if (newVNode._original === oldVNode?._original) {
			newVNode._children = oldVNode._children;
			newVNode._dom = oldVNode._dom;
			return;
		}

		newVNode._dom = diffElementNodes(
			oldVNode?._dom,
			newVNode,
			oldVNode,
			isSvg,
		);
	} catch (e) {
		newVNode._original = null;
	}
}

/**
 * Diff two virtual nodes representing DOM element
 * @param dom The DOM element representing
 * the virtual nodes being diffed
 * @param newVNode The new virtual node
 * @param oldVNode The old virtual node
 * @param isSvg Whether or not this DOM node is an SVG node
 * @returns
 */
function diffElementNodes(
	dom,
	newVNode,
	oldVNode,
	isSvg,
) {
	let oldProps = oldVNode.props;
	let newProps = newVNode.props;
	let nodeType = newVNode.type;
	let i = 0;

	// Tracks entering and exiting SVG namespace when descending through the tree.
	if (nodeType === 'svg') isSvg = true;

	if (dom == null) {
		if (nodeType === null) {
			return document.createTextNode(newProps);
		}

		if (isSvg) {
			dom = document.createElementNS(
				'http://www.w3.org/2000/svg',
				nodeType
			);
		} else {
			dom = document.createElement(
				nodeType,
				newProps.is && newProps
			);
		}
	}

	if (nodeType === null) {
		if (oldProps !== newProps) {
			dom.data = newProps;
		}
	} else {
		oldProps = oldVNode.props || EMPTY_OBJ;

		let oldHtml = oldProps.dangerouslySetInnerHTML;
		let newHtml = newProps.dangerouslySetInnerHTML;

		if (newHtml || oldHtml) {
			// Avoid re-applying the same '__html' if it did not changed between re-render
			if (
				!newHtml ||
				((!oldHtml || newHtml.__html != oldHtml.__html) &&
					newHtml.__html !== dom.innerHTML)
			) {
				dom.innerHTML = (newHtml && newHtml.__html) || '';
			}
		}

		diffProps(dom, newProps, oldProps, isSvg);

		// If the new vnode didn't have dangerouslySetInnerHTML, diff its children
		if (newHtml) {
			newVNode._children = [];
		} else {
			i = newVNode.props.children;
			diffChildren(
				dom,
				Array.isArray(i) ? i : [i],
				newVNode,
				oldVNode,
				isSvg && nodeType !== 'foreignObject',
				oldVNode._children && getDomSibling(oldVNode, 0),
			);
		}

		if (
			'value' in newProps &&
			(i = newProps.value) !== undefined &&
			// For the <progress>-element the initial value is 0,
			// despite the attribute not being present. When the attribute
			// is missing the progress bar is treated as indeterminate.
			// To fix that we'll always update it when it is 0 for progress elements
			(i !== dom.value ||
				(nodeType === 'progress' && !i) ||
				// This is only for IE 11 to fix <select> value not being updated.
				// To avoid a stale select value we need to set the option.value
				// again, which triggers IE11 to re-evaluate the select value
				(nodeType === 'option' && i !== oldProps.value))
		) {
			setProperty(dom, 'value', i, oldProps.value, false);
		}
		if (
			'checked' in newProps &&
			(i = newProps.checked) !== undefined &&
			i !== dom.checked
		) {
			setProperty(dom, 'checked', i, oldProps.checked, false);
		}
	}

	return dom;
}

/**
 * Invoke or update a ref, depending on whether it is a function or object ref.
 * @param ref
 * @param value
 * @param vnode
 */
export function applyRef(ref, value, vnode) {
	try {
		if (typeof ref === 'function') ref(value);
		else ref.current = value;
	} catch (e) {
		// noop
	}
}

/**
 * Unmount a virtual node from the tree and apply DOM changes
 * @param vnode The virtual node to unmount
 * @param parentVNode The parent of the VNode that
 * initiated the unmount
 * @param {boolean} [skipRemove] Flag that indicates that a parent node of the
 * current element is already detached from the DOM.
 */
export function unmount(vnode, parentVNode, skipRemove) {
	let r;

	if ((r = vnode.ref)) {
		if (!r.current || r.current === vnode._dom) {
			applyRef(r, null, parentVNode);
		}
	}

	if ((r = vnode._component) != null) {
		r.base = r._parentDom = null;
		vnode._component = undefined;
	}

	if ((r = vnode._children)) {
		for (let i = 0; i < r.length; i++) {
			if (r[i]) {
				unmount(
					r[i],
					parentVNode,
					skipRemove || typeof vnode.type !== 'function'
				);
			}
		}
	}

	if (!skipRemove && vnode._dom != null) {
		vnode._dom.remove();
	}

	// Must be set to `undefined` to properly clean up `_nextDom`
	// for which `null` is a valid value. See comment in `create-element.js`
	vnode._parent = vnode._dom = vnode._nextDom = undefined;
}
