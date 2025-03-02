import { createElement as h, Fragment, VElem } from './core/create-element'
import { render } from './core/render'
import { isFunction } from './core/util'
import { PropertyDeclaration } from "./models"
import DblKeyMap from "./dblKeyMap"
import { EventController, EventHandler } from "./eventController"
import { version } from '../package.json'
import { Dep, nextTick, UserWatcherOptions, Watcher } from './computed';
import type { ReactiveControllerHost, ReactiveController } from "./reactiveController"
export { createRef } from './core/create-element'
export type { Ref } from './core/create-element'
export type { ReactiveControllerHost, ReactiveController }


export { Fragment }

if (process.env.NODE_ENV === 'development') {
  console.info(`%cquarkc@${version}`, 'color: white;background:#9f57f8;font-weight:bold;font-size:10px;padding:2px 6px;border-radius: 5px', 'Running in dev mode.')
}

type Falsy = false | 0 | '' | null | undefined

/** 
 * Check if val is empty. Falsy values except than 'false' and '0' are considered empty.
 * 
 * 判断是否为空值，falsy值中'false'和'0'不算
 */
const isEmpty = (val: unknown): val is Exclude<Falsy, false | 0> => !(val || val === false || val === 0);

const defaultPropertyDeclaration: PropertyDeclaration = {
  observed: true,
  type: String,
  converter: (value, type) => {
    switch (type) {
      case Number:
        return Number(value);
      case Boolean:
        return value !== null;
      default:
      // noop
    }

    return value;
  },
};

export const property = (options: PropertyDeclaration = {}) => {
  return (target: QuarkElement, propName: string) => {
    return (target.constructor as typeof QuarkElement).createProperty(
      propName,
      options
    );
  };
};

export const internalProp = () => {
  return (target: QuarkElement, propName: string) => {
    return (target.constructor as typeof QuarkElement).createProperty(propName, { internal: true });
  };
};

export const state = () => {
  return (target: QuarkElement, propName: string) => {
    (target.constructor as typeof QuarkElement).createState(propName);
  };
};

export const computed = () => {
  return (target: QuarkElement, propName: string, descriptor: PropertyDescriptor) => {
    let watcher: Watcher;
    return {
      configurable: true,
      enumerable: true,
      get(this: QuarkElement) {
        if (!watcher) {
          watcher = new Watcher(this, descriptor.get!, { computed: true });
        }

        watcher.dep.depend();
        return watcher.get();
      },
    };
  };
};

export const watch = (path: string, options?: Omit<UserWatcherOptions, 'cb'>) => {
  return (target: QuarkElement, propName: string, descriptor: PropertyDescriptor) => {
    return (target.constructor as typeof QuarkElement).watch(
      propName,
      descriptor,
      path,
      options,
    );
  };
}

type PropertyDescriptorCreator = (defaultValue?: any) => PropertyDescriptor

/** convert attribute value to prop value */
type Attr2PropConverter = (value: string | null) => any

const ComputedDescriptors: DblKeyMap<
  typeof QuarkElement,
  string,
  PropertyDescriptorCreator
> = new DblKeyMap();

const UserWatchers: DblKeyMap<
  typeof QuarkElement,
  string,
  {
    path: string;
  } & UserWatcherOptions
> = new DblKeyMap();

