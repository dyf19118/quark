import { NormalizedProps, RenderFunc, VNode } from './create-element';

// Define an interface for the instance type
interface RenderCompInst {
	props: NormalizedProps;
	render: RenderFunc;
	_dirty: boolean;
	_vnode: VNode | null;
	_parentDom: Node | null;
	base: HTMLElement | null;
}

/**
 * Base Component class.
 */
export class Component implements RenderCompInst {
	props: NormalizedProps;
	render: RenderFunc;
	base: HTMLElement | null = null;
	_dirty = false;
	_vnode: VNode | null = null;
	_parentDom: Node | null = null;

	constructor(props: NormalizedProps, render: RenderFunc) {
		this.props = props;
		this.render = render;
		this._dirty = true;
	}
}

/**
 * @param vnode
 * @param childIndex
 */
export function getDomSibling(vnode, childIndex?: number) {
	if (childIndex == null) {
		// Use childIndex==null as a signal to resume the search from the vnode's sibling
		return vnode._parent
			? getDomSibling(vnode._parent, vnode._parent._children.indexOf(vnode) + 1)
			: null;
	}

	let sibling;
	for (; childIndex < vnode._children.length; childIndex++) {
		sibling = vnode._children[childIndex];

		if (sibling != null && sibling._dom != null) {
			// Since updateParentDomPointers keeps _dom pointer correct,
			// we can rely on _dom to tell us if this subtree contains a
			// rendered DOM node, and what the first rendered DOM node is
			return sibling._dom;
		}
	}

	// If we get here, we have not found a DOM node in this vnode's children.
	// We must resume from this vnode's sibling (in it's parent _children array)
	// Only climb up and search the parent if we aren't searching through a DOM
	// VNode (meaning we reached the DOM parent of the original vnode that began
	// the search)
	return typeof vnode.type === 'function' ? getDomSibling(vnode) : null;
}
