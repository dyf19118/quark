import { Component } from './component';

/** vnode's global id */
let vnodeId = 0;

export type Ref<T = unknown> = { current: T | null; };

export type RawProps = {
	ref?: Ref<HTMLElement> | { (value: HTMLElement | null): void; };
	key?: string | undefined;
	[propKey: string]: unknown;
};

export type VElem = string | number | null | undefined | boolean | VNode | VElem[];

export type NormalizedProps = (Omit<RawProps, 'key' | 'ref'> & { children?: VElem[] });

export type RenderFunc = { (props: NormalizedProps): VElem };

export interface VNode {
	/** typeof the element, element tag or Fragment */
	type: string | RenderFunc;
	props: NormalizedProps | string | number;
	key: RawProps['key'];
	ref: RawProps['ref'];
	_children: VNode[] | null | undefined;
	_parent: VNode | null | undefined;
	/** vnode's depth in the tree, default to 0 if it has not beed used */
	_depth: number;
	_dom: null | HTMLElement;
	_nextDom: undefined;
	/** component instance of vnode whose type is function */
	_component: InstanceType<typeof Component> | null;
	/** component constructor of vnode whose type is function */
	constructor: undefined;
	/** vnode's id, or it's prototype (current vnode is the clone of the prototype)  */
	_original: VNode | string | number | bigint | null;
}

/**
 * Create an virtual node (used for JSX)
 * @param type The node name or Component constructor for this virtual node
 * @param props The properties of the virtual node
 * @param children The children of the virtual node
 */
export function createElement(
	type:  VNode['type'],
	props: RawProps | null,
	...children: VElem[]
) {
	const {
		key,
		ref,
		...normalizedProps
	} = { ...props };

	if (children.length) {
		normalizedProps.children = children;
	}

	return createVNode(type, normalizedProps, key, ref, null);
}

/**
 * Create a VNode (used internally by quark)
 * @param type The node name or Component Constructor for this virtual node
 * @param props The properties of this virtual node.
 * If this virtual node represents a text node, this is the text of the node (string or number).
 * @param key The key for this virtual node, used when diffing it against its children
 * @param ref The ref property that will receive a reference to its created child
 * @returns
 */
export function createVNode(
	type: VNode['type'],
	props: VNode['props'],
	key: VNode['key'],
	ref: VNode['ref'],
	original: VNode | string | number | bigint | null
): VNode {
	// V8 seems to be better at detecting type shapes if the object is allocated from the same call site
	// Do not inline into createElement and coerceToVNode!
	const vnode = {
		type,
		props,
		key,
		ref,
		_children: null,
		_parent: null,
		_depth: 0,
		_dom: null,
		// _nextDom must be initialized to undefined b/c it will eventually
		// be set to dom.nextSibling which can return `null` and it is important
		// to be able to distinguish between an uninitialized _nextDom and
		// a _nextDom that has been set to `null`
		_nextDom: undefined,
		_component: null,
		constructor: undefined,
		_original: original == null ? ++vnodeId : original
	};
	return vnode;
}

/** creates a ref object which can contain arbitrary value */
export function createRef<T>(): Ref<T> {
	return { current: null };
}

export function Fragment(props: NormalizedProps) {
	return props.children;
}