function getWrapperClass(target: typeof QuarkElement, style: string) {
  return class QuarkElementWrapper extends target {
    static get _observedAttrs() {
      return Array.from(this._propDef.entries()).filter((def) => !!def[1].options.observed);
    }

    /** ! HTML SPEC field: specify the attribute names to watch for changes */
    static get observedAttributes() {
      return this._observedAttrs.map(def => def[0]);
    }

    static _isInternalProp(propName: string) {
      const def = this._propDef.get(propName);
      return def
        ? !!def.options.internal
        : false;
    }

    static _isBoolProp(attrName: string) {
      const def = this._propDef.get(attrName);

      if (!def) {
        return false;
      }

      return def.options.type === Boolean;
    }

    constructor() {
      super();

      const shadowRoot = this.attachShadow({ mode: "open" });

      if (shadowRoot) {
        // Create Css
        if (typeof CSSStyleSheet === "function" && shadowRoot.adoptedStyleSheets) {
          // Use constructed style first
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(style);
          shadowRoot.adoptedStyleSheets = [sheet];
        } else {
          // Fallback
          const styleEl = document.createElement("style");
          styleEl.innerHTML = style;
          shadowRoot.append(styleEl);
        }
      }
      const {
        _stateDesc,
        _propDef,
      } = target

      if (_stateDesc.size) {
        _stateDesc.forEach((descriptorCreator, propName) => {
          Object.defineProperty(
            this,
            propName,
            descriptorCreator(this[propName])
          );
        });
      }

      /**
       * 重写类的属性描述符，并重写属性初始值。
       * 注：由于子类的属性初始化晚于当前基类的构造函数，同名属性会导致属性描述符被覆盖，所以必须放在基类构造函数之后执行
       */
      if (_propDef.size) {
        _propDef.forEach((def, attrName) => {
          const {
            options: {
              type,
              converter,
              internal,
            },
            propName,
          } = def;
          const defaultValue = this[propName];

          if (internal) {
            Object.defineProperty(
              this,
              propName,
              target.getStateDescriptor(propName)(defaultValue)
            );
            return;
          }

          const isBoolProp = type === Boolean;
          /** convert attribute's value to its decorated counterpart, that is, property's value */
          const convertAttrValue = (value: string | null) => {
            // * For boolean properties, ignore the defaultValue specified.
            // * We should always respect to whether the boolean attribute is set.
            if (
              !isBoolProp
              && isEmpty(value)
              && !isEmpty(defaultValue)
            ) {
              return defaultValue;
            }

            if (isFunction(converter)) {
              return converter(value, type);
            }

            return value;
          };
          const dep = new Dep();
          this._props.set(attrName, {
            propName,
            dep,
            converter: convertAttrValue,
          })
          // make attribute reactive
          Object.defineProperty(
            this,
            propName,
            {
              get(this: QuarkElement) {
                dep.depend()
                return convertAttrValue(this.getAttribute(attrName));
              },
              set(this: QuarkElement, val: string | boolean | null) {
                if (val) {
                  if (typeof val === 'boolean') {
                    this.setAttribute(attrName, '');
                  } else {
                    this.setAttribute(attrName, val);
                  }
                } else {
                  this.removeAttribute(attrName);
                }
              },
              configurable: true,
              enumerable: true,
            }
          );
        });
      }

      const computedDescriptors = ComputedDescriptors.get(target)

      if (computedDescriptors?.size) {
        computedDescriptors.forEach((descriptorCreator, propKey) => {
          Object.defineProperty(
            this,
            propKey,
            descriptorCreator()
          );
        });
      }

      const watchers = UserWatchers.get(target)

      if (watchers?.size) {
        watchers.forEach(({
          path,
          ...options
        }, propName) => {
          new Watcher(this, path, {
            ...options,
            cb: (...args) => this[propName](...args),
          });
        });
      }
    }
  }
}

type QuarkElementWrapper = ReturnType<typeof getWrapperClass>

export function customElement(
  params: string | { tag: string; style?: string }
) {
  const {
    tag,
    style = '',
  } = typeof params === 'string'
      ? { tag: params }
      : params;

  // * target: User-defined class that to be decorated
  return (target: typeof QuarkElement) => {
    if (!customElements.get(tag)) {
      customElements.define(tag, getWrapperClass(target, style));
    }
  };
}

export class QuarkElement extends HTMLElement implements ReactiveControllerHost {
  /** Save descriptors of properties decorated by \@state decorator */
  static _stateDesc = new Map<
    string,
    PropertyDescriptorCreator
  >;

  /** Save definition of \@property decorator, with HTML attribute name as key */
  static _propDef = new Map<
    string,
    {
      /** prop decorator options passed */
      options: PropertyDeclaration;
      /** created dependency for the prop, it's initialization will be delayed until Object.defineProperty */
      propName: string;
    }
  >;

  static h = h;

  static Fragment = Fragment;

  /** Save configuration of \@property decorated properties, with their HTML attribute name as key */
  _props = new Map<string, {
    /** created dependency for the prop */
    dep: Dep;
    converter: Attr2PropConverter;
    propName: string;
  }>

  private _updatedQueue: (() => void)[] = [];

  /** did component already mounted 组件是否已挂载 */
  private _mounted = false;

  private _renderWatcher: Watcher | undefined = undefined;

  private queueUpdated(cb: () => void) {
    this._updatedQueue.push(cb)
  }

  private hasOwnLifeCycleMethod(methodName: 'componentDidMount' | 'componentDidUpdate' | 'shouldComponentUpdate' | 'componentUpdated' | 'componentWillUnmount'): boolean {
    return Object.getPrototypeOf(
      this.constructor // base class
    ) // wrapper class
      .prototype // user-defined class
      .hasOwnProperty(methodName);
  }

  private hasDidUpdateCb() {
    return this.hasOwnLifeCycleMethod('componentDidUpdate');
  }

  /** handler for processing tasks after render */
  public postRender() {
    let mounted = this._mounted;
    this._controllers.forEach((c) => c[mounted ? 'hostUpdated' : 'hostMounted']?.());

    if (!mounted) {
      this._mounted = true;
      const hasPendingUpdate = !!this._updatedQueue.length;

      if (this.hasOwnLifeCycleMethod('componentDidMount')) {
        if (hasPendingUpdate) {
          // * when componentDidMount and componentDidUpate are both defined
          // * componentDidUpate should be ignored at mount phase
          this._updatedQueue = [];
          this.componentDidMount();
          return;
        }

        this.componentDidMount();
      } else {
        // * for historic reasons, componentDidUpate was used for both mounting and updating
        // * so we should also call it at mount phase
        if (process.env.NODE_ENV === 'development') {
          if (hasPendingUpdate) {
            console.warn('by design, componentDidUpdate should not be invoked at mount phase, use componentDidMount for initialization logic instead.');
          }
        }
      }
    }

    this._updatedQueue.forEach(cb => cb());
    this._updatedQueue = [];

    if (mounted) {
      if (this.hasOwnLifeCycleMethod('componentUpdated')) {
        this.componentUpdated();
      }
    }
  }

  // 内部属性装饰器
  protected static getStateDescriptor(propName: string) {
    return (defaultValue?: any) => {
      let value = defaultValue;
      const dep = new Dep()
      return {
        get(this: QuarkElement): any {
          dep.depend()
          return value;
        },
        set(this: QuarkElement, newValue: string | boolean | null) {
          const resolvedOldVal = value;

          if (Object.is(resolvedOldVal, newValue)) {
            return;
          }

          if (this.shouldPreventUpdate(propName, resolvedOldVal, newValue)) {
            return;
          }

          value = newValue;
          dep.notify();

          if (this.hasDidUpdateCb()) {
            this.queueUpdated(() => {
              this.componentDidUpdate(propName, resolvedOldVal, newValue);
            });
          }
        },
        configurable: true,
        enumerable: true,
      };
    };
  }

  static createProperty(propName: string, options: PropertyDeclaration) {
    const attrName = options.attribute || propName;
    this._propDef.set(attrName, {
      options: {
        ...defaultPropertyDeclaration,
        ...options,
        ...(options.internal ? { observed: false } : null),
      },
      propName,
    });
  }

  static createState(propName: string) {
    this._stateDesc.set(propName, this.getStateDescriptor(propName))
  }

  static computed(propName: string, descriptor: PropertyDescriptor) {
    if (descriptor.get) {
      ComputedDescriptors.set(this, propName, () => {
        let watcher: Watcher;
        return {
          configurable: true,
          enumerable: true,
          get(this: QuarkElement) {
            if (!watcher) {
              watcher = new Watcher(this, descriptor.get!, { computed: true });
            }

            watcher.dep.depend();
            return watcher.get();
          },
        };
      });
    }
  }

  static watch(
    propName: string,
    descriptor: PropertyDescriptor,
    path: string,
    options?: UserWatcherOptions,
  ) {
    if (isFunction(descriptor.value)) {
      UserWatchers.set(this, propName, {
        ...options,
        path,
      });
    }
  }

  private eventController: EventController = new EventController();

  private _controllers = new Set<ReactiveController>;

  private rootPatch = (newRootVNode: any) => {
    if (this.shadowRoot) {
      render(newRootVNode, this.shadowRoot);
    }
  };

  private _render() {
    const newRootVNode = this.render();
    this.rootPatch(newRootVNode);
  }

  /** update properties by DOM attributes' changes */
  private _updateObservedProps() {
    (this.constructor as QuarkElementWrapper)._observedAttrs.forEach(
      ([attrName, {
        propName,
        options: {
          type,
          converter,
        },
      }]) => {
        let val = this.getAttribute(attrName);

        if (isFunction(converter)) {
          val = converter(val, type);
        }

        this[propName] = val;
      }
    );
  }

  /**
   * Registers a `ReactiveController` to participate in the element's reactive
   * update cycle. The element automatically calls into any registered
   * controllers during its lifecycle callbacks.
   *
   * If the element is connected when `addController()` is called, the
   * controller's `hostConnected()` callback will be immediately called.
   * @category controllers
   */
  addController(controller: ReactiveController) {
    this._controllers.add(controller);
    if (this.shadowRoot && this.isConnected) {
      controller.hostConnected?.();
    }
  }

  /**
   * Removes a `ReactiveController` from the element.
   * @category controllers
   */
  removeController(controller: ReactiveController) {
    this._controllers.delete(controller);
  }

  // Reserve, may expand in the future
  requestUpdate() {
    this.getOrInitRenderWatcher().update();
  }

  // Reserve, may expand in the future
  update() {
    this.getOrInitRenderWatcher().update()
  }

  $on = (eventName: string, eventHandler: EventHandler, el?: Element) => {
    return this.eventController.bindListener(
      el || this,
      eventName,
      eventHandler
    );
  };

  $emit<T>(eventName: string, customEventInit?: CustomEventInit<T>) {
    return this.dispatchEvent(
      new CustomEvent(
        eventName,
        Object.assign({ bubbles: true }, customEventInit)
      )
    );
  }

  $nextTick(cb?: (...args: any[]) => any) {
    return nextTick(cb, this);
  }

  /**
   * 此时组件 dom 已插入到页面中，等同于 connectedCallback() { super.connectedCallback(); }
   */
  componentDidMount() { }

  /**
   * disconnectedCallback 触发时、dom 移除前执行，等同于 disconnectedCallback() { super.disconnectedCallback(); }
   */
  componentWillUnmount() { }

  /**
   * @deprecated
   * since we have embraced more precisely controlled render scheduler mechanism,
   * there's no need to use shouldComponentUpdate any more,
   * and will be removed in next major version.
   * 
   * 控制当前属性变化是否导致组件渲染
   * @param propName 属性名
   * @param oldValue 属性旧值
   * @param newValue 属性新值
   * @returns boolean
   */
  shouldComponentUpdate(propName: string, oldValue: any, newValue: any) {
    return oldValue !== newValue;
  }

  shouldPreventUpdate(propName: string, oldValue: any, newValue: any) {
    if (this.hasOwnLifeCycleMethod('shouldComponentUpdate')) {
      return !this.shouldComponentUpdate(
        propName,
        oldValue,
        newValue,
      );
    }

    return false;
  }

  /** @deprecated use \@watch directive instead for same purposes */
  componentDidUpdate(propName: string, oldValue: any, newValue: any) { }

  /** called when all props and states updated */
  componentUpdated() { }

  /**
   * 组件的 render 方法，返回组件的VDOM
   */
  render(): VElem {
    return null;
  }

  private getOrInitRenderWatcher() {
    if (!this._renderWatcher) {
      this._renderWatcher = new Watcher(
        this,
        () => {
          this._render();
          this.postRender();
        },
        { render: true },
      );
    }

    return this._renderWatcher
  }

  connectedCallback() {
    this._updateObservedProps();
    this._controllers.forEach((c) => c.hostConnected?.());
    this.getOrInitRenderWatcher();
    if (!this._mounted) {
      this.postRender()
    }
  }

  /** log old 'false' attribute value before resetting and removing it */
  private _oldVals: Map<string, string | undefined> = new Map()

  attributeChangedCallback(attrName: string, oldVal: string, newVal: string) {
    const prop = this._props.get(attrName);

    if (!prop) {
      return;
    }

    const { propName } = prop;

    // React specific patch, for more detailed explanation: https://github.com/facebook/react/issues/9230
    // But also works for unintentionally set attribute value to string 'false', it's not recommended in HTML spec.
    // For custom elements, react will pass down the boolean value as-is, that is,
    // the attribute value will be string 'true' or 'false', they all will be treated as true by HTML spec.
    // We should remove the attribute when its value is 'false' to prevent ambiguity and line up with HTML spec.
    // One more thing, in CSS boolean attribute with value 'false' will match the attribute selector [attr].
    // 
    // 对于自定义元素，React会直接将布尔值属性传递下去
    // 这时候这里的value会是字符串'true'或'false'，对于'false'我们需要手动将该属性从自定义元素上移除
    // 以避免CSS选择器将[attr="false"]视为等同于[attr]
    if (newVal !== oldVal) {
      if ((this.constructor as QuarkElementWrapper)._isBoolProp(attrName)) {
        if (newVal === 'false') {
          if (this.hasDidUpdateCb()) {
            this._oldVals.set(propName, oldVal)
          }

          this[propName] = newVal;
          return;
        }
      }
    }

    const newValue = this[propName];
    let resolvedOldVal = oldVal
    let oldValReset = this._oldVals.get(propName)

    if (oldValReset) {
      this._oldVals.delete(propName)
      resolvedOldVal = oldValReset
    }

    resolvedOldVal = prop.converter(resolvedOldVal);

    if (this.shouldPreventUpdate(propName, resolvedOldVal, newValue)) {
      return;
    }

    // notify changes to this prop's watchers
    prop.dep.notify()

    if (this.hasDidUpdateCb()) {
      this.queueUpdated(() => {
        this.componentDidUpdate(
          propName,
          resolvedOldVal,
          newValue,
        );
      });
    }
  }

  // ! we can't know if custom element was removed entierlly or just disconnected from the document temporarily
  // it may be inserted into the document later
  // so we can't just simply do cleanup logic inside `disconnectedCallback`
  // or we should revert the cleanup works after next time `connectedCallback` called
  disconnectedCallback() {
    if (this.hasOwnLifeCycleMethod('componentWillUnmount')) {
      this.componentWillUnmount();
    }

    this._controllers.forEach((c) => c.hostDisconnected?.());
    this._mounted = false;
  }
}
